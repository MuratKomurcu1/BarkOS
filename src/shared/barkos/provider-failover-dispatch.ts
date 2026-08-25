import { z } from 'zod'
import {
  barkosAdapterError,
  boundedBarkosErrorMessage,
  nextBarkosLedgerRevision,
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

const taskReadyResponseSchema = z
  .object({
    task: z
      .object({
        id: z.string().trim().min(1).max(256),
        status: z.literal('ready')
      })
      .passthrough()
  })
  .passthrough()

const runUseResponseSchema = z
  .object({
    run: z.object({ id: z.string().trim().min(1).max(256) }).passthrough(),
    binding: z.object({ consumerGeneration: z.number().int().nonnegative() }).passthrough()
  })
  .passthrough()

const replacementDispatchResponseSchema = z
  .object({
    dispatch: z
      .object({
        id: z.string().trim().min(1).max(256),
        task_id: z.string().trim().min(1).max(256)
      })
      .passthrough(),
    injected: z.literal(true)
  })
  .passthrough()

export type BarkosFailoverReplacementSession = {
  terminalHandle: string
}

export async function replaceBarkosCodexDispatchAuthority(args: {
  ledger: BarkosWorkLedger
  dispatchId: string
  coordinatorTerminalHandle: string
  sourceWorkerTerminalHandle: string
  rebindCoordinator?: boolean
  launchReplacement: () => Promise<BarkosFailoverReplacementSession>
  callRpc: BarkosOrchestrationRpcCaller
  persist: BarkosWorkLedgerPersist
  now?: () => number
}): Promise<{
  ledger: BarkosWorkLedger
  dispatch: BarkosDispatch
  replacement: BarkosFailoverReplacementSession
}> {
  const ledger = parseBarkosWorkLedger(args.ledger)
  const dispatch = requireRunningBoundDispatch(ledger, args.dispatchId)
  const runId = dispatch.orchestrationRunId!
  const taskId = dispatch.orchestrationTaskId!
  const sourceDispatchId = dispatch.orchestrationDispatchId!
  const now = args.now ?? Date.now

  const stoppedValue = await callFailoverEffect({
    callRpc: args.callRpc,
    method: 'orchestration.workerStop',
    params: { dispatch: sourceDispatchId },
    stage: 'failover-dispatch-stop',
    effects: 'possible'
  })
  const stopped = workerStopResponseSchema.safeParse(stoppedValue)
  if (!stopped.success || stopped.data.dispatchId !== sourceDispatchId) {
    throw barkosAdapterError(
      'invalid-rpc-response',
      'BarkOS did not prove that the previous Dispatch authority was stopped',
      'failover-dispatch-stop',
      'possible',
      stopped.success ? undefined : stopped.error
    )
  }

  const closeValue = await callFailoverEffect({
    callRpc: args.callRpc,
    method: 'terminal.close',
    params: { terminal: args.sourceWorkerTerminalHandle },
    stage: 'failover-terminal-close',
    effects: 'applied'
  })
  const close = terminalCloseResponseSchema.safeParse(closeValue)
  if (!close.success || close.data.close.handle !== args.sourceWorkerTerminalHandle) {
    throw barkosAdapterError(
      'invalid-rpc-response',
      'BarkOS did not prove that the previous Codex process was stopped',
      'failover-terminal-close',
      'applied',
      close.success ? undefined : close.error
    )
  }

  let replacement: BarkosFailoverReplacementSession
  try {
    replacement = await args.launchReplacement()
  } catch (error) {
    throw barkosAdapterError(
      'rpc-failed',
      boundedBarkosErrorMessage(error),
      'failover-session-launch',
      'applied',
      error
    )
  }
  if (
    !replacement.terminalHandle.trim() ||
    replacement.terminalHandle === args.sourceWorkerTerminalHandle
  ) {
    throw barkosAdapterError(
      'precondition-failed',
      'The replacement Codex session did not publish a new terminal authority',
      'failover-session-launch',
      'applied'
    )
  }

  const coordinatorTerminalHandle = args.rebindCoordinator
    ? replacement.terminalHandle
    : args.coordinatorTerminalHandle
  if (args.rebindCoordinator) {
    const runUseValue = await callFailoverEffect({
      callRpc: args.callRpc,
      method: 'orchestration.runUse',
      params: { id: runId, from: coordinatorTerminalHandle },
      stage: 'failover-coordinator-rebind',
      effects: 'applied'
    })
    const runUse = runUseResponseSchema.safeParse(runUseValue)
    if (!runUse.success || runUse.data.run.id !== runId) {
      throw barkosAdapterError(
        'invalid-rpc-response',
        'BarkOS did not confirm the replacement coordinator binding',
        'failover-coordinator-rebind',
        'applied',
        runUse.success ? undefined : runUse.error
      )
    }
  }

  const readyValue = await callFailoverEffect({
    callRpc: args.callRpc,
    method: 'orchestration.taskUpdate',
    params: {
      id: taskId,
      status: 'ready',
      run: runId,
      callerTerminalHandle: coordinatorTerminalHandle
    },
    stage: 'failover-task-reset',
    effects: 'applied'
  })
  const ready = taskReadyResponseSchema.safeParse(readyValue)
  if (!ready.success || ready.data.task.id !== taskId) {
    throw barkosAdapterError(
      'invalid-rpc-response',
      'BarkOS did not confirm that the failover Task is ready',
      'failover-task-reset',
      'applied',
      ready.success ? undefined : ready.error
    )
  }

  const replacementValue = await callFailoverEffect({
    callRpc: args.callRpc,
    method: 'orchestration.dispatch',
    params: {
      task: taskId,
      to: replacement.terminalHandle,
      from: coordinatorTerminalHandle,
      inject: true,
      run: runId
    },
    stage: 'failover-dispatch-replacement',
    effects: 'applied'
  })
  const replacementResponse = replacementDispatchResponseSchema.safeParse(replacementValue)
  if (!replacementResponse.success || replacementResponse.data.dispatch.task_id !== taskId) {
    throw barkosAdapterError(
      'invalid-rpc-response',
      'BarkOS returned an invalid replacement Dispatch response',
      'failover-dispatch-replacement',
      'applied',
      replacementResponse.success ? undefined : replacementResponse.error
    )
  }

  const updated = nextBarkosLedgerRevision(
    ledger,
    {
      dispatches: ledger.dispatches.map((entry) =>
        entry.id === dispatch.id
          ? {
              ...entry,
              orchestrationDispatchId: replacementResponse.data.dispatch.id
            }
          : entry
      )
    },
    now()
  )
  const persisted = await persistBarkosLedgerMutation({
    ledger: updated,
    persist: args.persist,
    stage: 'failover-dispatch-commit',
    effects: 'applied'
  })
  const persistedDispatch = persisted.dispatches.find((entry) => entry.id === dispatch.id)
  if (!persistedDispatch) {
    throw barkosAdapterError(
      'persistence-failed',
      'Persisted BarkOS failover Dispatch disappeared',
      'failover-dispatch-commit',
      'applied'
    )
  }
  return { ledger: persisted, dispatch: persistedDispatch, replacement }
}

function requireRunningBoundDispatch(ledger: BarkosWorkLedger, dispatchId: string): BarkosDispatch {
  const dispatch = ledger.dispatches.find((entry) => entry.id === dispatchId)
  if (
    !dispatch ||
    dispatch.state !== 'running' ||
    !dispatch.orchestrationRunId ||
    !dispatch.orchestrationTaskId ||
    !dispatch.orchestrationDispatchId
  ) {
    throw barkosAdapterError(
      'precondition-failed',
      'Codex failover requires a running BarkOS-bound BarkOS Dispatch',
      'failover-dispatch-precondition'
    )
  }
  return dispatch
}

async function callFailoverEffect(args: {
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
