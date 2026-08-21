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

export class BarkosReassignmentStateError extends Error {
  constructor(
    readonly code:
      | 'company-mismatch'
      | 'dispatch-not-found'
      | 'stop-not-completed'
      | 'assignment-not-reassignable'
      | 'task-not-cancelled'
      | 'replacement-worker-unavailable',
    message: string
  ) {
    super(message)
    this.name = 'BarkosReassignmentStateError'
  }
}

function boundedEntityId(prefix: string, sourceId: string, suffix: string): string {
  const room = 64 - prefix.length - suffix.length
  const source = sourceId.slice(0, room).replace(/-+$/g, '')
  return `${prefix}${source}${suffix}`
}

function nextEntityId(prefix: string, sourceId: string, existingIds: ReadonlySet<string>): string {
  for (let sequence = existingIds.size + 1; sequence <= existingIds.size + 2_001; sequence += 1) {
    const candidate = boundedEntityId(prefix, sourceId, `-${sequence}`)
    if (!existingIds.has(candidate)) {
      return candidate
    }
  }
  throw new RangeError(`Could not allocate a unique ${prefix} identifier`)
}

function replacementFailureMessage(
  decision: Extract<BarkosAssignmentPolicyDecision, { ok: false }>
): string {
  switch (decision.reason) {
    case 'task-already-assigned':
      return 'This task already has an active replacement assignment'
    case 'no-eligible-workers':
      return 'No different available worker is eligible for this task'
    case 'no-worker-capacity':
      return 'Every different capable worker is at the active-assignment limit'
    case 'capabilities-uncovered':
      return `No different worker covers all required capabilities${
        decision.missingCapabilities.length > 0
          ? `: ${decision.missingCapabilities.join(', ')}`
          : ''
      }`
  }
}

function findTask(ledger: BarkosWorkLedger, taskId: string): BarkosTask | undefined {
  return ledger.plans.flatMap((plan) => plan.tasks).find((task) => task.id === taskId)
}

export function reassignStoppedBarkosTask(args: {
  ledger: BarkosWorkLedger
  company: BarkosCompany
  dispatchId: string
  maxActiveAssignmentsPerWorker?: number
  now?: number
}): { ledger: BarkosWorkLedger; assignment: BarkosAssignment } {
  const ledger = parseBarkosWorkLedger(args.ledger)
  if (ledger.companyId !== args.company.id) {
    throw new BarkosReassignmentStateError(
      'company-mismatch',
      'BarkOS work ledger does not match the active company'
    )
  }
  const dispatch = ledger.dispatches.find((entry) => entry.id === args.dispatchId)
  if (!dispatch) {
    throw new BarkosReassignmentStateError(
      'dispatch-not-found',
      `Dispatch ${args.dispatchId} was not found`
    )
  }
  if (dispatch.state !== 'cancelled' || dispatch.stop?.state !== 'completed') {
    throw new BarkosReassignmentStateError(
      'stop-not-completed',
      'Reassignment requires confirmed Dispatch authority and terminal termination'
    )
  }
  const previous = ledger.assignments.find((entry) => entry.id === dispatch.assignmentId)
  if (!previous || previous.status !== 'rejected') {
    throw new BarkosReassignmentStateError(
      'assignment-not-reassignable',
      'The stopped Assignment was already replaced or is not reassignable'
    )
  }
  const task = findTask(ledger, dispatch.taskId)
  if (!task || task.status !== 'cancelled') {
    throw new BarkosReassignmentStateError(
      'task-not-cancelled',
      'Only the cancelled Task from a confirmed stop can be reassigned'
    )
  }

  const decision = selectBarkosWorkerForTask({
    company: args.company,
    task,
    assignments: ledger.assignments,
    maxActiveAssignments: args.maxActiveAssignmentsPerWorker,
    excludedWorkerIds: [previous.workerId]
  })
  if (!decision.ok) {
    throw new BarkosReassignmentStateError(
      'replacement-worker-unavailable',
      replacementFailureMessage(decision)
    )
  }

  const now = args.now ?? Date.now()
  const assignment: BarkosAssignment = {
    id: nextEntityId('assignment-', task.id, new Set(ledger.assignments.map((entry) => entry.id))),
    taskId: task.id,
    workerId: decision.workerId,
    status: 'approved',
    reason: `Reassigned after confirmed stop of ${dispatch.id}. ${decision.rationale}`,
    matchedCapabilities: decision.matchedCapabilities,
    activeLoadAtAssignment: decision.activeAssignments,
    assignedAt: now,
    approvedAt: now
  }
  const gate: BarkosApprovalGate | null = barkosTaskRequiresDispatchApproval(task)
    ? {
        id: nextEntityId(
          'dispatch-gate-',
          assignment.id,
          new Set(ledger.approvalGates.map((entry) => entry.id))
        ),
        taskId: task.id,
        assignmentId: assignment.id,
        kind: 'dispatch',
        status: 'pending',
        question: `Allow ${decision.workerId} to restart ${task.title} after the confirmed stop?`,
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
      assignments: [
        ...ledger.assignments.map((entry) =>
          entry.id === previous.id ? { ...entry, status: 'reassigned' as const } : entry
        ),
        assignment
      ],
      approvalGates: gate ? [...ledger.approvalGates, gate] : ledger.approvalGates,
      plans: ledger.plans.map((plan) => ({
        ...plan,
        tasks: plan.tasks.map((entry) =>
          entry.id === task.id
            ? {
                ...entry,
                status: 'ready' as const,
                updatedAt: Math.max(now, entry.updatedAt + 1)
              }
            : entry
        )
      }))
    },
    now
  )
  return {
    ledger: next,
    assignment: next.assignments.find((entry) => entry.id === assignment.id) ?? assignment
  }
}
