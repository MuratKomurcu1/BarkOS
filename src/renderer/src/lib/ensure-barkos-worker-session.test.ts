import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBarkosCompany } from '../../../shared/barkos/company'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import { useAppStore } from '@/store'
import type { BarkosWorkerLaunchTarget } from './barkos-worker-launch-targets'

const mocks = vi.hoisted(() => ({
  collectTargets: vi.fn(),
  launch: vi.fn()
}))

vi.mock('./barkos-worker-launch-targets', () => ({
  collectBarkosWorkerLaunchTargets: mocks.collectTargets
}))

vi.mock('./launch-barkos-worker-session', () => ({
  launchBarkosWorkerSession: mocks.launch
}))

import { ensureBarkosWorkerSessionReady } from './ensure-barkos-worker-session'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship reliable work.',
  leadName: 'Ada',
  now: 1
})

function binding(tabId = 'tab-old'): BarkosWorkerSessionBinding {
  return {
    workerId: company.leadWorkerId,
    agent: 'codex',
    targetId: '5:localworkspace-main',
    workspaceId: 'workspace-main',
    workspaceKind: 'worktree',
    executionHostId: 'local',
    tabId,
    state: 'created',
    launchedAt: 2
  }
}

const target: BarkosWorkerLaunchTarget = {
  id: '5:localworkspace-main',
  workspaceId: 'workspace-main',
  executionHostId: 'local',
  projectName: 'BarkOS',
  workspaceName: 'main',
  workspaceKind: 'worktree',
  hostKind: 'local',
  hostLabel: null,
  compatible: true,
  agentAvailable: true
}

function readyStatus(tabId: string) {
  return {
    state: 'working' as const,
    prompt: '',
    updatedAt: 3,
    stateStartedAt: 3,
    agentType: 'codex',
    paneKey: `${tabId}:leaf-1`,
    terminalHandle: `terminal-${tabId}`,
    worktreeId: 'workspace-main',
    tabId,
    stateHistory: []
  }
}

beforeEach(() => {
  mocks.collectTargets.mockReset().mockReturnValue([target])
  mocks.launch.mockReset()
  useAppStore.setState({
    barkosWorkerSessions: {},
    agentStatusByPaneKey: {},
    tabsByWorktree: {}
  })
})

afterEach(() => {
  useAppStore.setState({
    barkosWorkerSessions: {},
    agentStatusByPaneKey: {},
    tabsByWorktree: {}
  })
})

describe('ensureBarkosWorkerSessionReady', () => {
  it('relaunches only the exact persisted target and waits for a live agent terminal', async () => {
    const stale = binding()
    const relaunched = binding('tab-new')
    useAppStore.setState({ barkosWorkerSessions: { [stale.workerId]: stale } })
    mocks.launch.mockImplementation(async () => {
      useAppStore.setState({ barkosWorkerSessions: { [relaunched.workerId]: relaunched } })
      queueMicrotask(() =>
        useAppStore.setState({
          agentStatusByPaneKey: { ready: readyStatus('tab-new') }
        })
      )
      return { ok: true, binding: relaunched }
    })

    await expect(
      ensureBarkosWorkerSessionReady({ company, workerId: stale.workerId, timeoutMs: 1_000 })
    ).resolves.toMatchObject({
      binding: { tabId: 'tab-new' },
      terminalHandle: 'terminal-tab-new'
    })
    expect(mocks.launch).toHaveBeenCalledWith({
      company,
      workerId: stale.workerId,
      target
    })
  })

  it('waits on an existing starting tab without creating a duplicate agent', async () => {
    const starting = binding()
    useAppStore.setState({
      barkosWorkerSessions: { [starting.workerId]: starting },
      tabsByWorktree: {
        'workspace-main': [
          {
            id: 'tab-old',
            ptyId: null,
            worktreeId: 'workspace-main',
            title: 'Codex',
            customTitle: null,
            color: null,
            sortOrder: 0,
            createdAt: 1,
            launchAgent: 'codex'
          }
        ]
      }
    })
    queueMicrotask(() =>
      useAppStore.setState({ agentStatusByPaneKey: { ready: readyStatus('tab-old') } })
    )

    await expect(
      ensureBarkosWorkerSessionReady({ company, workerId: starting.workerId, timeoutMs: 1_000 })
    ).resolves.toMatchObject({ terminalHandle: 'terminal-tab-old' })
    expect(mocks.launch).not.toHaveBeenCalled()
  })

  it('does not choose a workspace for a worker the user never bound', async () => {
    await expect(
      ensureBarkosWorkerSessionReady({
        company,
        workerId: company.leadWorkerId,
        timeoutMs: 1_000
      })
    ).rejects.toThrow('choose its exact workspace and host')
    expect(mocks.collectTargets).not.toHaveBeenCalled()
    expect(mocks.launch).not.toHaveBeenCalled()
  })
})
