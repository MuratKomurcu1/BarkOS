import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBarkosCompany } from '../../../shared/barkos/company'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  launchNormal: vi.fn(),
  launchSleeping: vi.fn(),
  prepareResume: vi.fn(),
  record: vi.fn(),
  resolveTarget: vi.fn(),
  wait: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ recordBarkosWorkerSession: mocks.record }) }
}))
vi.mock('./ensure-barkos-worker-session', () => ({
  BARKOS_WORKER_READY_TIMEOUT_MS: 30_000,
  resolveBarkosPersistedWorkerLaunchTarget: mocks.resolveTarget,
  waitForBarkosWorkerRuntime: mocks.wait
}))
vi.mock('./launch-barkos-worker-session', () => ({
  activateBarkosWorkerLaunchTarget: mocks.activate,
  launchBarkosWorkerSession: mocks.launchNormal
}))
vi.mock('./sleeping-agent-session-launch', () => ({
  launchSleepingAgentSession: mocks.launchSleeping
}))

import { launchBarkosCodexFailoverSession } from './launch-barkos-codex-failover-session'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship dependable systems.',
  leadName: 'Ada',
  now: 1
})

const binding: BarkosWorkerSessionBinding = {
  workerId: company.leadWorkerId,
  agent: 'codex',
  targetId: 'target-1',
  workspaceId: 'workspace-1',
  workspaceKind: 'worktree',
  executionHostId: 'local',
  tabId: 'tab-old',
  state: 'created',
  launchedAt: 2
}

const sourceStatus = {
  state: 'done' as const,
  prompt: 'Build the release.',
  updatedAt: 3,
  paneKey: 'tab-old:leaf-1',
  providerSession: {
    key: 'session_id' as const,
    id: 'session-1',
    transcriptPath: '/managed/a/sessions/2026/08/18/rollout-session-1.jsonl'
  }
}

beforeEach(() => {
  mocks.activate.mockReset().mockReturnValue(true)
  mocks.launchNormal.mockReset()
  mocks.launchSleeping.mockReset()
  mocks.prepareResume.mockReset().mockResolvedValue({
    ...sourceStatus.providerSession,
    transcriptPath: '/managed/b/sessions/2026/08/18/rollout-session-1.jsonl'
  })
  mocks.record.mockReset().mockResolvedValue(undefined)
  mocks.resolveTarget.mockReset().mockReturnValue({ compatible: true, agentAvailable: true })
  mocks.wait.mockReset().mockResolvedValue({
    binding: { ...binding, tabId: 'tab-new' },
    terminalHandle: 'terminal-new',
    state: 'done',
    providerSession: sourceStatus.providerSession
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { api: { codexAccounts: { prepareFailoverResume: mocks.prepareResume } } }
  })
})

describe('BarkOS Codex failover session launch', () => {
  it('resumes only the rollout prepared inside the selected managed account', async () => {
    mocks.launchSleeping.mockImplementation((_record, options) => {
      options.onSessionLaunched('tab-new')
      return true
    })

    await expect(
      launchBarkosCodexFailoverSession({
        company,
        binding,
        sourceStatus,
        targetAccountId: 'account-b',
        conversationMode: 'same-conversation',
        timeoutMs: 100
      })
    ).resolves.toMatchObject({ terminalHandle: 'terminal-new' })

    expect(mocks.prepareResume).toHaveBeenCalledWith({
      accountId: 'account-b',
      providerSession: sourceStatus.providerSession
    })
    expect(mocks.launchSleeping).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'codex',
        providerSession: expect.objectContaining({
          id: 'session-1',
          transcriptPath: expect.stringContaining('/managed/b/')
        })
      }),
      expect.objectContaining({ suppressNavigation: true })
    )
    expect(mocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ tabId: 'tab-new', state: 'created' })
    )
    const waitArgs = mocks.wait.mock.calls[0][0]
    expect(waitArgs.accept({ state: 'done', providerSession: sourceStatus.providerSession })).toBe(
      true
    )
    expect(
      waitArgs.accept({
        state: 'done',
        providerSession: { ...sourceStatus.providerSession, id: 'other' }
      })
    ).toBe(false)
  })

  it('uses a fresh briefing and waits for its settled Codex session when resume is unavailable', async () => {
    const nextBinding = { ...binding, tabId: 'tab-new' }
    mocks.launchNormal.mockResolvedValue({ ok: true, binding: nextBinding })

    await launchBarkosCodexFailoverSession({
      company,
      binding,
      sourceStatus: { ...sourceStatus, providerSession: undefined },
      targetAccountId: null,
      conversationMode: 'new-session',
      timeoutMs: 100
    })

    expect(mocks.prepareResume).not.toHaveBeenCalled()
    expect(mocks.launchNormal).toHaveBeenCalledWith({
      company,
      workerId: binding.workerId,
      target: expect.objectContaining({ compatible: true })
    })
    const waitArgs = mocks.wait.mock.calls[0][0]
    expect(
      waitArgs.accept({
        state: 'done',
        sessionBoundary: false,
        providerSession: sourceStatus.providerSession
      })
    ).toBe(true)
    expect(
      waitArgs.accept({
        state: 'done',
        sessionBoundary: true,
        providerSession: sourceStatus.providerSession
      })
    ).toBe(false)
  })
})
