import type { BarkosCompany } from './company'
import { selectBarkosWorkerForTask, type BarkosAssignmentPolicyDecision } from './assignment-policy'
import { nextBarkosLedgerRevision } from './orchestration-adapter-support'
import { barkosTaskRequiresDispatchApproval } from './task-authority'
import {
  parseBarkosWorkLedger,
  type BarkosApprovalGate,
  type BarkosAssignment,
  type BarkosTask,
  type BarkosWorkLedger
} from './work-ledger'

export type BarkosAssignmentFailureReason = Extract<
  BarkosAssignmentPolicyDecision,
  { ok: false }
>['reason']

export class BarkosAssignmentStateError extends Error {
  constructor(
    readonly code:
      | 'company-mismatch'
      | 'task-not-found'
      | 'task-not-ready'
      | 'task-not-materialized'
      | 'assignment-not-found'
      | 'assignment-not-approved'
      | 'dispatch-gate-not-found'
      | 'dispatch-gate-settled'
      | BarkosAssignmentFailureReason,
    message: string
  ) {
    super(message)
    this.name = 'BarkosAssignmentStateError'
  }
}

function findTask(ledger: BarkosWorkLedger, taskId: string): BarkosTask | undefined {
  return ledger.plans.flatMap((plan) => plan.tasks).find((task) => task.id === taskId)
}

function boundedEntityId(prefix: string, sourceId: string, suffix: string): string {
  const room = 64 - prefix.length - suffix.length
  const source = sourceId.slice(0, room).replace(/-+$/g, '')
  return `${prefix}${source}${suffix}`
}

function nextBoundedEntityId(prefix: string, sourceId: string, existingIds: Set<string>): string {
  for (let sequence = existingIds.size + 1; sequence <= existingIds.size + 2_001; sequence += 1) {
    const candidate = boundedEntityId(prefix, sourceId, `-${sequence}`)
    if (!existingIds.has(candidate)) {
      return candidate
    }
  }
  throw new RangeError(`Could not allocate a unique ${prefix} identifier`)
}

function nextAssignmentId(ledger: BarkosWorkLedger, taskId: string): string {
  return nextBoundedEntityId(
    'assignment-',
    taskId,
    new Set(ledger.assignments.map((assignment) => assignment.id))
  )
}

function nextDispatchGateId(ledger: BarkosWorkLedger, assignmentId: string): string {
  return nextBoundedEntityId(
    'dispatch-gate-',
    assignmentId,
    new Set(ledger.approvalGates.map((gate) => gate.id))
  )
}

function assignmentFailureMessage(
  decision: Extract<BarkosAssignmentPolicyDecision, { ok: false }>
): string {
  switch (decision.reason) {
    case 'task-already-assigned':
      return 'This task already has an active assignment'
    case 'no-eligible-workers':
      return 'No available or busy worker is eligible for this task'
    case 'no-worker-capacity':
      return 'Every capable worker is at the active-assignment limit'
    case 'capabilities-uncovered':
      return `No worker covers all required capabilities${
        decision.missingCapabilities.length > 0
          ? `: ${decision.missingCapabilities.join(', ')}`
          : ''
      }`
  }
}

