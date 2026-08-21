import { useCallback, useState } from 'react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import type { BarkosWorkerSessionBinding } from '../../../../shared/barkos/worker-session'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  dispatchBarkosAssignmentOnRuntime,
  materializeBarkosPlanOnRuntime
} from '@/lib/barkos-orchestration-runtime'
import { selectBarkosDispatchMemoryContext } from '@/lib/barkos-dispatch-memory-context'
import { ensureBarkosWorkerSessionReady } from '@/lib/ensure-barkos-worker-session'
import type { BarkosWorkerSessionState } from '@/lib/barkos-worker-session-state'
import { useBarkosDirectDispatchActions } from './use-barkos-direct-dispatch-actions'
import { useBarkosReassignmentAction } from './use-barkos-reassignment-action'
import { useBarkosWorkerSessionStates } from './use-barkos-worker-session-states'

export type BarkosOrchestrationOperation =
  | { kind: 'materialize'; id: string }
  | { kind: 'assign'; id: string }
  | { kind: 'approve'; id: string }
  | { kind: 'dispatch'; id: string }
  | { kind: 'stop'; id: string }
  | { kind: 'reassign'; id: string }
  | null

export type BarkosOrchestrationActions = {
  error: string | null
  operation: BarkosOrchestrationOperation
  terminalReadyWorkerIds: readonly string[]
  workerSessionStates: Readonly<Record<string, BarkosWorkerSessionState>>
  clearError: () => void
  materializeObjective: (objectiveId: string) => Promise<void>
  assignTask: (taskId: string) => Promise<void>
  decideDispatch: (assignmentId: string, decision: 'approved' | 'rejected') => Promise<void>
  dispatchAssignment: (assignmentId: string) => Promise<void>
  stopDispatch: (dispatchId: string) => Promise<void>
  reassignDispatch: (dispatchId: string) => Promise<void>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useBarkosOrchestrationActions(args: {
  company: BarkosCompany | null
  ledger: BarkosWorkLedger | null
  workerSessions: Record<string, BarkosWorkerSessionBinding>
  onMessage: (message: string) => void
}): BarkosOrchestrationActions {
  const { company, ledger, workerSessions, onMessage } = args
  const loadLedger = useAppStore((state) => state.loadBarkosWorkLedger)
  const assignReadyTask = useAppStore((state) => state.assignBarkosReadyTask)
  const decideWorkDispatch = useAppStore((state) => state.decideBarkosWorkDispatch)
  const [error, setError] = useState<string | null>(null)
  const [operation, setOperation] = useState<BarkosOrchestrationOperation>(null)

  const { workerSessionStates, terminalReadyWorkerIds } = useBarkosWorkerSessionStates(
    company,
    workerSessions
  )

  const reloadLedger = useCallback(async (): Promise<void> => {
    if (company) {
      await loadLedger(company.id)
    }
  }, [company, loadLedger])

  const clearError = useCallback(() => setError(null), [])

  const dispatchOnRuntime = useCallback(
    async (currentLedger: BarkosWorkLedger, assignmentId: string) => {
      if (!company) {
        throw new Error('BarkOS company is not ready')
      }
      const assignment = currentLedger.assignments.find((entry) => entry.id === assignmentId)
      if (!assignment) {
        throw new Error(`Assignment ${assignmentId} was not found`)
      }
      const coordinator = await ensureBarkosWorkerSessionReady({
        company,
        workerId: company.leadWorkerId,
        fallbackBinding: workerSessions[company.leadWorkerId]
      })
      const worker = await ensureBarkosWorkerSessionReady({
        company,
        workerId: assignment.workerId,
        fallbackBinding: workerSessions[assignment.workerId]
      })
      return dispatchBarkosAssignmentOnRuntime({
        ledger: currentLedger,
        assignmentId,
        coordinator: coordinator.binding,
        coordinatorTerminalHandle: coordinator.terminalHandle,
        worker: worker.binding,
        workerTerminalHandle: worker.terminalHandle,
        memoryContext: selectBarkosDispatchMemoryContext({
          company,
          ledger: currentLedger,
          vault: useAppStore.getState().barkosMemoryVault,
          assignmentId,
          workspaceId: worker.binding.workspaceId
        })
      })
    },
    [company, workerSessions]
  )

  const announceDispatch = useCallback(
    (result: Awaited<ReturnType<typeof dispatchBarkosAssignmentOnRuntime>>, message: string) => {
      if (result.dispatch?.memoryDelivery?.state === 'unconfirmed') {
        onMessage(
          translate(
            'barkos.board.message.memoryDeliveryUnconfirmed',
            'Task started, but memory delivery could not be confirmed on this BarkOS host.'
          )
        )
        return
      }
      onMessage(message)
    },
    [onMessage]
  )

  const materializeObjective = useCallback(
    async (objectiveId: string): Promise<void> => {
      if (!company || !ledger) {
        return
      }
      setError(null)
      setOperation({ kind: 'materialize', id: objectiveId })
      try {
        const coordinator = await ensureBarkosWorkerSessionReady({
          company,
          workerId: company.leadWorkerId,
          fallbackBinding: workerSessions[company.leadWorkerId]
        })
        await materializeBarkosPlanOnRuntime({
          ledger,
          objectiveId,
          coordinator: coordinator.binding,
          coordinatorTerminalHandle: coordinator.terminalHandle
        })
        await reloadLedger()
        onMessage(
          translate(
            'barkos.board.message.materialized',
            'Plan prepared in BarkOS. No worker was dispatched.'
          )
        )
      } catch (caught) {
        await reloadLedger()
        setError(errorMessage(caught))
      } finally {
        setOperation(null)
      }
    },
    [company, ledger, onMessage, reloadLedger, workerSessions]
  )

  const assignTask = useCallback(
    async (taskId: string): Promise<void> => {
      if (!company || !ledger) {
        return
      }
      setError(null)
      setOperation({ kind: 'assign', id: taskId })
      try {
        const task = ledger.plans.flatMap((plan) => plan.tasks).find((entry) => entry.id === taskId)
        if (!task) {
          throw new Error(`Task ${taskId} was not found`)
        }
        if (!task.orchestrationTaskId) {
          const coordinator = await ensureBarkosWorkerSessionReady({
            company,
            workerId: company.leadWorkerId,
            fallbackBinding: workerSessions[company.leadWorkerId]
          })
          await materializeBarkosPlanOnRuntime({
            ledger,
            objectiveId: task.objectiveId,
            coordinator: coordinator.binding,
            coordinatorTerminalHandle: coordinator.terminalHandle
          })
          await reloadLedger()
        }
        const assignedLedger = await assignReadyTask(taskId)
        const assignment = assignedLedger.assignments.find(
          (entry) => entry.taskId === taskId && entry.status === 'approved'
        )
        if (!assignment) {
          throw new Error(`Active assignment for task ${taskId} was not found`)
        }
        const pendingGate = assignedLedger.approvalGates.some(
          (gate) =>
            gate.kind === 'dispatch' &&
            gate.assignmentId === assignment.id &&
            gate.status === 'pending'
        )
        if (pendingGate) {
          onMessage(
            translate(
              'barkos.board.message.assignedAwaitingApproval',
              'Worker assigned. Review the authority gate before starting this task.'
            )
          )
          return
        }
        const result = await dispatchOnRuntime(assignedLedger, assignment.id)
        await reloadLedger()
        announceDispatch(
          result,
          translate(
            'barkos.board.message.assignedAndStarted',
            'Worker assigned and the exact task instruction was dispatched.'
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
      assignReadyTask,
      company,
      dispatchOnRuntime,
      ledger,
      onMessage,
      reloadLedger,
      workerSessions
    ]
  )

  const decideDispatch = useCallback(
    async (assignmentId: string, decision: 'approved' | 'rejected'): Promise<void> => {
      if (!company) {
        return
      }
      setError(null)
      setOperation({ kind: 'approve', id: assignmentId })
      try {
        const decidedLedger = await decideWorkDispatch(assignmentId, decision)
        if (decision === 'rejected') {
          onMessage(
            translate(
              'barkos.board.message.dispatchRejected',
              'Dispatch rejected. The task can be assigned again.'
            )
          )
          return
        }
        const assignment = decidedLedger.assignments.find((entry) => entry.id === assignmentId)
        if (!assignment) {
          throw new Error(`Assignment ${assignmentId} was not found after approval`)
        }
        const result = await dispatchOnRuntime(decidedLedger, assignment.id)
        await reloadLedger()
        announceDispatch(
          result,
          translate(
            'barkos.board.message.dispatchApprovedAndStarted',
            'Authority approved and the exact task instruction was dispatched.'
          )
        )
      } catch (caught) {
        await reloadLedger()
        setError(errorMessage(caught))
      } finally {
        setOperation(null)
      }
    },
    [announceDispatch, company, decideWorkDispatch, dispatchOnRuntime, onMessage, reloadLedger]
  )

  const { dispatchAssignment, stopDispatch } = useBarkosDirectDispatchActions({
    company,
    ledger,
    workerSessions,
    dispatchOnRuntime,
    announceDispatch,
    reloadLedger,
    onMessage,
    setError,
    setOperation
  })
  const reassignDispatch = useBarkosReassignmentAction({
    company,
    ledger,
    dispatchOnRuntime,
    announceDispatch,
    reloadLedger,
    onMessage,
    setError,
    setOperation
  })

  return {
    error,
    operation,
    terminalReadyWorkerIds,
    workerSessionStates,
    clearError,
    materializeObjective,
    assignTask,
    decideDispatch,
    dispatchAssignment,
    stopDispatch,
    reassignDispatch
  }
}
