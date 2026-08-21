import { useEffect, useRef } from 'react'
import { runBarkosProjectAutomationCycle } from '@/lib/barkos-project-automation-runtime'
import { useAppStore } from '@/store'

const REPORT_SYNC_INTERVAL_MS = 2_500

export function BarkosProjectAutomationGate(): null {
  const company = useAppStore((state) => state.barkosCompany)
  const companyLoadState = useAppStore((state) => state.barkosCompanyLoadState)
  const workerSessionLoadState = useAppStore((state) => state.barkosWorkerSessionLoadState)
  const workerSessionCompanyId = useAppStore((state) => state.barkosWorkerSessionRequestedCompanyId)
  const workLedgerLoadState = useAppStore((state) => state.barkosWorkLedgerLoadState)
  const workLedgerCompanyId = useAppStore((state) => state.barkosWorkLedgerRequestedCompanyId)
  const controlPolicyLoadState = useAppStore((state) => state.barkosControlPolicyLoadState)
  const controlPolicyCompanyId = useAppStore((state) => state.barkosControlPolicyRequestedCompanyId)
  const syncing = useRef(false)

  useEffect(() => {
    if (companyLoadState === 'idle') {
      void useAppStore.getState().loadBarkosCompany()
    }
  }, [companyLoadState])

  useEffect(() => {
    if (!company || companyLoadState !== 'ready') {
      return
    }
    const state = useAppStore.getState()
    if (workerSessionLoadState === 'idle' || workerSessionCompanyId !== company.id) {
      void state.loadBarkosWorkerSessions(company.id)
    }
    if (workLedgerLoadState === 'idle' || workLedgerCompanyId !== company.id) {
      void state.loadBarkosWorkLedger(company.id)
    }
    if (controlPolicyLoadState === 'idle' || controlPolicyCompanyId !== company.id) {
      void state.loadBarkosControlPolicy(company.id)
    }
  }, [
    company,
    companyLoadState,
    controlPolicyCompanyId,
    controlPolicyLoadState,
    workerSessionCompanyId,
    workerSessionLoadState,
    workLedgerCompanyId,
    workLedgerLoadState
  ])

  useEffect(() => {
    let cancelled = false
    const tick = async (): Promise<void> => {
      if (cancelled || syncing.current) {
        return
      }
      syncing.current = true
      try {
        await runBarkosProjectAutomationCycle()
      } catch (error) {
        if (!cancelled) {
          useAppStore.setState({
            barkosWorkLedgerError: error instanceof Error ? error.message : String(error)
          })
        }
      } finally {
        syncing.current = false
      }
    }
    void tick()
    const interval = setInterval(() => void tick(), REPORT_SYNC_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return null
}
