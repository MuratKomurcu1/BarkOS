import { z } from 'zod'
import {
  BARKOS_MAX_OBJECTIVES,
  BARKOS_MAX_PLANS,
  BARKOS_MAX_DISPATCHES,
  BARKOS_MAX_TASKS_PER_PLAN,
  BARKOS_WORK_LEDGER_SCHEMA_VERSION,
  barkosObjectiveSchema,
  barkosDispatchSchema,
  barkosPlanSchema,
  barkosTaskSchema,
  barkosWorkLedgerSchema,
  parseBarkosWorkLedger,
  type BarkosApprovalGate,
  type BarkosWorkLedger
} from './work-ledger'
import { barkosRiskRequiresDispatchApproval } from './task-authority'

type WorkLedgerMigration = (value: unknown) => unknown

export type BarkosWorkLedgerMigrationErrorCode =
  | 'invalid-snapshot'
  | 'invalid-version'
  | 'unsupported-version'

export class BarkosWorkLedgerMigrationError extends Error {
  constructor(
    readonly code: BarkosWorkLedgerMigrationErrorCode,
    message: string,
    readonly version: number | null,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'BarkosWorkLedgerMigrationError'
  }
}

const barkosObjectiveV1Schema = barkosObjectiveSchema.omit({ orchestrationBinding: true })
const barkosTaskV1Schema = barkosTaskSchema.omit({ orchestrationTaskId: true })
const barkosDispatchV4Schema = barkosDispatchSchema.omit({ stop: true })
const barkosDispatchV3Schema = barkosDispatchV4Schema.omit({ memoryDelivery: true })
const barkosPlanV1Schema = barkosPlanSchema.extend({
  tasks: z.array(barkosTaskV1Schema).min(1).max(BARKOS_MAX_TASKS_PER_PLAN)
})

const barkosWorkLedgerV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    companyId: barkosWorkLedgerSchema.shape.companyId,
    objectives: z.array(barkosObjectiveV1Schema).max(BARKOS_MAX_OBJECTIVES),
    plans: z.array(barkosPlanV1Schema).max(BARKOS_MAX_PLANS),
    assignments: barkosWorkLedgerSchema.shape.assignments,
    dispatches: z.array(barkosDispatchV3Schema).max(BARKOS_MAX_DISPATCHES),
    evidence: barkosWorkLedgerSchema.shape.evidence,
    approvalGates: barkosWorkLedgerSchema.shape.approvalGates,
    createdAt: barkosWorkLedgerSchema.shape.createdAt,
    updatedAt: barkosWorkLedgerSchema.shape.updatedAt
  })
  .strict()

const barkosWorkLedgerV0Schema = barkosWorkLedgerV1Schema
  .omit({ approvalGates: true, schemaVersion: true })
  .extend({ schemaVersion: z.literal(0) })
  .strict()

const barkosWorkLedgerV2Schema = z
  .object({
    ...barkosWorkLedgerSchema.shape,
    schemaVersion: z.literal(2),
    dispatches: z.array(barkosDispatchV3Schema).max(BARKOS_MAX_DISPATCHES)
  })
  .strict()

const barkosWorkLedgerV3Schema = z
  .object({
    ...barkosWorkLedgerSchema.shape,
    schemaVersion: z.literal(3),
    dispatches: z.array(barkosDispatchV3Schema).max(BARKOS_MAX_DISPATCHES)
  })
  .strict()

const barkosWorkLedgerV4Schema = z
  .object({
    ...barkosWorkLedgerSchema.shape,
    schemaVersion: z.literal(4),
    dispatches: z.array(barkosDispatchV4Schema).max(BARKOS_MAX_DISPATCHES)
  })
  .strict()

function migrateV0ToV1(value: unknown): unknown {
  const snapshot = barkosWorkLedgerV0Schema.parse(value)
  return {
    ...snapshot,
    schemaVersion: 1,
    approvalGates: []
  }
}

function migrateV1ToV2(value: unknown): unknown {
  const snapshot = barkosWorkLedgerV1Schema.parse(value)
  return {
    ...snapshot,
    schemaVersion: 2,
    revision: 0,
    objectives: snapshot.objectives.map((objective) => ({
      ...objective,
      orchestrationBinding: null
    })),
    plans: snapshot.plans.map((plan) => ({
      ...plan,
      tasks: plan.tasks.map((task) => ({ ...task, orchestrationTaskId: null }))
    }))
  }
}

function migratedDispatchGateId(assignmentId: string, usedIds: Set<string>): string {
  const prefix = 'dispatch-gate-'
  for (let sequence = 1; sequence <= 2_001; sequence += 1) {
    const suffix = `-${sequence}`
    const candidate = `${prefix}${assignmentId
      .slice(0, 64 - prefix.length - suffix.length)
      .replace(/-+$/g, '')}${suffix}`
    if (!usedIds.has(candidate)) {
      usedIds.add(candidate)
      return candidate
    }
  }
  throw new RangeError('Could not allocate a migrated dispatch gate identifier')
}

