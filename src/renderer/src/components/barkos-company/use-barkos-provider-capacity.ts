import { useCallback, useMemo, useState } from 'react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import type { BarkosProviderCapacityLedger } from '../../../../shared/barkos/provider-capacity'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import { useAppStore } from '@/store'
import { executeBarkosCodexLocalFailover } from '@/lib/barkos-codex-failover'
import { findBarkosCodexRecoveryChecks } from '@/lib/barkos-codex-recovery-checks'
import { persistCurrentBarkosProviderCapacitySnapshot } from '@/lib/barkos-provider-capacity-snapshot'
import { isWebClientLocation } from '@/lib/web-client-location'
import { translate } from '@/i18n/i18n'

export type BarkosRecoverableDispatch = {
  id: string
  taskTitle: string
  workerName: string
}

export type BarkosProviderCapacityController = {
  operation:
    | { kind: 'syncing' }
    | { kind: 'checking'; dispatchId: string }
    | { kind: 'recovering'; dispatchId: string }
    | null
  error: string | null
  checkableDispatches: readonly BarkosRecoverableDispatch[]
  recoverableDispatches: readonly BarkosRecoverableDispatch[]
  sync: () => Promise<void>
  retry: () => Promise<void>
  check: (dispatchId: string) => Promise<void>
  recover: (dispatchId: string) => Promise<void>
}

export function useBarkosProviderCapacity(args: {
  company: BarkosCompany | null
  ledger: BarkosProviderCapacityLedger | null
  workLedger: BarkosWorkLedger | null
  onMessage: (message: string) => void
}): BarkosProviderCapacityController {
  const { company, ledger, workLedger, onMessage } = args
  const loadCapacity = useAppStore((state) => state.loadBarkosProviderCapacity)
  const loadWorkLedger = useAppStore((state) => state.loadBarkosWorkLedger)
  const clearError = useAppStore((state) => state.clearBarkosProviderCapacityError)
  const workerSessions = useAppStore((state) => state.barkosWorkerSessions)
  const statuses = useAppStore((state) => state.agentStatusByPaneKey)
  const [operation, setOperation] = useState<BarkosProviderCapacityController['operation']>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const isWebClient = isWebClientLocation()
  const checkableDispatches = useMemo(
    () =>
      isWebClient
        ? []
        : findBarkosCodexRecoveryChecks({ company, workLedger, workerSessions, statuses }),
    [company, isWebClient, statuses, workLedger, workerSessions]
  )
  const recoverableDispatches = useMemo(() => {
    const checkableIds = new Set(checkableDispatches.map((dispatch) => dispatch.id))
    return findRecoverableDispatches(company, workLedger, ledger).filter((dispatch) =>
      checkableIds.has(dispatch.id)
    )
  }, [checkableDispatches, company, ledger, workLedger])

  const sync = useCallback(async (): Promise<void> => {
    if (!company || !ledger || operation) {
      return
    }
    setOperation({ kind: 'syncing' })
    setSyncError(null)
    clearError()
    try {
      await persistCurrentBarkosProviderCapacitySnapshot(company)
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : String(error))
      throw error
    } finally {
      setOperation(null)
    }
  }, [clearError, company, ledger, operation])

  const retry = useCallback(async (): Promise<void> => {
    if (!company || operation) {
      return
    }
    clearError()
    setSyncError(null)
    await loadCapacity(company.id)
  }, [clearError, company, loadCapacity, operation])

  const check = useCallback(
    async (dispatchId: string): Promise<void> => {
      if (!company || !ledger || !workLedger || operation) {
        return
      }
      if (!checkableDispatches.some((dispatch) => dispatch.id === dispatchId)) {
        throw new Error('This Codex Dispatch is no longer ready for a recovery check')
      }
      setOperation({ kind: 'checking', dispatchId })
      setSyncError(null)
      clearError()
      try {
        const current = await persistCurrentBarkosProviderCapacitySnapshot(company)
        const eligible = findRecoverableDispatches(company, workLedger, current).some(
          (dispatch) => dispatch.id === dispatchId
        )
        onMessage(
          eligible
            ? translate(
                'barkos.capacity.recoveryCheckReady',
                'A current untried Codex account is available. Review and start recovery when ready.'
              )
            : translate(
                'barkos.capacity.recoveryCheckUnavailable',
                'No current untried Codex account is eligible for this Dispatch.'
              )
        )
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : String(error))
        throw error
      } finally {
        setOperation(null)
      }
    },
    [checkableDispatches, clearError, company, ledger, onMessage, operation, workLedger]
  )

  const recover = useCallback(
    async (dispatchId: string): Promise<void> => {
      if (!company || !ledger || !workLedger || operation) {
        return
      }
      setOperation({ kind: 'recovering', dispatchId })
      setSyncError(null)
      clearError()
      try {
        const currentCapacity = await persistCurrentBarkosProviderCapacitySnapshot(company)
        const result = await executeBarkosCodexLocalFailover({
          company,
          workLedger,
          capacityLedger: currentCapacity,
          dispatchId
        })
        await loadWorkLedger(company.id)
        const messages = {
          succeeded: translate(
            'barkos.capacity.recoverySucceeded',
            'Codex account changed and the task was restarted with new Dispatch authority.'
          ),
          stopped: translate(
            'barkos.capacity.recoveryStopped',
            'Recovery stopped because no untried account is currently available.'
          ),
          'not-applied': translate(
            'barkos.capacity.recoveryNotApplied',
            'The Codex account did not change. BarkOS recorded the failed attempt.'
          ),
          uncertain: translate(
            'barkos.capacity.recoveryUncertain',
            'Recovery stopped because the account-change outcome could not be proven.'
          )
        }
        onMessage(messages[result.status])
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : String(error))
        throw error
      } finally {
        setOperation(null)
      }
    },
    [clearError, company, ledger, loadWorkLedger, onMessage, operation, workLedger]
  )

  return {
    operation,
    error: syncError,
    checkableDispatches,
    recoverableDispatches,
    sync,
    retry,
    check,
    recover
  }
}

