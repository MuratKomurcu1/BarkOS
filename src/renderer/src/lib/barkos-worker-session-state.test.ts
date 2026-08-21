import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import {
  resolveBarkosWorkerSessionState,
  resolveReadyBarkosWorkerRuntime
} from './barkos-worker-session-state'

const binding: BarkosWorkerSessionBinding = {
  workerId: 'ada',
  agent: 'codex',
  targetId: '5:localworkspace-main',
  workspaceId: 'workspace-main',
  workspaceKind: 'worktree',
  executionHostId: 'local',
  tabId: 'tab-1',
  state: 'created',
  launchedAt: 1
}

const tab: TerminalTab = {
  id: 'tab-1',
  ptyId: null,
  worktreeId: 'workspace-main',
  title: 'Codex',
  customTitle: null,
  color: null,
  sortOrder: 0,
  createdAt: 1,
  launchAgent: 'codex'
}

const status: AgentStatusEntry = {
  state: 'working',
  prompt: '',
  updatedAt: 2,
  stateStartedAt: 2,
  agentType: 'codex',
  paneKey: 'tab-1:leaf-1',
  terminalHandle: 'terminal-1',
  worktreeId: 'workspace-main',
  tabId: 'tab-1',
  stateHistory: []
}

describe('BarkOS worker session state', () => {
  it('requires a recognized live agent status before declaring readiness', () => {
    expect(
      resolveBarkosWorkerSessionState({
        binding,
        statuses: {},
        tabsByWorktree: { 'workspace-main': [tab] }
      })
    ).toBe('starting')
    expect(
      resolveBarkosWorkerSessionState({
        binding,
        statuses: { status },
        tabsByWorktree: { 'workspace-main': [tab] }
      })
    ).toBe('ready')
    expect(resolveReadyBarkosWorkerRuntime({ binding, statuses: { status } })).toEqual({
      binding,
      terminalHandle: 'terminal-1',
      state: 'working'
    })
  })

  it('distinguishes missing, unconfirmed, and absent session identities', () => {
    expect(resolveBarkosWorkerSessionState({ binding, statuses: {}, tabsByWorktree: {} })).toBe(
      'relaunch-required'
    )
    expect(
      resolveBarkosWorkerSessionState({
        binding: { ...binding, tabId: null, state: 'requested' },
        statuses: {},
        tabsByWorktree: {}
      })
    ).toBe('requested')
    expect(
      resolveBarkosWorkerSessionState({ binding: null, statuses: {}, tabsByWorktree: {} })
    ).toBe('unbound')
  })
})
