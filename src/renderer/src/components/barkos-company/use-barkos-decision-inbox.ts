import { useCallback, useEffect, useRef, useState } from 'react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import {
  beginBarkosDecisionResolution,
  completeBarkosDecisionResolution,
  markBarkosDecisionResolutionUncertain,
  mergeBarkosDecisionRequests,
  type BarkosDecisionRequest,
  type BarkosDecisionResolutionKind
} from '../../../../shared/barkos/decision-inbox'
import type { BarkosWorkerSessionBinding } from '../../../../shared/barkos/worker-session'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import {
  refreshBarkosDecisionRequestsOnRuntime,
  resolveBarkosDecisionRequestOnRuntime
} from '@/lib/barkos-decision-inbox-runtime'
import { resolveBarkosWorkerTerminalHandle } from '@/lib/barkos-orchestration-target'
import { useAppStore } from '@/store'

const DECISION_INBOX_POLL_INTERVAL_MS = 2_000

export type BarkosDecisionInboxController = {
  refreshState: 'idle' | 'refreshing' | 'error'
  currentRunId: string | null
  lastRefreshedAt: number | null
  skipped: number
  error: string | null
  refresh: () => Promise<void>
  resolve: (
    request: BarkosDecisionRequest,
    kind: BarkosDecisionResolutionKind,
    resolution: string
  ) => Promise<void>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useBarkosDecisionInbox(args: {
  company: BarkosCompany | null
  ledger: BarkosWorkLedger | null
  workerSessions: Record<string, BarkosWorkerSessionBinding>
}): BarkosDecisionInboxController {
  const statuses = useAppStore((state) => state.agentStatusByPaneKey)
  const inboxLoadState = useAppStore((state) => state.barkosDecisionInboxLoadState)
  const loadInbox = useAppStore((state) => state.loadBarkosDecisionInbox)
  const saveInbox = useAppStore((state) => state.saveBarkosDecisionInbox)
  const syncInbox = useAppStore((state) => state.syncBarkosDecisionInbox)
  const resolveSideEffect = useAppStore((state) => state.resolveBarkosSideEffectApproval)
  const clearInboxError = useAppStore((state) => state.clearBarkosDecisionInboxError)
  const busyRef = useRef(false)
  const [refreshState, setRefreshState] = useState<'idle' | 'refreshing' | 'error'>('idle')
  const [currentRunId, setCurrentRunId] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null)
  const [skipped, setSkipped] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const coordinator = args.company ? args.workerSessions[args.company.leadWorkerId] : undefined
  const coordinatorTerminalHandle = coordinator
    ? resolveBarkosWorkerTerminalHandle(coordinator, statuses)
    : null
  const hasActiveDispatch =
    args.ledger?.dispatches.some(
      (dispatch) => dispatch.state === 'requested' || dispatch.state === 'running'
    ) ?? false

  const refresh = useCallback(async (): Promise<void> => {
    if (busyRef.current) {
      return
    }
    if (inboxLoadState === 'error' && args.company) {
      busyRef.current = true
      setRefreshState('refreshing')
      setError(null)
      clearInboxError()
      try {
        await loadInbox(args.company.id)
        const reloaded = useAppStore.getState()
        if (reloaded.barkosDecisionInboxLoadState === 'error') {
          setRefreshState('error')
          setError(reloaded.barkosDecisionInboxError)
        } else {
          setRefreshState('idle')
        }
      } catch (loadError) {
        setRefreshState('error')
        setError(errorMessage(loadError))
      } finally {
        busyRef.current = false
      }
      return
    }
    if (!args.company || !args.ledger || inboxLoadState !== 'ready') {
      return
    }
    busyRef.current = true
    setRefreshState('refreshing')
    setError(null)
    try {
      await syncInbox(args.company.id)
      if (!coordinator || !coordinatorTerminalHandle) {
        setLastRefreshedAt(Date.now())
        setRefreshState('idle')
        return
      }
      const result = await refreshBarkosDecisionRequestsOnRuntime({
        ledger: args.ledger,
        coordinator,
        coordinatorTerminalHandle
      })
      const currentInbox = useAppStore.getState().barkosDecisionInbox
      if (!currentInbox) {
        throw new Error('BarkOS decision inbox is not ready')
      }
      const merged = mergeBarkosDecisionRequests({
        inbox: currentInbox,
        discovered: result.requests
      })
      if (merged !== currentInbox) {
        await saveInbox(merged)
      }
      setCurrentRunId(result.currentRunId)
      setSkipped(result.skipped)
      setLastRefreshedAt(Date.now())
      setRefreshState('idle')
    } catch (refreshError) {
      setRefreshState('error')
      setError(errorMessage(refreshError))
    } finally {
      busyRef.current = false
    }
  }, [
    args.company,
    args.ledger,
    clearInboxError,
    coordinator,
    coordinatorTerminalHandle,
    inboxLoadState,
    loadInbox,
    saveInbox,
    syncInbox
  ])

  useEffect(() => {
    if (inboxLoadState !== 'ready' || !args.ledger || !args.company) {
      return
    }
    void refresh()
    if (!hasActiveDispatch) {
      return
    }
    const intervalId = window.setInterval(() => void refresh(), DECISION_INBOX_POLL_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [args.company, args.ledger, hasActiveDispatch, inboxLoadState, refresh])

  const resolve = useCallback(
    async (
      request: BarkosDecisionRequest,
      kind: BarkosDecisionResolutionKind,
      resolution: string
    ): Promise<void> => {
      if (busyRef.current) {
        throw new Error('BarkOS decision inbox is busy')
      }
      if (request.sourceKind === 'side-effect') {
        busyRef.current = true
        setError(null)
        try {
          if (kind !== 'approved' && kind !== 'rejected') {
            throw new Error('BarkOS side-effect requests require approval or rejection')
          }
          await resolveSideEffect(request.id, kind)
        } catch (resolutionError) {
          setError(errorMessage(resolutionError))
          throw resolutionError
        } finally {
          busyRef.current = false
        }
        return
      }
      if (!args.ledger || !coordinator || !coordinatorTerminalHandle) {
        throw new Error('The BarkOS coordinator terminal is not ready')
      }
      const currentInbox = useAppStore.getState().barkosDecisionInbox
      if (!currentInbox) {
        throw new Error('BarkOS decision inbox is not ready')
      }
      busyRef.current = true
      setError(null)
      let preparedPersisted = false
      let prepared = beginBarkosDecisionResolution({
        inbox: currentInbox,
        requestId: request.id,
        kind,
        resolution
      })
      try {
        prepared = await saveInbox(prepared)
        preparedPersisted = true
        await resolveBarkosDecisionRequestOnRuntime({
          ledger: args.ledger,
          request,
          resolution,
          coordinator,
          coordinatorTerminalHandle
        })
        await saveInbox(
          completeBarkosDecisionResolution({ inbox: prepared, requestId: request.id })
        )
      } catch (resolutionError) {
        if (
          preparedPersisted &&
          prepared.requests.find((entry) => entry.id === request.id)?.status === 'resolving'
        ) {
          try {
            await saveInbox(
              markBarkosDecisionResolutionUncertain({
                inbox: prepared,
                requestId: request.id
              })
            )
          } catch {
            // The durable resolving record remains the conservative recovery state.
          }
        }
        setError(errorMessage(resolutionError))
        throw resolutionError
      } finally {
        busyRef.current = false
      }
    },
    [args.ledger, coordinator, coordinatorTerminalHandle, resolveSideEffect, saveInbox]
  )

  return { refreshState, currentRunId, lastRefreshedAt, skipped, error, refresh, resolve }
}
