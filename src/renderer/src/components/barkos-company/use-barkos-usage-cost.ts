import { useCallback, useEffect, useRef, useState } from 'react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import {
  createEmptyBarkosUsageCostLedger,
  type BarkosUsageCostCandidate,
  type BarkosUsageCostLedger
} from '../../../../shared/barkos/usage-cost-ledger'
import type { BarkosWorkerSessionBinding } from '../../../../shared/barkos/worker-session'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import { resolveBarkosWorkerTerminalStatus } from '@/lib/barkos-orchestration-target'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'

export type BarkosUsageCostLoadState = 'idle' | 'loading' | 'ready' | 'syncing' | 'error'

export type BarkosUsageCostController = {
  ledger: BarkosUsageCostLedger | null
  loadState: BarkosUsageCostLoadState
  error: string | null
  sync: () => Promise<void>
  reload: () => Promise<void>
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useBarkosUsageCost(args: {
  company: BarkosCompany | null
  workLedger: BarkosWorkLedger | null
  workerSessions: Record<string, BarkosWorkerSessionBinding>
  onMessage: (message: string) => void
}): BarkosUsageCostController {
  const { company, workLedger, workerSessions, onMessage } = args
  const statuses = useAppStore((state) => state.agentStatusByPaneKey)
  const [ledger, setLedger] = useState<BarkosUsageCostLedger | null>(null)
  const [loadState, setLoadState] = useState<BarkosUsageCostLoadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const requestGeneration = useRef(0)

  const reload = useCallback(async (): Promise<void> => {
    const generation = ++requestGeneration.current
    if (!company) {
      setLedger(null)
      setLoadState('idle')
      return
    }
    setLoadState('loading')
    setError(null)
    try {
      const loaded = await window.api.barkosUsageCost.load()
      if (generation !== requestGeneration.current) {
        return
      }
      setLedger(loaded ?? createEmptyBarkosUsageCostLedger(company.id, company.createdAt))
      setLoadState('ready')
    } catch (caught) {
      if (generation !== requestGeneration.current) {
        return
      }
      setError(errorMessage(caught))
      setLoadState('error')
    }
  }, [company])

  useEffect(() => {
    void reload()
    return () => {
      requestGeneration.current += 1
    }
  }, [reload])

  const sync = useCallback(async (): Promise<void> => {
    if (!company || !workLedger) {
      return
    }
    const generation = ++requestGeneration.current
    setLoadState('syncing')
    setError(null)
    const candidates: BarkosUsageCostCandidate[] = workLedger.dispatches.map((dispatch) => {
      const binding = workerSessions[dispatch.workerId]
      const status = binding ? resolveBarkosWorkerTerminalStatus(binding, statuses) : null
      const exactDispatch = status?.orchestration?.dispatchId === dispatch.orchestrationDispatchId
      return {
        dispatchId: dispatch.id,
        orchestrationDispatchId: exactDispatch ? (status.orchestration?.dispatchId ?? null) : null,
        providerSessionId: exactDispatch ? (status.providerSession?.id ?? null) : null
      }
    })
    try {
      const synced = await window.api.barkosUsageCost.sync({ candidates })
      if (generation !== requestGeneration.current) {
        return
      }
      setLedger(synced)
      setLoadState('ready')
      onMessage(
        translate(
          'barkos.cost.message.synced',
          'Provider usage records synchronized. No provider was contacted.'
        )
      )
    } catch (caught) {
      if (generation !== requestGeneration.current) {
        return
      }
      setError(errorMessage(caught))
      setLoadState('error')
    }
  }, [company, onMessage, statuses, workerSessions, workLedger])

  return { ledger, loadState, error, sync, reload }
}
