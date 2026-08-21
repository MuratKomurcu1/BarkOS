import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import {
  barkosRuntimeTargetsEqual,
  resolveBarkosWorkerPtyId,
  resolveBarkosWorkerTerminalHandle,
  runtimeTargetForBarkosExecutionHost
} from './barkos-orchestration-target'

function binding(overrides: Partial<BarkosWorkerSessionBinding> = {}): BarkosWorkerSessionBinding {
  return {
    workerId: 'ada',
    agent: 'codex',
    targetId: '5:localworkspace-a',
    workspaceId: 'workspace-a',
    workspaceKind: 'worktree',
    executionHostId: 'local',
    tabId: 'tab-a',
    state: 'created',
    launchedAt: 1,
    ...overrides
  }
}

function status(overrides: Partial<AgentStatusEntry> = {}): AgentStatusEntry {
  return {
    state: 'working',
    prompt: '',
    updatedAt: 1,
    stateStartedAt: 1,
    agentType: 'codex',
    paneKey: 'tab-a:leaf-a',
    terminalHandle: 'term_a',
    tabId: 'tab-a',
    stateHistory: [],
    ...overrides
  }
}

describe('BarkOS orchestration target resolution', () => {
  it('routes local and SSH sessions through the local runtime owner', () => {
    expect(runtimeTargetForBarkosExecutionHost('local')).toEqual({ kind: 'local' })
    expect(runtimeTargetForBarkosExecutionHost('ssh:build-host')).toEqual({ kind: 'local' })
  })

  it('routes paired sessions to their exact environment', () => {
    expect(runtimeTargetForBarkosExecutionHost('runtime:paired-1')).toEqual({
      kind: 'environment',
      environmentId: 'paired-1'
    })
    expect(
      barkosRuntimeTargetsEqual(
        { kind: 'environment', environmentId: 'paired-1' },
        { kind: 'environment', environmentId: 'paired-2' }
      )
    ).toBe(false)
  })

  it('resolves the newest matching live agent terminal for a worker tab', () => {
    expect(
      resolveBarkosWorkerTerminalHandle(binding(), {
        old: status({ terminalHandle: 'term_old', updatedAt: 2 }),
        newest: status({ terminalHandle: 'term_new', updatedAt: 3 }),
        otherAgent: status({ agentType: 'claude', terminalHandle: 'term_claude', updatedAt: 4 })
      })
    ).toBe('term_new')
  })

  it('does not guess a terminal for remote requests without a local tab binding', () => {
    expect(
      resolveBarkosWorkerTerminalHandle(binding({ tabId: null, state: 'requested' }), {
        candidate: status()
      })
    ).toBeNull()
  })

  it('rejects a status published by the wrong execution host or workspace', () => {
    expect(
      resolveBarkosWorkerTerminalHandle(binding(), {
        wrongWorkspace: status({ worktreeId: 'workspace-b' })
      })
    ).toBeNull()
    expect(
      resolveBarkosWorkerTerminalHandle(binding({ executionHostId: 'ssh:build-host' }), {
        wrongHost: status({ connectionId: 'other-host' })
      })
    ).toBeNull()
    expect(
      resolveBarkosWorkerTerminalHandle(binding({ executionHostId: 'ssh:build-host' }), {
        matchingHost: status({ connectionId: 'build-host' })
      })
    ).toBe('term_a')
  })

  it('resolves the exact PTY from the matching stable pane', () => {
    const leafId = '11111111-1111-4111-8111-111111111111'
    const matching = status({ paneKey: `tab-a:${leafId}` })

    expect(
      resolveBarkosWorkerPtyId(
        binding(),
        { matching },
        {
          'tab-a': {
            root: { type: 'leaf', leafId },
            activeLeafId: leafId,
            expandedLeafId: null,
            ptyIdsByLeafId: { [leafId]: 'pty-worker' }
          }
        }
      )
    ).toBe('pty-worker')
  })
})
