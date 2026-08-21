import type { BarkosWorker } from '../../../shared/barkos/company'
import { barkosAgentDisplayName } from '../../../shared/barkos/company-agent-default'
import { getActiveSidebarWorkspaceId } from '../../../shared/workspace-scope'
import { useAppStore } from '@/store'
import {
  collectBarkosWorkerLaunchTargets,
  explainBarkosWorkerTargetGap,
  pickDefaultBarkosWorkerLaunchTarget,
  type BarkosWorkerLaunchTarget
} from './barkos-worker-launch-targets'
import { acquireBarkosProjectWorkspace } from './barkos-project-workspace-acquisition'

export function resolveBarkosDefaultWorkerTarget(
  worker: BarkosWorker
): BarkosWorkerLaunchTarget | null {
  const state = useAppStore.getState()
  const targets = collectBarkosWorkerLaunchTargets(
    {
      detectedAgentIds: state.detectedAgentIds,
      remoteDetectedAgentIds: state.remoteDetectedAgentIds,
      runtimeDetectedAgentIds: state.runtimeDetectedAgentIds,
      disabledTuiAgents: state.settings?.disabledTuiAgents ?? null,
      repos: state.repos,
      worktreesByRepo: state.worktreesByRepo,
      folderWorkspaces: state.folderWorkspaces,
      projectGroups: state.projectGroups,
      runtimeEnvironments: state.runtimeEnvironments,
      sshTargetLabels: state.sshTargetLabels
    },
    worker
  )
  return pickDefaultBarkosWorkerLaunchTarget(
    targets,
    worker,
    getActiveSidebarWorkspaceId(state.activeWorkspaceKey, state.activeWorktreeId),
    state.activeWorkspaceExecutionHostId
  )
}

export async function ensureBarkosProjectWorkerTarget(
  worker: BarkosWorker
): Promise<BarkosWorkerLaunchTarget | null> {
  const acquired = await acquireBarkosProjectWorkspace({
    currentTarget: resolveBarkosDefaultWorkerTarget(worker),
    pickFolder: () => window.api.repos.pickFolder(),
    addFolder: (path) =>
      useAppStore.getState().addNonGitFolder(path, {
        runtimeEnvironmentId: null
      }),
    resolveTarget: () => resolveBarkosDefaultWorkerTarget(worker)
  })
  return acquired.state === 'ready' ? acquired.target : null
}

/** Why: a null launch target hides the reason. Intake must tell the user what
 * to fix (install/re-enable an agent) instead of dropping them into an empty
 * shell terminal — handoff item 2's actual failure mode. */
export function describeBarkosWorkerTargetGap(worker: BarkosWorker): string | null {
  const state = useAppStore.getState()
  const gap = explainBarkosWorkerTargetGap(
    {
      detectedAgentIds: state.detectedAgentIds,
      remoteDetectedAgentIds: state.remoteDetectedAgentIds,
      runtimeDetectedAgentIds: state.runtimeDetectedAgentIds,
      disabledTuiAgents: state.settings?.disabledTuiAgents ?? null,
      repos: state.repos,
      worktreesByRepo: state.worktreesByRepo,
      folderWorkspaces: state.folderWorkspaces,
      projectGroups: state.projectGroups,
      runtimeEnvironments: state.runtimeEnvironments,
      sshTargetLabels: state.sshTargetLabels
    },
    worker
  )
  switch (gap.kind) {
    case 'no-workspace':
      return null
    case 'agent-disabled':
      return `${barkosAgentDisplayName(gap.agent)} ajanı BarkOS'ta devre dışı. Ayarlar → Ajanlar bölümünden etkinleştirin ve tekrar deneyin.`
    case 'agent-not-detected': {
      const detected = gap.detected.map((agent) => barkosAgentDisplayName(agent))
      const detectedList =
        detected.length > 0
          ? ` Algılanan ajanlar: ${detected.join(', ')}.`
          : ' Şu anda algılanan ajan yok.'
      return `${barkosAgentDisplayName(gap.agent)} komutu çalışma alanlarının makinesinde bulunamadı.${detectedList} CLI'ı kurun veya çalışanın ajanını değiştirin.`
    }
    case 'workspace-incompatible':
      return `${worker.name} çalışanın "${worker.workspacePolicy}" çalışma alanı ilkesi mevcut çalışma alanlarıyla uyumsuz.`
  }
}
