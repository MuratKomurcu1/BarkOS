import { z } from 'zod'
import { barkosEntityIdSchema, barkosLabelSchema, barkosStatementSchema } from './company'
import { barkosDispatchStopSchema, type BarkosDispatchStop } from './dispatch-stop'
import { validateBarkosWorkLedger } from './work-ledger-validation'

export const BARKOS_WORK_LEDGER_SCHEMA_VERSION = 5 as const
export const BARKOS_MAX_OBJECTIVES = 100
export const BARKOS_MAX_PLANS = 200
export const BARKOS_MAX_TASKS_PER_PLAN = 100
export const BARKOS_MAX_ASSIGNMENTS = 2_000
export const BARKOS_MAX_DISPATCHES = 6_000
export const BARKOS_MAX_EVIDENCE_MANIFESTS = 2_000
export const BARKOS_MAX_APPROVAL_GATES = 2_000
export const BARKOS_MAX_DISPATCH_ATTEMPTS = 3
export const BARKOS_MAX_MEMORY_IDS_PER_DELIVERY = 100

const timestampSchema = z.number().int().nonnegative()
const nullableTimestampSchema = timestampSchema.nullable()
const externalIdSchema = z.string().trim().min(1).max(256)
const capabilitySchema = z.string().trim().min(1).max(80)
const taskSpecSchema = z.string().trim().min(1).max(12_000)
const pathSchema = z.string().trim().min(1).max(2_048)
const shortSummarySchema = z.string().trim().min(1).max(1_000)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const barkosOrchestrationBindingSchema = z
  .object({
    runId: externalIdSchema,
    runtimeEnvironmentId: externalIdSchema.nullable()
  })
  .strict()

