import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import { callRuntimeRpc, hasRuntimeRpcErrorCode } from '../runtime/runtime-rpc-client'
import { runtimeTargetForBarkosExecutionHost } from './barkos-orchestration-target'

const DEFAULT_TIMEOUT_MS = 5_000
const DEFAULT_RETRY_DELAY_MS = 50

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitForBarkosCoordinatorReadiness(args: {
  binding: BarkosWorkerSessionBinding
  terminalHandle: string
  timeoutMs?: number
  retryDelayMs?: number
}): Promise<void> {
  const target = runtimeTargetForBarkosExecutionHost(args.binding.executionHostId)
  if (!target) {
    throw new Error('Baş ajanın çalışma ortamı geçersiz')
  }
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retryDelayMs = args.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const deadline = Date.now() + timeoutMs
  while (true) {
    try {
      await callRuntimeRpc(target, 'orchestration.runCurrent', {
        from: args.terminalHandle
      })
      return
    } catch (error) {
      if (!hasRuntimeRpcErrorCode(error, 'stable_pane_required')) {
        throw error
      }
      if (Date.now() >= deadline) {
        throw new Error('Baş ajan terminali BarkOS orkestrasyonuna zamanında bağlanamadı', {
          cause: error
        })
      }
      await delay(retryDelayMs)
    }
  }
}
