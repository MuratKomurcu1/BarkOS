import { useMemo } from 'react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import type { BarkosWorkerSessionBinding } from '../../../../shared/barkos/worker-session'
import {
  resolveBarkosWorkerSessionState,
  type BarkosWorkerSessionState
} from '@/lib/barkos-worker-session-state'
import { useAppStore } from '@/store'

export function useBarkosWorkerSessionStates(
  company: BarkosCompany | null,
  workerSessions: Record<string, BarkosWorkerSessionBinding>
): {
  workerSessionStates: Readonly<Record<string, BarkosWorkerSessionState>>
  terminalReadyWorkerIds: readonly string[]
} {
  const statuses = useAppStore((state) => state.agentStatusByPaneKey)
  const tabsByWorktree = useAppStore((state) => state.tabsByWorktree)
  const workerSessionStates = useMemo(
    () =>
      Object.fromEntries(
        (company?.workers ?? []).map((worker) => [
          worker.id,
          resolveBarkosWorkerSessionState({
            binding: workerSessions[worker.id],
            statuses,
            tabsByWorktree
          })
        ])
      ),
    [company, statuses, tabsByWorktree, workerSessions]
  )
  const terminalReadyWorkerIds = useMemo(
    () =>
      Object.entries(workerSessionStates)
        .filter(([, state]) => state === 'ready')
        .map(([workerId]) => workerId)
        .toSorted(),
    [workerSessionStates]
  )

  return { workerSessionStates, terminalReadyWorkerIds }
}
