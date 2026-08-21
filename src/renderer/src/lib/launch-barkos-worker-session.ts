import { useAppStore } from '@/store'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import {
  activateAndRevealFolderWorkspace,
  activateAndRevealWorktree
} from '@/lib/worktree-activation'
import type { BarkosCompany } from '../../../shared/barkos/company'
import { selectBarkosMemoryContext } from '../../../shared/barkos/memory-context'
import { buildBarkosWorkerBriefing } from '../../../shared/barkos/worker-briefing'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import { isTuiAgent, TUI_AGENT_CONFIG } from '../../../shared/tui-agent-config'
import { isTuiAgentEnabled } from '../../../shared/tui-agent-selection'
import { parseExecutionHostId } from '../../../shared/execution-host'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import {
  isBarkosLocalSideEffectAgent,
  isBarkosPairedSideEffectAgent
} from '../../../shared/barkos/side-effect-capable-agent'
import { barkosPairedApprovalVersionForAgent } from '../../../shared/barkos/paired-side-effect-approval'
import type { BarkosWorkerLaunchTarget } from './barkos-worker-launch-targets'
import { getLocalProjectExecutionRuntimeContext } from './local-preflight-context'

export type LaunchBarkosWorkerSessionResult =
  | { ok: true; binding: BarkosWorkerSessionBinding }
  | {
      ok: false
      reason:
        | 'agent-not-supported'
        | 'agent-disabled'
        | 'agent-not-available'
        | 'role-not-found'
        | 'target-incompatible'
        | 'workspace-unavailable'
        | 'approval-channel-unavailable'
        | 'launch-rejected'
    }

export function activateBarkosWorkerLaunchTarget(target: BarkosWorkerLaunchTarget): boolean {
  const workspaceScope = parseWorkspaceKey(target.workspaceId)
  const activation =
    workspaceScope?.type === 'folder'
      ? activateAndRevealFolderWorkspace(workspaceScope.folderWorkspaceId, {
          executionHostId: target.executionHostId
        })
      : activateAndRevealWorktree(target.workspaceId, {
          executionHostId: target.executionHostId
        })
  return activation !== false
}

async function prepareBarkosWorkerWorkspaceTrust(
  worker: BarkosCompany['workers'][number],
  target: BarkosWorkerLaunchTarget
): Promise<void> {
  const preset = TUI_AGENT_CONFIG[worker.agentId].preflightTrust
  const executionHost = parseExecutionHostId(target.executionHostId)
  if (!preset || executionHost?.kind === 'runtime' || !window.api.agentTrust?.markTrusted) {
    return
  }
  const workspacePath =
    target.workspacePath ??
    useAppStore.getState().getKnownWorktreeById(target.workspaceId, target.executionHostId)?.path
  if (!workspacePath) {
    return
  }
  try {
    await window.api.agentTrust.markTrusted({
      preset,
      workspacePath,
      ...(executionHost?.kind === 'ssh' ? { connectionId: executionHost.targetId } : {})
    })
  } catch {
    // The provider can still present its own trust prompt when the preset cannot be written.
  }
}

export async function launchBarkosWorkerSession(args: {
  company: BarkosCompany
  workerId: string
  target: BarkosWorkerLaunchTarget
  now?: number
}): Promise<LaunchBarkosWorkerSessionResult> {
  const worker = args.company.workers.find((entry) => entry.id === args.workerId)
  if (!worker || !isTuiAgent(worker.agentId)) {
    return { ok: false, reason: 'agent-not-supported' }
  }
  const store = useAppStore.getState()
  if (!isTuiAgentEnabled(worker.agentId, store.settings?.disabledTuiAgents)) {
    return { ok: false, reason: 'agent-disabled' }
  }
  if (!args.target.agentAvailable) {
    return { ok: false, reason: 'agent-not-available' }
  }
  if (!args.target.compatible) {
    return { ok: false, reason: 'target-incompatible' }
  }
  const role = args.company.roles.find((entry) => entry.id === worker.roleId)
  if (!role) {
    return { ok: false, reason: 'role-not-found' }
  }

  const executionHost = parseExecutionHostId(args.target.executionHostId)
  const pairedApproval =
    executionHost?.kind === 'runtime' && isBarkosPairedSideEffectAgent(worker.agentId)
      ? {
          environmentId: executionHost.environmentId,
          agent: worker.agentId,
          version: barkosPairedApprovalVersionForAgent(worker.agentId)
        }
      : null
  if (worker.agentId === 'droid' || worker.agentId === 'gemini') {
    if (!executionHost) {
      return { ok: false, reason: 'approval-channel-unavailable' }
    }
    const projectRuntime =
      executionHost.kind === 'local'
        ? getLocalProjectExecutionRuntimeContext(store, args.target.workspaceId)
        : undefined
    const targetsWsl =
      (projectRuntime?.status === 'resolved' && projectRuntime.runtime.kind === 'wsl') ||
      (projectRuntime?.status === 'repair-required' &&
        projectRuntime.repair.preferredRuntime.kind === 'wsl')
    if (executionHost.kind === 'local' && !targetsWsl) {
      try {
        const status =
          worker.agentId === 'droid'
            ? await window.api.agentHooks.droidStatus()
            : await window.api.agentHooks.geminiStatus()
        if (status.state !== 'installed' || !status.managedHooksPresent) {
          return { ok: false, reason: 'approval-channel-unavailable' }
        }
      } catch {
        return { ok: false, reason: 'approval-channel-unavailable' }
      }
    }
  }
  if (
    pairedApproval !== null &&
    !(await window.api.barkosDecisionInbox.preparePairedSideEffectApproval(
      pairedApproval.environmentId,
      pairedApproval.agent
    ))
  ) {
    return { ok: false, reason: 'approval-channel-unavailable' }
  }

  await prepareBarkosWorkerWorkspaceTrust(worker, args.target)

  if (!activateBarkosWorkerLaunchTarget(args.target)) {
    return { ok: false, reason: 'workspace-unavailable' }
  }

  const vault = store.barkosMemoryVault
  const memoryContext =
    vault?.companyId === args.company.id && vault.companyCreatedAt === args.company.createdAt
      ? selectBarkosMemoryContext({
          vault,
          company: args.company,
          worker,
          workspaceId: args.target.workspaceId
        }).text
      : null

  const launch = launchAgentInNewTab({
    agent: worker.agentId,
    worktreeId: args.target.workspaceId,
    prompt: buildBarkosWorkerBriefing(args.company, worker, role, memoryContext),
    promptDelivery: 'auto-submit',
    launchSource: 'unknown',
    ...(executionHost?.kind !== 'runtime' && isBarkosLocalSideEffectAgent(worker.agentId)
      ? { additionalEnv: { ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' } }
      : {}),
    ...(pairedApproval ? { pairedSideEffectApprovalVersion: pairedApproval.version } : {})
  })
  if (!launch) {
    return { ok: false, reason: 'launch-rejected' }
  }

  const tabId = launch.tabId ?? (await launch.tabIdResult)
  const binding: BarkosWorkerSessionBinding = {
    workerId: worker.id,
    agent: worker.agentId,
    targetId: args.target.id,
    workspaceId: args.target.workspaceId,
    workspaceKind: args.target.workspaceKind,
    executionHostId: args.target.executionHostId,
    tabId,
    state: tabId ? 'created' : 'requested',
    launchedAt: args.now ?? Date.now()
  }
  try {
    await store.recordBarkosWorkerSession(binding)
  } catch {
    // Why: the agent already exists; treating a disk error as launch failure invites a duplicate retry.
  }
  return { ok: true, binding }
}
