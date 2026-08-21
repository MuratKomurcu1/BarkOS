import type { BarkosCompany } from '../../../../shared/barkos/company'
import type { BarkosWorkerSessionBinding } from '../../../../shared/barkos/worker-session'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import { stopBarkosDispatchOnRuntime } from '@/lib/barkos-orchestration-runtime'
import { resolveReadyBarkosWorkerRuntime } from '@/lib/barkos-worker-session-state'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function executeBarkosDispatchStopAction(args: {
  company: BarkosCompany | null
  ledger: BarkosWorkLedger | null
  workerSessions: Record<string, BarkosWorkerSessionBinding>
  dispatchId: string
  onStart: () => void
  onReload: () => Promise<void>
  onMessage: (message: string) => void
  onError: (message: string) => void
  onSettled: () => void
}): Promise<void> {
  if (!args.company || !args.ledger) {
    return
  }
  args.onStart()
  try {
    const dispatch = args.ledger.dispatches.find((entry) => entry.id === args.dispatchId)
    if (!dispatch) {
      throw new Error(`Dispatch ${args.dispatchId} was not found`)
    }
    const worker = args.company.workers.find((entry) => entry.id === dispatch.workerId)
    const runtime = resolveReadyBarkosWorkerRuntime({
      binding: args.workerSessions[dispatch.workerId],
      statuses: useAppStore.getState().agentStatusByPaneKey
    })
    if (!worker || !runtime || runtime.binding.agent !== worker.agentId) {
      throw new Error('Stopping requires the exact live worker terminal')
    }
    await stopBarkosDispatchOnRuntime({
      ledger: args.ledger,
      dispatchId: args.dispatchId,
      worker: runtime.binding,
      workerTerminalHandle: runtime.terminalHandle
    })
    await args.onReload()
    args.onMessage(
      translate(
        'barkos.board.message.stopped',
        'Dispatch stopped and exact worker PTY termination was confirmed.'
      )
    )
  } catch (error) {
    await args.onReload()
    args.onError(errorMessage(error))
  } finally {
    args.onSettled()
  }
}
