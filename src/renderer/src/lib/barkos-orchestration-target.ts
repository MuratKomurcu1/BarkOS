import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import { parseExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { TerminalLayoutSnapshot } from '../../../shared/terminal-tab-types'
import type { RuntimeClientTarget } from '../runtime/runtime-client-target'
import { isWebTerminalSurfaceTabId } from '../runtime/web-terminal-surface-id'

function statusMatchesBindingHost(
  binding: BarkosWorkerSessionBinding,
  entry: AgentStatusEntry
): boolean {
  const host = parseExecutionHostId(binding.executionHostId)
  if (!host || !binding.tabId) {
    return false
  }
  if (host.kind === 'runtime') {
    return isWebTerminalSurfaceTabId(binding.tabId)
  }
  if (host.kind === 'ssh') {
    return entry.connectionId === host.targetId && !isWebTerminalSurfaceTabId(binding.tabId)
  }
  return entry.connectionId == null && !isWebTerminalSurfaceTabId(binding.tabId)
}

export function runtimeTargetForBarkosExecutionHost(
  executionHostId: ExecutionHostId
): RuntimeClientTarget | null {
  const host = parseExecutionHostId(executionHostId)
  if (!host) {
    return null
  }
  return host.kind === 'runtime'
    ? { kind: 'environment', environmentId: host.environmentId }
    : { kind: 'local' }
}

export function barkosRuntimeTargetsEqual(
  left: RuntimeClientTarget,
  right: RuntimeClientTarget
): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === 'local' ||
      (right.kind === 'environment' && left.environmentId === right.environmentId))
  )
}

export function resolveBarkosWorkerTerminalHandle(
  binding: BarkosWorkerSessionBinding,
  statuses: Readonly<Record<string, AgentStatusEntry>>
): string | null {
  return resolveBarkosWorkerTerminalStatus(binding, statuses)?.terminalHandle ?? null
}

export function resolveBarkosWorkerTerminalStatus(
  binding: BarkosWorkerSessionBinding,
  statuses: Readonly<Record<string, AgentStatusEntry>>
): AgentStatusEntry | null {
  if (!binding.tabId) {
    return null
  }
  const candidates = Object.values(statuses)
    .filter(
      (entry) =>
        entry.tabId === binding.tabId &&
        entry.agentType === binding.agent &&
        (entry.worktreeId === undefined || entry.worktreeId === binding.workspaceId) &&
        statusMatchesBindingHost(binding, entry) &&
        Boolean(entry.terminalHandle)
    )
    .toSorted((left, right) => right.updatedAt - left.updatedAt)
  return candidates[0] ?? null
}

export function resolveBarkosWorkerPtyId(
  binding: BarkosWorkerSessionBinding,
  statuses: Readonly<Record<string, AgentStatusEntry>>,
  layouts: Readonly<Record<string, TerminalLayoutSnapshot>>
): string | null {
  const status = resolveBarkosWorkerTerminalStatus(binding, statuses)
  const pane = status ? parsePaneKey(status.paneKey) : null
  if (!pane || pane.tabId !== binding.tabId) {
    return null
  }
  return layouts[pane.tabId]?.ptyIdsByLeafId?.[pane.leafId] ?? null
}