function findRecoverableDispatches(
  company: BarkosCompany | null,
  workLedger: BarkosWorkLedger | null,
  capacityLedger: BarkosProviderCapacityLedger | null
): BarkosRecoverableDispatch[] {
  if (!company || !workLedger || !capacityLedger) {
    return []
  }
  const hasLimitedActiveCodex = capacityLedger.accounts.some(
    (observation) =>
      observation.active &&
      observation.account.provider === 'codex' &&
      observation.account.executionHostId === 'local' &&
      observation.account.runtimeLane.kind === 'host' &&
      ['limited', 'cooldown'].includes(observation.status)
  )
  const hasAvailableCodex = capacityLedger.accounts.some(
    (observation) =>
      !observation.active &&
      observation.status === 'available' &&
      observation.account.provider === 'codex' &&
      observation.account.executionHostId === 'local' &&
      observation.account.runtimeLane.kind === 'host'
  )
  if (!hasLimitedActiveCodex || !hasAvailableCodex) {
    return []
  }
  const tasks = new Map(
    workLedger.plans.flatMap((plan) => plan.tasks.map((task) => [task.id, task]))
  )
  const workers = new Map(company.workers.map((worker) => [worker.id, worker]))
  return workLedger.dispatches.flatMap((dispatch) => {
    const worker = workers.get(dispatch.workerId)
    const task = tasks.get(dispatch.taskId)
    const audit = capacityLedger.failovers.find((entry) => entry.dispatchId === dispatch.id)
    const retryableAudit =
      !audit || (audit.state === 'active' && audit.attempts.at(-1)?.outcome !== 'selected')
    return dispatch.state === 'running' &&
      dispatch.executionHostId === 'local' &&
      worker?.agentId === 'codex' &&
      task?.status === 'running' &&
      retryableAudit
      ? [{ id: dispatch.id, taskTitle: task.title, workerName: worker.name }]
      : []
  })
}
