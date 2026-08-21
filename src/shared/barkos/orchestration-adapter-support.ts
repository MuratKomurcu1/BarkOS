import { parseBarkosWorkLedger, type BarkosWorkLedger } from './work-ledger'

export type BarkosOrchestrationRpcCaller = (
  method: string,
  params: Record<string, unknown>
) => Promise<unknown>

export type BarkosWorkLedgerPersist = (ledger: BarkosWorkLedger) => Promise<BarkosWorkLedger>

export type BarkosOrchestrationEffectState = 'none' | 'possible' | 'applied'

export type BarkosOrchestrationAdapterErrorCode =
  | 'precondition-failed'
  | 'invalid-rpc-response'
  | 'persistence-failed'
  | 'rpc-failed'
  | 'dispatch-in-progress'
  | 'dispatch-attempts-exhausted'
  | 'execution-paused'
  | 'concurrency-limit-reached'
  | 'objective-dispatch-budget-exhausted'
  | 'control-policy-mismatch'

export class BarkosOrchestrationAdapterError extends Error {
  constructor(
    readonly code: BarkosOrchestrationAdapterErrorCode,
    message: string,
    readonly stage: string,
    readonly effects: BarkosOrchestrationEffectState,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'BarkosOrchestrationAdapterError'
  }
}

export function barkosAdapterError(
  code: BarkosOrchestrationAdapterErrorCode,
  message: string,
  stage: string,
  effects: BarkosOrchestrationEffectState = 'none',
  cause?: unknown
): BarkosOrchestrationAdapterError {
  return new BarkosOrchestrationAdapterError(
    code,
    message,
    stage,
    effects,
    cause === undefined ? undefined : { cause }
  )
}

export function nextBarkosLedgerRevision(
  ledger: BarkosWorkLedger,
  updates: Omit<
    Partial<BarkosWorkLedger>,
    'schemaVersion' | 'companyId' | 'revision' | 'updatedAt'
  >,
  now: number
): BarkosWorkLedger {
  return parseBarkosWorkLedger({
    ...ledger,
    ...updates,
    revision: ledger.revision + 1,
    updatedAt: Math.max(now, ledger.updatedAt + 1)
  })
}

export async function persistBarkosLedgerMutation(args: {
  ledger: BarkosWorkLedger
  persist: BarkosWorkLedgerPersist
  stage: string
  effects: BarkosOrchestrationEffectState
}): Promise<BarkosWorkLedger> {
  try {
    return parseBarkosWorkLedger(await args.persist(args.ledger))
  } catch (error) {
    throw barkosAdapterError(
      'persistence-failed',
      `BarkOS could not persist the work ledger after ${args.stage}`,
      args.stage,
      args.effects,
      error
    )
  }
}

export function boundedBarkosErrorMessage(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error)
  return (value.trim() || 'Unknown orchestration failure').slice(0, 2_000)
}

export async function callBarkosOrchestrationRpc(args: {
  callRpc: BarkosOrchestrationRpcCaller
  method: string
  params: Record<string, unknown>
  stage: string
}): Promise<unknown> {
  try {
    return await args.callRpc(args.method, args.params)
  } catch (error) {
    throw barkosAdapterError(
      'rpc-failed',
      boundedBarkosErrorMessage(error),
      args.stage,
      'possible',
      error
    )
  }
}
