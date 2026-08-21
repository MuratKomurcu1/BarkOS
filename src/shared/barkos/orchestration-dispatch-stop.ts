import { z } from 'zod'
import {
  completeBarkosDispatchStop,
  markBarkosDispatchAuthorityStopped,
  markBarkosDispatchStopUncertain,
  prepareBarkosDispatchStop
} from './dispatch-stop-state'
import {
  barkosAdapterError,
  boundedBarkosErrorMessage,
  BarkosOrchestrationAdapterError,
  persistBarkosLedgerMutation,
  type BarkosOrchestrationRpcCaller,
  type BarkosWorkLedgerPersist
} from './orchestration-adapter-support'
import { parseBarkosWorkLedger, type BarkosDispatch, type BarkosWorkLedger } from './work-ledger'

const workerStopResponseSchema = z
  .object({
    dispatchId: z.string().trim().min(1).max(256),
    state: z.literal('stopped'),
    processAction: z.literal('none')
  })
  .passthrough()

const terminalCloseResponseSchema = z
  .object({
    close: z
      .object({
        handle: z.string().trim().min(1).max(256),
        ptyKilled: z.literal(true)
      })
      .passthrough()
  })
  .passthrough()

function requireStoppableDispatch(ledger: BarkosWorkLedger, dispatchId: string): BarkosDispatch {
  const dispatch = ledger.dispatches.find((entry) => entry.id === dispatchId)
  if (
    !dispatch ||
    dispatch.state !== 'running' ||
    dispatch.stop !== null ||
    !dispatch.orchestrationDispatchId
  ) {
    throw barkosAdapterError(
      'precondition-failed',
      'Stopping requires a running bound Dispatch with no prior stop attempt',
      'dispatch-stop-precondition'
    )
  }
  return dispatch
}

async function persistUncertainStop(args: {
  ledger: BarkosWorkLedger
  dispatchId: string
  error: BarkosOrchestrationAdapterError
  persist: BarkosWorkLedgerPersist
  now: number
}): Promise<never> {
  await persistBarkosLedgerMutation({
    ledger: markBarkosDispatchStopUncertain(args.ledger, args.dispatchId, args.error, args.now),
    persist: args.persist,
    stage: 'dispatch-stop-uncertain',
    effects: args.error.effects
  })
  throw args.error
}

async function callStopEffect(args: {
  callRpc: BarkosOrchestrationRpcCaller
  method: string
  params: Record<string, unknown>
  stage: string
  effects: 'possible' | 'applied'
}): Promise<unknown> {
  try {
    return await args.callRpc(args.method, args.params)
  } catch (error) {
    throw barkosAdapterError(
      'rpc-failed',
      boundedBarkosErrorMessage(error),
      args.stage,
      args.effects,
      error
    )
  }
}

export async function stopBarkosDispatchAuthority(args: {
  ledger: BarkosWorkLedger
  dispatchId: string
  workerTerminalHandle: string
  callRpc: BarkosOrchestrationRpcCaller
  persist: BarkosWorkLedgerPersist
  now?: () => number
}): Promise<{ ledger: BarkosWorkLedger; dispatch: BarkosDispatch }> {
  let ledger = parseBarkosWorkLedger(args.ledger)
  const dispatch = requireStoppableDispatch(ledger, args.dispatchId)
  const terminalHandle = args.workerTerminalHandle.trim()
  if (!terminalHandle) {
    throw barkosAdapterError(
      'precondition-failed',
      'Stopping requires the exact live worker terminal',
      'dispatch-stop-precondition'
    )
  }
  const now = args.now ?? Date.now
  ledger = await persistBarkosLedgerMutation({
    ledger: prepareBarkosDispatchStop({
      ledger,
      dispatch,
      workerTerminalHandle: terminalHandle,
      now: now()
    }),
    persist: args.persist,
    stage: 'dispatch-stop-prepare',
    effects: 'none'
  })

  let stoppedValue: unknown
  try {
    stoppedValue = await callStopEffect({
      callRpc: args.callRpc,
      method: 'orchestration.workerStop',
      params: { dispatch: dispatch.orchestrationDispatchId },
      stage: 'dispatch-stop-authority',
      effects: 'possible'
    })
  } catch (error) {
    if (!(error instanceof BarkosOrchestrationAdapterError)) {
      throw error
    }
    return persistUncertainStop({
      ledger,
      dispatchId: dispatch.id,
      error,
      persist: args.persist,
      now: now()
    })
  }
  const stopped = workerStopResponseSchema.safeParse(stoppedValue)
  if (!stopped.success || stopped.data.dispatchId !== dispatch.orchestrationDispatchId) {
    return persistUncertainStop({
      ledger,
      dispatchId: dispatch.id,
      error: barkosAdapterError(
        'invalid-rpc-response',
        'Orca did not prove that the exact Dispatch authority was stopped',
        'dispatch-stop-authority',
        'possible',
        stopped.success ? undefined : stopped.error
      ),
      persist: args.persist,
      now: now()
    })
  }

  ledger = await persistBarkosLedgerMutation({
    ledger: markBarkosDispatchAuthorityStopped(ledger, dispatch.id, now()),
    persist: args.persist,
    stage: 'dispatch-stop-authority-proof',
    effects: 'applied'
  })
  let closeValue: unknown
  try {
    closeValue = await callStopEffect({
      callRpc: args.callRpc,
      method: 'terminal.close',
      params: { terminal: terminalHandle },
      stage: 'dispatch-stop-terminal',
      effects: 'applied'
    })
  } catch (error) {
    if (!(error instanceof BarkosOrchestrationAdapterError)) {
      throw error
    }
    return persistUncertainStop({
      ledger,
      dispatchId: dispatch.id,
      error,
      persist: args.persist,
      now: now()
    })
  }
  const close = terminalCloseResponseSchema.safeParse(closeValue)
  if (!close.success || close.data.close.handle !== terminalHandle) {
    return persistUncertainStop({
      ledger,
      dispatchId: dispatch.id,
      error: barkosAdapterError(
        'invalid-rpc-response',
        'Orca did not prove that the exact worker PTY was terminated',
        'dispatch-stop-terminal',
        'applied',
        close.success ? undefined : close.error
      ),
      persist: args.persist,
      now: now()
    })
  }

  ledger = await persistBarkosLedgerMutation({
    ledger: completeBarkosDispatchStop({ ledger, dispatchId: dispatch.id, now: now() }),
    persist: args.persist,
    stage: 'dispatch-stop-commit',
    effects: 'applied'
  })
  const stoppedDispatch = ledger.dispatches.find((entry) => entry.id === dispatch.id)
  if (!stoppedDispatch) {
    throw barkosAdapterError(
      'persistence-failed',
      'Persisted stopped Dispatch disappeared',
      'dispatch-stop-commit',
      'applied'
    )
  }
  return { ledger, dispatch: stoppedDispatch }
}
