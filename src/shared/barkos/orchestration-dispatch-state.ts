import type {
  BarkosAssignment,
  BarkosDispatch,
  BarkosDispatchMemoryDelivery,
  BarkosTask,
  BarkosWorkLedger
} from './work-ledger'
import {
  barkosAdapterError,
  boundedBarkosErrorMessage,
  nextBarkosLedgerRevision
} from './orchestration-adapter-support'
import { barkosTaskRequiresDispatchApproval } from './task-authority'

const NONTERMINAL_DISPATCH_STATES = new Set<BarkosDispatch['state']>([
  'prepared',
  'requested',
  'running'
])

function compactDispatchSource(source: string): string {
  let hash = 2_166_136_261
  for (let index = 0; index < source.length; index += 1) {
    hash = Math.imul(hash ^ source.charCodeAt(index), 16_777_619)
  }
  return (hash >>> 0).toString(36).padStart(7, '0')
}

export function barkosDispatchId(assignmentId: string, attempt: number): string {
  const suffix = `-${attempt}`
  const full = `dispatch-${assignmentId}${suffix}`
  if (full.length <= 64) {
    return full
  }
  const fingerprint = compactDispatchSource(assignmentId)
  const prefixRoom = 64 - 'dispatch-'.length - fingerprint.length - suffix.length - 1
  const sourcePrefix = assignmentId.slice(0, prefixRoom).replace(/-+$/g, '')
  return `dispatch-${sourcePrefix}-${fingerprint}${suffix}`
}

export function barkosMemoryDeliveryReceiptId(dispatchId: string): string {
  return dispatchId.replace(/^dispatch-/, 'memory-')
}

export function findBarkosTask(ledger: BarkosWorkLedger, taskId: string): BarkosTask | undefined {
  return ledger.plans.flatMap((plan) => plan.tasks).find((task) => task.id === taskId)
}

export function hasUnsettledBarkosDispatch(dispatches: readonly BarkosDispatch[]): boolean {
  return dispatches.some((dispatch) => NONTERMINAL_DISPATCH_STATES.has(dispatch.state))
}

export function prepareBarkosDispatch(args: {
  ledger: BarkosWorkLedger
  assignment: BarkosAssignment
  attempt: number
  workspaceId: string
  executionHostId: string
  memoryContext?: Pick<
    BarkosDispatchMemoryDelivery,
    'memoryIds' | 'contextSha256' | 'characterCount'
  >
  now: number
}): BarkosWorkLedger {
  const memoryDelivery: BarkosDispatchMemoryDelivery | null = args.memoryContext
    ? {
        receiptId: barkosMemoryDeliveryReceiptId(
          barkosDispatchId(args.assignment.id, args.attempt)
        ),
        state: 'prepared',
        ...args.memoryContext,
        preparedAt: args.now,
        deliveredAt: null
      }
    : null
  const prepared: BarkosDispatch = {
    id: barkosDispatchId(args.assignment.id, args.attempt),
    assignmentId: args.assignment.id,
    taskId: args.assignment.taskId,
    workerId: args.assignment.workerId,
    attempt: args.attempt,
    state: 'prepared',
    workspaceId: args.workspaceId,
    executionHostId: args.executionHostId,
    orchestrationRunId: null,
    orchestrationTaskId: null,
    orchestrationDispatchId: null,
    memoryDelivery,
    stop: null,
    error: null,
    createdAt: args.now,
    startedAt: null,
    finishedAt: null
  }
  return nextBarkosLedgerRevision(
    args.ledger,
    { dispatches: [...args.ledger.dispatches, prepared] },
    args.now
  )
}

export function failPreparedBarkosDispatch(
  ledger: BarkosWorkLedger,
  dispatchRecordId: string,
  error: unknown,
  now: number
): BarkosWorkLedger {
  return nextBarkosLedgerRevision(
    ledger,
    {
      dispatches: ledger.dispatches.map((dispatch) =>
        dispatch.id === dispatchRecordId
          ? {
              ...dispatch,
              state: 'failed' as const,
              memoryDelivery: dispatch.memoryDelivery
                ? { ...dispatch.memoryDelivery, state: 'unconfirmed' as const }
                : null,
              error: boundedBarkosErrorMessage(error),
              finishedAt: now
            }
          : dispatch
      )
    },
    now
  )
}

export function commitBarkosDispatch(args: {
  ledger: BarkosWorkLedger
  assignment: BarkosAssignment
  task: BarkosTask
  dispatchRecordId: string
  runId: string
  orchestrationDispatchId: string
  memoryDeliveryConfirmed: boolean
  now: number
}): BarkosWorkLedger {
  return nextBarkosLedgerRevision(
    args.ledger,
    {
      assignments: args.ledger.assignments.map((assignment) =>
        assignment.id === args.assignment.id
          ? { ...assignment, status: 'dispatched' as const }
          : assignment
      ),
      plans: args.ledger.plans.map((plan) =>
        plan.id === args.task.planId
          ? {
              ...plan,
              tasks: plan.tasks.map((task) =>
                task.id === args.task.id
                  ? {
                      ...task,
                      status: 'running' as const,
                      updatedAt: Math.max(args.now, task.updatedAt + 1)
                    }
                  : task
              )
            }
          : plan
      ),
      dispatches: args.ledger.dispatches.map((dispatch) =>
        dispatch.id === args.dispatchRecordId
          ? {
              ...dispatch,
              state: 'running' as const,
              orchestrationRunId: args.runId,
              orchestrationTaskId: args.task.orchestrationTaskId,
              orchestrationDispatchId: args.orchestrationDispatchId,
              memoryDelivery: dispatch.memoryDelivery
                ? {
                    ...dispatch.memoryDelivery,
                    state: args.memoryDeliveryConfirmed
                      ? ('delivered' as const)
                      : ('unconfirmed' as const),
                    deliveredAt: args.memoryDeliveryConfirmed ? args.now : null
                  }
                : null,
              startedAt: args.now
            }
          : dispatch
      )
    },
    args.now
  )
}

export function requireApprovedBarkosDispatch(
  ledger: BarkosWorkLedger,
  assignmentId: string,
  task: BarkosTask
): void {
  if (!barkosTaskRequiresDispatchApproval(task)) {
    return
  }
  const approved = ledger.approvalGates.some(
    (gate) =>
      gate.kind === 'dispatch' &&
      gate.taskId === task.id &&
      gate.assignmentId === assignmentId &&
      gate.status === 'approved'
  )
  if (!approved) {
    throw barkosAdapterError(
      'precondition-failed',
      `Task ${task.id} requires an approved dispatch gate`,
      'dispatch-precondition'
    )
  }
}
