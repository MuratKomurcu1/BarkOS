import { useMemo } from 'react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import type { BarkosWorkerSessionBinding } from '../../../../shared/barkos/worker-session'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import { projectBarkosLiveOffice, type BarkosLiveOfficeWorker } from '@/lib/barkos-live-office'
import { resolveBarkosWorkerTerminalStatus } from '@/lib/barkos-orchestration-target'
import type { BarkosWorkerSessionState } from '@/lib/barkos-worker-session-state'
import { useAppStore } from '@/store'

export function useBarkosLiveOfficeProjection(args: {
  company: BarkosCompany
  ledger: BarkosWorkLedger | null
  workerSessions: Readonly<Record<string, BarkosWorkerSessionBinding>>
  workerSessionStates: Readonly<Record<string, BarkosWorkerSessionState>>
}): BarkosLiveOfficeWorker[] {
  const statuses = useAppStore((state) => state.agentStatusByPaneKey)
  const agentStatuses = useMemo(
    () =>
      Object.fromEntries(
        args.company.workers.map((worker) => {
          const binding = args.workerSessions[worker.id]
          return [worker.id, binding ? resolveBarkosWorkerTerminalStatus(binding, statuses) : null]
        })
      ),
    [args.company.workers, args.workerSessions, statuses]
  )

  return useMemo(
    () =>
      projectBarkosLiveOffice({
        company: args.company,
        ledger: args.ledger,
        workerSessions: args.workerSessions,
        workerSessionStates: args.workerSessionStates,
        agentStatuses
      }),
    [agentStatuses, args.company, args.ledger, args.workerSessionStates, args.workerSessions]
  )
}
