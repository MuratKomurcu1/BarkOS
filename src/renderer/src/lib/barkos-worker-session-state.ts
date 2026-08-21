import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { AgentProviderSessionMetadata } from '../../../shared/agent-session-resume'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import { resolveBarkosWorkerTerminalStatus } from './barkos-orchestration-target'

export type BarkosWorkerSessionState =
  | 'unbound'
  | 'requested'
  | 'starting'
  | 'ready'
  | 'relaunch-required'

export type BarkosReadyWorkerRuntime = {
  binding: BarkosWorkerSessionBinding
  terminalHandle: string
  providerSession?: AgentProviderSessionMetadata
  sessionBoundary?: boolean
  state: AgentStatusEntry['state']
}

export function resolveBarkosWorkerSessionState(args: {
  binding: BarkosWorkerSessionBinding | null | undefined
  statuses: Readonly<Record<string, AgentStatusEntry>>
  tabsByWorktree: Readonly<Record<string, readonly TerminalTab[]>>
}): BarkosWorkerSessionState {
  const binding = args.binding
  if (!binding) {
    return 'unbound'
  }
  if (!binding.tabId) {
    return 'requested'
  }
  if (resolveBarkosWorkerTerminalStatus(binding, args.statuses)) {
    return 'ready'
  }
  const tabExists = (args.tabsByWorktree[binding.workspaceId] ?? []).some(
    (tab) => tab.id === binding.tabId && tab.launchAgent === binding.agent
  )
  return tabExists ? 'starting' : 'relaunch-required'
}

export function resolveReadyBarkosWorkerRuntime(args: {
  binding: BarkosWorkerSessionBinding | null | undefined
  statuses: Readonly<Record<string, AgentStatusEntry>>
}): BarkosReadyWorkerRuntime | null {
  if (!args.binding) {
    return null
  }
  const status = resolveBarkosWorkerTerminalStatus(args.binding, args.statuses)
  return status?.terminalHandle
    ? {
        binding: args.binding,
        terminalHandle: status.terminalHandle,
        state: status.state,
        ...(status.providerSession ? { providerSession: status.providerSession } : {}),
        ...(status.sessionBoundary !== undefined ? { sessionBoundary: status.sessionBoundary } : {})
      }
    : null
}
