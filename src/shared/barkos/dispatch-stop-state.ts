import {
  boundedBarkosErrorMessage,
  nextBarkosLedgerRevision
} from './orchestration-adapter-support'
import type { BarkosDispatch, BarkosWorkLedger } from './work-ledger'

function updateDispatch(
  ledger: BarkosWorkLedger,
  dispatchId: string,
  update: (dispatch: BarkosDispatch) => BarkosDispatch,
  now: number
): BarkosWorkLedger {
  return nextBarkosLedgerRevision(
    ledger,
    {
      dispatches: ledger.dispatches.map((dispatch) =>
        dispatch.id === dispatchId ? update(dispatch) : dispatch
      )
    },
    now
  )
}

export function prepareBarkosDispatchStop(args: {
  ledger: BarkosWorkLedger
  dispatch: BarkosDispatch
  workerTerminalHandle: string
  now: number
}): BarkosWorkLedger {
  return updateDispatch(
    args.ledger,
    args.dispatch.id,
    (dispatch) => ({
      ...dispatch,
      stop: {
        state: 'requested',
        orchestrationDispatchId: dispatch.orchestrationDispatchId!,
        workerTerminalHandle: args.workerTerminalHandle,
        requestedAt: args.now,
        dispatchStoppedAt: null,
        terminalKilledAt: null,
        settledAt: null,
        error: null
      }
    }),
    args.now
  )
}

export function markBarkosDispatchAuthorityStopped(
  ledger: BarkosWorkLedger,
  dispatchId: string,
  now: number
): BarkosWorkLedger {
  return updateDispatch(
    ledger,
    dispatchId,
    (dispatch) => ({
      ...dispatch,
      stop: dispatch.stop
        ? { ...dispatch.stop, state: 'dispatch-stopped', dispatchStoppedAt: now }
        : null
    }),
    now
  )
}

export function markBarkosDispatchStopUncertain(
  ledger: BarkosWorkLedger,
  dispatchId: string,
  error: unknown,
  now: number
): BarkosWorkLedger {
  return updateDispatch(
    ledger,
    dispatchId,
    (dispatch) => ({
      ...dispatch,
      stop: dispatch.stop
        ? {
            ...dispatch.stop,
            state: 'uncertain',
            terminalKilledAt: null,
            settledAt: now,
            error: boundedBarkosErrorMessage(error)
          }
        : null
    }),
    now
  )
}

export function completeBarkosDispatchStop(args: {
  ledger: BarkosWorkLedger
  dispatchId: string
  now: number
}): BarkosWorkLedger {
  const dispatch = args.ledger.dispatches.find((entry) => entry.id === args.dispatchId)
  if (!dispatch?.stop) {
    throw new Error(`Dispatch ${args.dispatchId} has no prepared stop`)
  }
  const stop = dispatch.stop
  return nextBarkosLedgerRevision(
    args.ledger,
    {
      assignments: args.ledger.assignments.map((assignment) =>
        assignment.id === dispatch.assignmentId
          ? { ...assignment, status: 'rejected' as const }
          : assignment
      ),
      plans: args.ledger.plans.map((plan) => ({
        ...plan,
        tasks: plan.tasks.map((task) =>
          task.id === dispatch.taskId
            ? {
                ...task,
                status: 'cancelled' as const,
                updatedAt: Math.max(args.now, task.updatedAt + 1)
              }
            : task
        )
      })),
      dispatches: args.ledger.dispatches.map((entry) =>
        entry.id === dispatch.id
          ? {
              ...entry,
              state: 'cancelled' as const,
              stop: {
                ...stop,
                state: 'completed' as const,
                terminalKilledAt: args.now,
                settledAt: args.now,
                error: null
              },
              finishedAt: args.now
            }
          : entry
      )
    },
    args.now
  )
}
