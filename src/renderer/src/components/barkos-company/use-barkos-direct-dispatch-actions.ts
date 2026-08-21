import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import type { BarkosWorkerSessionBinding } from '../../../../shared/barkos/worker-session'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import type { dispatchBarkosAssignmentOnRuntime } from '@/lib/barkos-orchestration-runtime'
import { translate } from '@/i18n/i18n'
import { executeBarkosDispatchStopAction } from './barkos-dispatch-stop-action'
import type { BarkosOrchestrationOperation } from './use-barkos-orchestration-actions'

type RuntimeDispatchResult = Awaited<ReturnType<typeof dispatchBarkosAssignmentOnRuntime>>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useBarkosDirectDispatchActions(args: {
  company: BarkosCompany | null
  ledger: BarkosWorkLedger | null
  workerSessions: Record<string, BarkosWorkerSessionBinding>
  dispatchOnRuntime: (
    ledger: BarkosWorkLedger,
    assignmentId: string
  ) => Promise<RuntimeDispatchResult>
  announceDispatch: (result: RuntimeDispatchResult, message: string) => void
  reloadLedger: () => Promise<void>
  onMessage: (message: string) => void
  setError: Dispatch<SetStateAction<string | null>>
  setOperation: Dispatch<SetStateAction<BarkosOrchestrationOperation>>
}) {
  const {
    company,
    ledger,
    workerSessions,
    dispatchOnRuntime,
    announceDispatch,
    reloadLedger,
    onMessage,
    setError,
    setOperation
  } = args
  const dispatchAssignment = useCallback(
    async (assignmentId: string): Promise<void> => {
      if (!company || !ledger) {
        return
      }
      setError(null)
      setOperation({ kind: 'dispatch', id: assignmentId })
      try {
        const assignment = ledger.assignments.find((entry) => entry.id === assignmentId)
        if (!assignment) {
          throw new Error(`Assignment ${assignmentId} was not found`)
        }
        const result = await dispatchOnRuntime(ledger, assignmentId)
        await reloadLedger()
        announceDispatch(
          result,
          translate('barkos.board.message.dispatched', 'Work dispatched to the selected worker.')
        )
      } catch (error) {
        await reloadLedger()
        setError(errorMessage(error))
      } finally {
        setOperation(null)
      }
    },
    [announceDispatch, company, dispatchOnRuntime, ledger, reloadLedger, setError, setOperation]
  )

  const stopDispatch = useCallback(
    (dispatchId: string) =>
      executeBarkosDispatchStopAction({
        company,
        ledger,
        workerSessions,
        dispatchId,
        onStart: () => {
          setError(null)
          setOperation({ kind: 'stop', id: dispatchId })
        },
        onReload: reloadLedger,
        onMessage,
        onError: setError,
        onSettled: () => setOperation(null)
      }),
    [company, ledger, onMessage, reloadLedger, setError, setOperation, workerSessions]
  )

  return { dispatchAssignment, stopDispatch }
}
