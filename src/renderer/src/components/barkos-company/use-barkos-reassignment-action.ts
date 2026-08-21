import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import { translate } from '@/i18n/i18n'
import type { dispatchBarkosAssignmentOnRuntime } from '@/lib/barkos-orchestration-runtime'
import { useAppStore } from '@/store'
import type { BarkosOrchestrationOperation } from './use-barkos-orchestration-actions'

type RuntimeDispatchResult = Awaited<ReturnType<typeof dispatchBarkosAssignmentOnRuntime>>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useBarkosReassignmentAction(args: {
  company: BarkosCompany | null
  ledger: BarkosWorkLedger | null
  dispatchOnRuntime: (
    ledger: BarkosWorkLedger,
    assignmentId: string
  ) => Promise<RuntimeDispatchResult>
  announceDispatch: (result: RuntimeDispatchResult, message: string) => void
  reloadLedger: () => Promise<void>
  onMessage: (message: string) => void
  setError: Dispatch<SetStateAction<string | null>>
  setOperation: Dispatch<SetStateAction<BarkosOrchestrationOperation>>
}): (dispatchId: string) => Promise<void> {
  const {
    company,
    ledger,
    dispatchOnRuntime,
    announceDispatch,
    reloadLedger,
    onMessage,
    setError,
    setOperation
  } = args
  const reassignStoppedTask = useAppStore((state) => state.reassignBarkosStoppedTask)
  return useCallback(
    async (dispatchId: string): Promise<void> => {
      if (!company || !ledger) {
        return
      }
      setError(null)
      setOperation({ kind: 'reassign', id: dispatchId })
      try {
        const stopped = ledger.dispatches.find((entry) => entry.id === dispatchId)
        if (!stopped) {
          throw new Error(`Dispatch ${dispatchId} was not found`)
        }
        const reassignedLedger = await reassignStoppedTask(dispatchId)
        const assignment = reassignedLedger.assignments
          .filter((entry) => entry.taskId === stopped.taskId && entry.status === 'approved')
          .toSorted((left, right) => right.assignedAt - left.assignedAt)[0]
        if (!assignment) {
          throw new Error(`Replacement Assignment for ${stopped.taskId} was not found`)
        }
        const pendingGate = reassignedLedger.approvalGates.some(
          (gate) =>
            gate.kind === 'dispatch' &&
            gate.assignmentId === assignment.id &&
            gate.status === 'pending'
        )
        if (pendingGate) {
          onMessage(
            translate(
              'barkos.board.message.reassignedAwaitingApproval',
              'Task reassigned to a different worker. Review the new authority gate before starting it.'
            )
          )
          return
        }
        const result = await dispatchOnRuntime(reassignedLedger, assignment.id)
        await reloadLedger()
        announceDispatch(
          result,
          translate(
            'barkos.board.message.reassignedAndStarted',
            'Task reassigned to a different worker and started from the confirmed stop boundary.'
          )
        )
      } catch (caught) {
        await reloadLedger()
        setError(errorMessage(caught))
      } finally {
        setOperation(null)
      }
    },
    [
      announceDispatch,
      company,
      dispatchOnRuntime,
      ledger,
      onMessage,
      reassignStoppedTask,
      reloadLedger,
      setError,
      setOperation
    ]
  )
}