export const barkosObjectiveSchema = z
  .object({
    id: barkosEntityIdSchema,
    companyId: barkosEntityIdSchema,
    title: barkosLabelSchema,
    brief: z.string().trim().min(1).max(8_000),
    status: z.enum(['draft', 'planned', 'active', 'review', 'completed', 'failed', 'cancelled']),
    activePlanId: barkosEntityIdSchema.nullable(),
    orchestrationBinding: barkosOrchestrationBindingSchema.nullable(),
    createdByWorkerId: barkosEntityIdSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .strict()

export const barkosTaskSchema = z
  .object({
    id: barkosEntityIdSchema,
    objectiveId: barkosEntityIdSchema,
    planId: barkosEntityIdSchema,
    title: barkosLabelSchema,
    spec: taskSpecSchema,
    requiredCapabilities: z.array(capabilitySchema).max(20),
    dependencyIds: z.array(barkosEntityIdSchema).max(50),
    status: z.enum([
      'draft',
      'blocked',
      'ready',
      'assigned',
      'running',
      'review',
      'completed',
      'failed',
      'cancelled'
    ]),
    workspacePolicy: z.enum(['inherit', 'folder', 'worktree', 'isolated-worktree']),
    preferredEnvironmentId: z.string().trim().min(1).max(160).nullable(),
    risk: z.enum(['low', 'medium', 'high', 'critical']),
    approvalPolicy: z.enum(['none', 'before-dispatch']),
    orchestrationTaskId: externalIdSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .strict()

export const barkosPlanSchema = z
  .object({
    id: barkosEntityIdSchema,
    objectiveId: barkosEntityIdSchema,
    version: z.number().int().min(1).max(10_000),
    status: z.enum(['draft', 'approved', 'active', 'completed', 'superseded']),
    createdByWorkerId: barkosEntityIdSchema,
    tasks: z.array(barkosTaskSchema).min(1).max(BARKOS_MAX_TASKS_PER_PLAN),
    createdAt: timestampSchema,
    approvedAt: nullableTimestampSchema
  })
  .strict()

export const barkosAssignmentSchema = z
  .object({
    id: barkosEntityIdSchema,
    taskId: barkosEntityIdSchema,
    workerId: barkosEntityIdSchema,
    status: z.enum(['proposed', 'approved', 'dispatched', 'completed', 'rejected', 'reassigned']),
    reason: barkosStatementSchema,
    matchedCapabilities: z.array(capabilitySchema).max(20),
    activeLoadAtAssignment: z.number().int().nonnegative().max(100),
    assignedAt: timestampSchema,
    approvedAt: nullableTimestampSchema
  })
  .strict()

export const barkosDispatchMemoryDeliverySchema = z
  .object({
    receiptId: barkosEntityIdSchema,
    state: z.enum(['prepared', 'delivered', 'unconfirmed']),
    memoryIds: z.array(barkosEntityIdSchema).min(1).max(BARKOS_MAX_MEMORY_IDS_PER_DELIVERY),
    contextSha256: sha256Schema,
    characterCount: z.number().int().min(1).max(8_000),
    preparedAt: timestampSchema,
    deliveredAt: nullableTimestampSchema
  })
  .strict()
  .superRefine((delivery, context) => {
    if ((delivery.state === 'delivered') !== (delivery.deliveredAt !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Only delivered memory context has a delivery time',
        path: ['deliveredAt']
      })
    }
    if (delivery.deliveredAt !== null && delivery.deliveredAt < delivery.preparedAt) {
      context.addIssue({
        code: 'custom',
        message: 'Memory context cannot be delivered before preparation',
        path: ['deliveredAt']
      })
    }
    if (new Set(delivery.memoryIds).size !== delivery.memoryIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Memory delivery contains duplicate memory ids',
        path: ['memoryIds']
      })
    }
  })

export const barkosDispatchSchema = z
  .object({
    id: barkosEntityIdSchema,
    assignmentId: barkosEntityIdSchema,
    taskId: barkosEntityIdSchema,
    workerId: barkosEntityIdSchema,
    attempt: z.number().int().min(1).max(BARKOS_MAX_DISPATCH_ATTEMPTS),
    state: z.enum([
      'prepared',
      'requested',
      'running',
      'succeeded',
      'failed',
      'circuit-broken',
      'cancelled'
    ]),
    workspaceId: externalIdSchema,
    executionHostId: externalIdSchema,
    orchestrationRunId: externalIdSchema.nullable(),
    orchestrationTaskId: externalIdSchema.nullable(),
    orchestrationDispatchId: externalIdSchema.nullable(),
    memoryDelivery: barkosDispatchMemoryDeliverySchema.nullable(),
    stop: barkosDispatchStopSchema.nullable(),
    error: z.string().trim().min(1).max(2_000).nullable(),
    createdAt: timestampSchema,
    startedAt: nullableTimestampSchema,
    finishedAt: nullableTimestampSchema
  })
  .strict()

const barkosTestEvidenceSchema = z
  .object({
    command: z.string().trim().min(1).max(2_000),
    status: z.enum(['passed', 'failed', 'skipped']),
    summary: shortSummarySchema,
    durationMs: z.number().int().nonnegative().max(86_400_000).nullable()
  })
  .strict()

const barkosChangedFileEvidenceSchema = z
  .object({
    path: pathSchema,
    change: z.enum(['added', 'modified', 'deleted', 'renamed']),
    summary: shortSummarySchema.nullable()
  })
  .strict()

const barkosTerminalEvidenceSchema = z
  .object({
    label: barkosLabelSchema,
    excerpt: z.string().trim().min(1).max(4_000)
  })
  .strict()

const barkosScreenshotEvidenceSchema = z
  .object({
    path: pathSchema,
    caption: shortSummarySchema,
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable()
  })
  .strict()

export const barkosEvidenceManifestSchema = z
  .object({
    id: barkosEntityIdSchema,
    taskId: barkosEntityIdSchema,
    assignmentId: barkosEntityIdSchema,
    dispatchId: barkosEntityIdSchema,
    status: z.enum(['draft', 'submitted', 'accepted', 'rejected']),
    tests: z.array(barkosTestEvidenceSchema).max(100),
    changedFiles: z.array(barkosChangedFileEvidenceSchema).max(500),
    diffSummary: z.string().trim().min(1).max(8_000).nullable(),
    terminalExcerpts: z.array(barkosTerminalEvidenceSchema).max(20),
    screenshots: z.array(barkosScreenshotEvidenceSchema).max(20),
    risks: z.array(barkosStatementSchema).max(20),
    unresolvedDecisions: z.array(barkosStatementSchema).max(20),
    producedAt: timestampSchema,
    reviewedAt: nullableTimestampSchema
  })
  .strict()

export const barkosApprovalGateSchema = z
  .object({
    id: barkosEntityIdSchema,
    taskId: barkosEntityIdSchema,
    assignmentId: barkosEntityIdSchema.nullable(),
    kind: z.enum(['plan', 'dispatch', 'external-action', 'destructive-action', 'budget']),
    status: z.enum(['pending', 'approved', 'rejected', 'expired']),
    question: barkosStatementSchema,
    requestedByWorkerId: barkosEntityIdSchema,
    resolution: z.string().trim().min(1).max(2_000).nullable(),
    resolvedBy: z.literal('user').nullable(),
    createdAt: timestampSchema,
    resolvedAt: nullableTimestampSchema
  })
  .strict()

export const barkosWorkLedgerSchema = z
  .object({
    schemaVersion: z.literal(BARKOS_WORK_LEDGER_SCHEMA_VERSION),
    companyId: barkosEntityIdSchema,
    objectives: z.array(barkosObjectiveSchema).max(BARKOS_MAX_OBJECTIVES),
    plans: z.array(barkosPlanSchema).max(BARKOS_MAX_PLANS),
    assignments: z.array(barkosAssignmentSchema).max(BARKOS_MAX_ASSIGNMENTS),
    dispatches: z.array(barkosDispatchSchema).max(BARKOS_MAX_DISPATCHES),
    evidence: z.array(barkosEvidenceManifestSchema).max(BARKOS_MAX_EVIDENCE_MANIFESTS),
    approvalGates: z.array(barkosApprovalGateSchema).max(BARKOS_MAX_APPROVAL_GATES),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    createdAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .strict()
  .superRefine(validateBarkosWorkLedger)

export type BarkosObjective = z.infer<typeof barkosObjectiveSchema>
export type BarkosTask = z.infer<typeof barkosTaskSchema>
export type BarkosPlan = z.infer<typeof barkosPlanSchema>
export type BarkosAssignment = z.infer<typeof barkosAssignmentSchema>
export type BarkosDispatchMemoryDelivery = z.infer<typeof barkosDispatchMemoryDeliverySchema>
export type { BarkosDispatchStop }
export type BarkosDispatch = z.infer<typeof barkosDispatchSchema>
export type BarkosEvidenceManifest = z.infer<typeof barkosEvidenceManifestSchema>
export type BarkosApprovalGate = z.infer<typeof barkosApprovalGateSchema>
export type BarkosWorkLedger = z.infer<typeof barkosWorkLedgerSchema>

export function createEmptyBarkosWorkLedger(companyId: string, now = Date.now()): BarkosWorkLedger {
  return barkosWorkLedgerSchema.parse({
    schemaVersion: BARKOS_WORK_LEDGER_SCHEMA_VERSION,
    companyId,
    objectives: [],
    plans: [],
    assignments: [],
    dispatches: [],
    evidence: [],
    approvalGates: [],
    revision: 0,
    createdAt: now,
    updatedAt: now
  })
}

export function parseBarkosWorkLedger(value: unknown): BarkosWorkLedger {
  return barkosWorkLedgerSchema.parse(value)
}

export function safeParseBarkosWorkLedger(value: unknown): z.ZodSafeParseResult<BarkosWorkLedger> {
  return barkosWorkLedgerSchema.safeParse(value)
}
