import type { AppState } from '@/store/types'
import { collectActiveDashboardWorkspaces } from '../components/dashboard/dashboard-snapshot-workspaces'
import {
  getWorktreeExecutionHostId,
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../shared/execution-host'
import type { BarkosWorker } from '../../../shared/barkos/company'
import { isTuiAgent } from '../../../shared/tui-agent-config'
import { isTuiAgentEnabled } from '../../../shared/tui-agent-selection'

export type BarkosWorkerLaunchTarget = {
  id: string
  workspaceId: string
  workspacePath?: string
  executionHostId: ExecutionHostId
  projectName: string
  workspaceName: string
  workspaceKind: 'folder' | 'worktree'
  hostKind: 'local' | 'ssh' | 'remote'
  hostLabel: string | null
  compatible: boolean
  agentAvailable: boolean
}

export type BarkosWorkerLaunchTargetState = Pick<
  AppState,
  | 'detectedAgentIds'
  | 'folderWorkspaces'
  | 'projectGroups'
  | 'remoteDetectedAgentIds'
  | 'repos'
  | 'runtimeDetectedAgentIds'
  | 'runtimeEnvironments'
  | 'sshTargetLabels'
  | 'worktreesByRepo'
> & { disabledTuiAgents: readonly unknown[] | null }

export function barkosWorkerLaunchTargetId(
  executionHostId: ExecutionHostId,
  workspaceId: string
): string {
  return `${executionHostId.length}:${executionHostId}${workspaceId}`
}

function availableAgentsForHost(
  state: BarkosWorkerLaunchTargetState,
  executionHostId: ExecutionHostId
): readonly string[] {
  const host = parseExecutionHostId(executionHostId)
  switch (host?.kind) {
    case 'ssh':
      return state.remoteDetectedAgentIds[host.targetId] ?? []
    case 'runtime':
      return state.runtimeDetectedAgentIds[host.environmentId] ?? []
    case 'local':
    case undefined:
      return state.detectedAgentIds ?? []
  }
}

export function collectBarkosWorkerLaunchTargets(
  state: BarkosWorkerLaunchTargetState,
  worker: BarkosWorker
): BarkosWorkerLaunchTarget[] {
  const agent = isTuiAgent(worker.agentId) ? worker.agentId : null
  const enabled = agent !== null && isTuiAgentEnabled(agent, state.disabledTuiAgents)
  const workspaces = collectActiveDashboardWorkspaces({
    repos: state.repos,
    worktreesByRepo: state.worktreesByRepo,
    folderWorkspaces: state.folderWorkspaces,
    projectGroups: state.projectGroups,
    runtimeEnvironments: state.runtimeEnvironments,
    sshTargetLabels: state.sshTargetLabels
  })
  return workspaces.map((workspace) => {
    const executionHostId = getWorktreeExecutionHostId(
      workspace.worktree,
      workspace.repo ?? undefined
    )
    const compatible =
      worker.workspacePolicy !== 'isolated-worktree' ||
      (workspace.workspaceKind === 'worktree' && workspace.worktree.isMainWorktree === false)
    const agentAvailable =
      enabled && agent !== null && availableAgentsForHost(state, executionHostId).includes(agent)
    return {
      id: barkosWorkerLaunchTargetId(executionHostId, workspace.worktree.id),
      workspaceId: workspace.worktree.id,
      workspacePath: workspace.worktree.path,
      executionHostId,
      projectName: workspace.projectName,
      workspaceName: workspace.worktree.displayName,
      workspaceKind: workspace.workspaceKind,
      hostKind: workspace.remoteHostKind ?? 'local',
      hostLabel: workspace.hostLabel ?? null,
      compatible,
      agentAvailable
    }
  })
}

export function pickDefaultBarkosWorkerLaunchTarget(
  targets: readonly BarkosWorkerLaunchTarget[],
  worker: BarkosWorker,
  activeWorkspaceId: string | null,
  activeExecutionHostId: ExecutionHostId | null
): BarkosWorkerLaunchTarget | null {
  const eligible = targets.filter((target) => target.compatible && target.agentAvailable)
  if (worker.preferredEnvironmentId) {
    const preferred = eligible.find((target) => {
      const host = parseExecutionHostId(target.executionHostId)
      return host?.kind === 'runtime' && host.environmentId === worker.preferredEnvironmentId
    })
    if (preferred) {
      return preferred
    }
  }
  return (
    eligible.find(
      (target) =>
        target.workspaceId === activeWorkspaceId &&
        (!activeExecutionHostId || target.executionHostId === activeExecutionHostId)
    ) ??
    eligible[0] ??
    null
  )
}

export type BarkosWorkerTargetGap =
  | { kind: 'no-workspace' }
  | { kind: 'agent-disabled'; agent: string }
  | { kind: 'agent-not-detected'; agent: string; detected: readonly string[] }
  | { kind: 'workspace-incompatible'; agent: string }

/** Why: `pickDefaultBarkosWorkerLaunchTarget` collapsing to null hides WHY the
 * worker cannot launch. Intake needs the precise gap to tell the user what to
 * fix (install a CLI, re-enable an agent) instead of failing with a shell. */
export function explainBarkosWorkerTargetGap(
  state: BarkosWorkerLaunchTargetState,
  worker: BarkosWorker
): BarkosWorkerTargetGap {
  const agent = isTuiAgent(worker.agentId) ? worker.agentId : null
  if (agent === null || !isTuiAgentEnabled(agent, state.disabledTuiAgents)) {
    return { kind: 'agent-disabled', agent: worker.agentId }
  }
  const workspaces = collectActiveDashboardWorkspaces({
    repos: state.repos,
    worktreesByRepo: state.worktreesByRepo,
    folderWorkspaces: state.folderWorkspaces,
    projectGroups: state.projectGroups,
    runtimeEnvironments: state.runtimeEnvironments,
    sshTargetLabels: state.sshTargetLabels
  })
  if (workspaces.length === 0) {
    return { kind: 'no-workspace' }
  }
  const detectedSomewhere = new Set<string>()
  let availableOnSomeWorkspace = false
  for (const workspace of workspaces) {
    const detectedOnHost = availableAgentsForHost(
      state,
      getWorktreeExecutionHostId(workspace.worktree, workspace.repo ?? undefined)
    )
    for (const detected of detectedOnHost) {
      detectedSomewhere.add(detected)
    }
    if (detectedOnHost.includes(agent)) {
      availableOnSomeWorkspace = true
    }
  }
  if (!availableOnSomeWorkspace) {
    return {
      kind: 'agent-not-detected',
      agent,
      detected: [...detectedSomewhere].sort((left, right) => left.localeCompare(right))
    }
  }
  return { kind: 'workspace-incompatible', agent }
}