function migrateV2ToV3(value: unknown): unknown {
  const snapshot = barkosWorkLedgerV2Schema.parse(value)
  const historicalDispatchTaskIds = new Set(
    snapshot.assignments
      .filter((assignment) => ['dispatched', 'completed'].includes(assignment.status))
      .map((assignment) => assignment.taskId)
  )
  const protectedTaskIds = new Set<string>()
  const plans = snapshot.plans.map((plan) => ({
    ...plan,
    tasks: plan.tasks.map((task) => {
      if (
        !barkosRiskRequiresDispatchApproval(task.risk) ||
        historicalDispatchTaskIds.has(task.id)
      ) {
        return task
      }
      protectedTaskIds.add(task.id)
      return { ...task, approvalPolicy: 'before-dispatch' as const }
    })
  }))
  const objectiveAuthors = new Map(
    snapshot.objectives.map((objective) => [objective.id, objective.createdByWorkerId])
  )
  const tasks = new Map(plans.flatMap((plan) => plan.tasks.map((task) => [task.id, task])))
  const existingGateAssignments = new Set(
    snapshot.approvalGates
      .filter((gate) => gate.kind === 'dispatch' && gate.assignmentId !== null)
      .map((gate) => gate.assignmentId as string)
  )
  const usedGateIds = new Set(snapshot.approvalGates.map((gate) => gate.id))
  const migratedGates: BarkosApprovalGate[] = []
  for (const assignment of snapshot.assignments) {
    if (
      assignment.status !== 'approved' ||
      !protectedTaskIds.has(assignment.taskId) ||
      existingGateAssignments.has(assignment.id)
    ) {
      continue
    }
    const task = tasks.get(assignment.taskId)
    const requestedByWorkerId = task ? objectiveAuthors.get(task.objectiveId) : undefined
    if (!task || !requestedByWorkerId) {
      continue
    }
    migratedGates.push({
      id: migratedDispatchGateId(assignment.id, usedGateIds),
      taskId: task.id,
      assignmentId: assignment.id,
      kind: 'dispatch',
      status: 'pending',
      question: `Allow ${assignment.workerId} to start ${task.title}?`,
      requestedByWorkerId,
      resolution: null,
      resolvedBy: null,
      createdAt: assignment.assignedAt,
      resolvedAt: null
    })
  }
  return {
    ...snapshot,
    schemaVersion: 3,
    plans,
    approvalGates: [...snapshot.approvalGates, ...migratedGates]
  }
}

function migrateV3ToV4(value: unknown): unknown {
  const snapshot = barkosWorkLedgerV3Schema.parse(value)
  return {
    ...snapshot,
    schemaVersion: 4,
    dispatches: snapshot.dispatches.map((dispatch) => ({ ...dispatch, memoryDelivery: null }))
  }
}

function migrateV4ToV5(value: unknown): unknown {
  const snapshot = barkosWorkLedgerV4Schema.parse(value)
  return {
    ...snapshot,
    schemaVersion: 5,
    dispatches: snapshot.dispatches.map((dispatch) => ({ ...dispatch, stop: null }))
  }
}

const WORK_LEDGER_MIGRATIONS: Readonly<Partial<Record<number, WorkLedgerMigration>>> = {
  0: migrateV0ToV1,
  1: migrateV1ToV2,
  2: migrateV2ToV3,
  3: migrateV3ToV4,
  4: migrateV4ToV5
}

function readSchemaVersion(value: unknown): number {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('schemaVersion' in value) ||
    typeof value.schemaVersion !== 'number' ||
    !Number.isInteger(value.schemaVersion) ||
    value.schemaVersion < 0
  ) {
    throw new BarkosWorkLedgerMigrationError(
      'invalid-version',
      'BarkOS work ledger has an invalid schema version',
      null
    )
  }
  return value.schemaVersion
}

export type BarkosWorkLedgerMigrationResult = {
  ledger: BarkosWorkLedger
  migratedFromVersion: number | null
}

export function migrateBarkosWorkLedgerSnapshot(value: unknown): BarkosWorkLedgerMigrationResult {
  const initialVersion = readSchemaVersion(value)
  if (initialVersion > BARKOS_WORK_LEDGER_SCHEMA_VERSION) {
    throw new BarkosWorkLedgerMigrationError(
      'unsupported-version',
      `BarkOS work ledger version ${initialVersion} is newer than supported version ${BARKOS_WORK_LEDGER_SCHEMA_VERSION}`,
      initialVersion
    )
  }

  let currentValue = value
  let currentVersion = initialVersion
  while (currentVersion < BARKOS_WORK_LEDGER_SCHEMA_VERSION) {
    const migration = WORK_LEDGER_MIGRATIONS[currentVersion]
    if (!migration) {
      throw new BarkosWorkLedgerMigrationError(
        'unsupported-version',
        `BarkOS work ledger version ${currentVersion} has no migration path`,
        currentVersion
      )
    }
    try {
      currentValue = migration(currentValue)
    } catch (error) {
      throw new BarkosWorkLedgerMigrationError(
        'invalid-snapshot',
        `BarkOS work ledger version ${currentVersion} failed migration validation`,
        currentVersion,
        { cause: error }
      )
    }
    const nextVersion = readSchemaVersion(currentValue)
    if (nextVersion !== currentVersion + 1) {
      throw new BarkosWorkLedgerMigrationError(
        'invalid-snapshot',
        `BarkOS work ledger migration from version ${currentVersion} did not advance exactly one version`,
        currentVersion
      )
    }
    currentVersion = nextVersion
  }

  try {
    return {
      ledger: parseBarkosWorkLedger(currentValue),
      migratedFromVersion:
        initialVersion === BARKOS_WORK_LEDGER_SCHEMA_VERSION ? null : initialVersion
    }
  } catch (error) {
    throw new BarkosWorkLedgerMigrationError(
      'invalid-snapshot',
      'BarkOS work ledger failed current contract validation',
      currentVersion,
      { cause: error }
    )
  }
}