export function assignReadyBarkosTask(args: {
  ledger: BarkosWorkLedger
  company: BarkosCompany
  taskId: string
  maxActiveAssignmentsPerWorker?: number
  now?: number
}): { ledger: BarkosWorkLedger; assignment: BarkosAssignment } {
  const ledger = parseBarkosWorkLedger(args.ledger)
  if (ledger.companyId !== args.company.id) {
    throw new BarkosAssignmentStateError(
      'company-mismatch',
      'BarkOS work ledger does not match the active company'
    )
  }
  const task = findTask(ledger, args.taskId)
  if (!task) {
    throw new BarkosAssignmentStateError('task-not-found', `Task ${args.taskId} was not found`)
  }
  if (task.status !== 'ready') {
    throw new BarkosAssignmentStateError(
      'task-not-ready',
      `Task ${task.id} must be ready before assignment`
    )
  }
  if (!task.orchestrationTaskId) {
    throw new BarkosAssignmentStateError(
      'task-not-materialized',
      `Task ${task.id} must be prepared in BarkOS before assignment`
    )
  }

  const decision = selectBarkosWorkerForTask({
    company: args.company,
    task,
    assignments: ledger.assignments,
    maxActiveAssignments: args.maxActiveAssignmentsPerWorker
  })
  if (!decision.ok) {
    throw new BarkosAssignmentStateError(decision.reason, assignmentFailureMessage(decision))
  }

  const now = args.now ?? Date.now()
  const assignment: BarkosAssignment = {
    id: nextAssignmentId(ledger, task.id),
    taskId: task.id,
    workerId: decision.workerId,
    status: 'approved',
    reason: decision.rationale,
    matchedCapabilities: decision.matchedCapabilities,
    activeLoadAtAssignment: decision.activeAssignments,
    assignedAt: now,
    approvedAt: now
  }
  const gate: BarkosApprovalGate | null = barkosTaskRequiresDispatchApproval(task)
    ? {
        id: nextDispatchGateId(ledger, assignment.id),
        taskId: task.id,
        assignmentId: assignment.id,
        kind: 'dispatch',
        status: 'pending',
        question: `Allow ${decision.workerId} to start ${task.title}?`,
        requestedByWorkerId: args.company.leadWorkerId,
        resolution: null,
        resolvedBy: null,
        createdAt: now,
        resolvedAt: null
      }
    : null
  const next = nextBarkosLedgerRevision(
    ledger,
    {
      assignments: [...ledger.assignments, assignment],
      approvalGates: gate ? [...ledger.approvalGates, gate] : ledger.approvalGates
    },
    now
  )
  return {
    ledger: next,
    assignment: next.assignments.find((entry) => entry.id === assignment.id) ?? assignment
  }
}

export function decideBarkosDispatchGate(args: {
  ledger: BarkosWorkLedger
  assignmentId: string
  decision: 'approved' | 'rejected'
  resolution: string
  now?: number
}): BarkosWorkLedger {
  const ledger = parseBarkosWorkLedger(args.ledger)
  const assignment = ledger.assignments.find((entry) => entry.id === args.assignmentId)
  if (!assignment) {
    throw new BarkosAssignmentStateError(
      'assignment-not-found',
      `Assignment ${args.assignmentId} was not found`
    )
  }
  if (assignment.status !== 'approved') {
    throw new BarkosAssignmentStateError(
      'assignment-not-approved',
      `Assignment ${assignment.id} is not awaiting dispatch`
    )
  }
  const gate = ledger.approvalGates.find(
    (entry) =>
      entry.kind === 'dispatch' &&
      entry.assignmentId === assignment.id &&
      entry.taskId === assignment.taskId
  )
  if (!gate) {
    throw new BarkosAssignmentStateError(
      'dispatch-gate-not-found',
      `Assignment ${assignment.id} has no dispatch approval gate`
    )
  }
  if (gate.status !== 'pending') {
    throw new BarkosAssignmentStateError(
      'dispatch-gate-settled',
      `Dispatch approval gate ${gate.id} is already settled`
    )
  }
  const resolution = args.resolution.trim()
  if (!resolution) {
    throw new TypeError('Dispatch approval resolution is required')
  }
  const now = args.now ?? Date.now()
  return nextBarkosLedgerRevision(
    ledger,
    {
      assignments:
        args.decision === 'rejected'
          ? ledger.assignments.map((entry) =>
              entry.id === assignment.id ? { ...entry, status: 'rejected' as const } : entry
            )
          : ledger.assignments,
      approvalGates: ledger.approvalGates.map((entry) =>
        entry.id === gate.id
          ? {
              ...entry,
              status: args.decision,
              resolution,
              resolvedBy: 'user' as const,
              resolvedAt: now
            }
          : entry
      )
    },
    now
  )
}
