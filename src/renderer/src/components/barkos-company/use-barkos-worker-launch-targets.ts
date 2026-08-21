import { useMemo } from 'react'
import type { BarkosWorker } from '../../../../shared/barkos/company'
import { getActiveSidebarWorkspaceId } from '../../../../shared/workspace-scope'
import { useAppStore } from '@/store'
import {
  collectBarkosWorkerLaunchTargets,
  pickDefaultBarkosWorkerLaunchTarget,
  type BarkosWorkerLaunchTarget
} from '@/lib/barkos-worker-launch-targets'

export function useBarkosWorkerLaunchTargets(worker: BarkosWorker | null): {
  targets: BarkosWorkerLaunchTarget[]
  defaultTargetId: string | null
} {
  const detectedAgentIds = useAppStore((state) => state.detectedAgentIds)
  const remoteDetectedAgentIds = useAppStore((state) => state.remoteDetectedAgentIds)
  const runtimeDetectedAgentIds = useAppStore((state) => state.runtimeDetectedAgentIds)
  const disabledTuiAgents = useAppStore((state) => state.settings?.disabledTuiAgents ?? null)
  const repos = useAppStore((state) => state.repos)
  const worktreesByRepo = useAppStore((state) => state.worktreesByRepo)
  const folderWorkspaces = useAppStore((state) => state.folderWorkspaces)
  const projectGroups = useAppStore((state) => state.projectGroups)
  const runtimeEnvironments = useAppStore((state) => state.runtimeEnvironments)
  const sshTargetLabels = useAppStore((state) => state.sshTargetLabels)
  const activeWorkspaceKey = useAppStore((state) => state.activeWorkspaceKey)
  const activeWorktreeId = useAppStore((state) => state.activeWorktreeId)
  const activeExecutionHostId = useAppStore((state) => state.activeWorkspaceExecutionHostId)

  return useMemo(() => {
    if (!worker) {
      return { targets: [], defaultTargetId: null }
    }
    const targets = collectBarkosWorkerLaunchTargets(
      {
        detectedAgentIds,
        remoteDetectedAgentIds,
        runtimeDetectedAgentIds,
        disabledTuiAgents,
        repos,
        worktreesByRepo,
        folderWorkspaces,
        projectGroups,
        runtimeEnvironments,
        sshTargetLabels
      },
      worker
    )
    const activeWorkspaceId = getActiveSidebarWorkspaceId(activeWorkspaceKey, activeWorktreeId)
    const defaultTarget = pickDefaultBarkosWorkerLaunchTarget(
      targets,
      worker,
      activeWorkspaceId,
      activeExecutionHostId
    )
    return { targets, defaultTargetId: defaultTarget?.id ?? null }
  }, [
    activeExecutionHostId,
    activeWorkspaceKey,
    activeWorktreeId,
    detectedAgentIds,
    disabledTuiAgents,
    folderWorkspaces,
    projectGroups,
    remoteDetectedAgentIds,
    repos,
    runtimeDetectedAgentIds,
    runtimeEnvironments,
    sshTargetLabels,
    worker,
    worktreesByRepo
  ])
}
