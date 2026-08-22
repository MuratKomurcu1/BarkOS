import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBarkosCompany, updateBarkosWorker } from '../../../shared/barkos/company'
import { parseBarkosMemoryVault } from '../../../shared/barkos/memory-vault'
import type { BarkosWorkerLaunchTarget } from './barkos-worker-launch-targets'

const mocks = vi.hoisted(() => ({
  activateFolder: vi.fn(),
  activateWorktree: vi.fn(),
  launchAgent: vi.fn(),
  projectRuntime: vi.fn(),
  droidStatus: vi.fn(),
  geminiStatus: vi.fn(),
  preparePairedApproval: vi.fn(),
  markTrusted: vi.fn(),
  recordSession: vi.fn(),
  state: {
    settings: { disabledTuiAgents: [] as string[] },
    barkosMemoryVault: null as ReturnType<typeof parseBarkosMemoryVault> | null,
    getKnownWorktreeById: vi.fn(),
    recordBarkosWorkerSession: vi.fn()
  }
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealFolderWorkspace: mocks.activateFolder,
  activateAndRevealWorktree: mocks.activateWorktree
}))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab: mocks.launchAgent }))
vi.mock('@/lib/local-preflight-context', () => ({
  getLocalProjectExecutionRuntimeContext: mocks.projectRuntime
}))

import { launchBarkosWorkerSession } from './launch-barkos-worker-session'

function company() {
  return createBarkosCompany({
    name: 'BarkOS Labs',
    mission: 'Ship dependable systems.',
    leadName: 'Ada',
    now: 1
  })
}

function target(overrides: Partial<BarkosWorkerLaunchTarget> = {}): BarkosWorkerLaunchTarget {
  return {
    id: '5:localworkspace',
    workspaceId: 'workspace',
    workspacePath: '/workspace/project',
    executionHostId: 'local',
    projectName: 'Project',
    workspaceName: 'main',
    workspaceKind: 'worktree',
    hostKind: 'local',
    hostLabel: null,
    compatible: true,
    agentAvailable: true,
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.settings.disabledTuiAgents = []
  mocks.state.barkosMemoryVault = null
  mocks.state.recordBarkosWorkerSession = mocks.recordSession
  mocks.recordSession.mockResolvedValue(undefined)
  mocks.markTrusted.mockResolvedValue(undefined)
  mocks.state.getKnownWorktreeById.mockReturnValue({ path: '/workspace/project' })
  mocks.activateWorktree.mockReturnValue({ primaryTabId: null })
  mocks.activateFolder.mockReturnValue({ primaryTabId: null })
  mocks.launchAgent.mockReturnValue({
    tabId: 'tab-1',
    tabIdResult: Promise.resolve('tab-1')
  })
  mocks.preparePairedApproval.mockResolvedValue(true)
  mocks.projectRuntime.mockReturnValue(undefined)
  mocks.droidStatus.mockResolvedValue({
    agent: 'droid',
    state: 'installed',
    configPath: '/home/test/.factory/settings.json',
    managedHooksPresent: true,
    detail: null
  })
  mocks.geminiStatus.mockResolvedValue({
    agent: 'gemini',
    state: 'installed',
    configPath: '/home/test/.gemini/settings.json',
    managedHooksPresent: true,
    detail: null
  })
  vi.stubGlobal('window', {
    api: {
      agentHooks: { droidStatus: mocks.droidStatus, geminiStatus: mocks.geminiStatus },
      barkosDecisionInbox: {
        preparePairedSideEffectApproval: mocks.preparePairedApproval
      },
      agentTrust: { markTrusted: mocks.markTrusted }
    }
  })
})

describe('launchBarkosWorkerSession', () => {
  it('activates the target and launches the worker with a bounded identity briefing', async () => {
    const result = await launchBarkosWorkerSession({
      company: company(),
      workerId: 'ada',
      target: target(),
      now: 42
    })

    expect(result).toEqual({
      ok: true,
      binding: {
        workerId: 'ada',
        agent: 'codex',
        targetId: '5:localworkspace',
        workspaceId: 'workspace',
        workspaceKind: 'worktree',
        executionHostId: 'local',
        tabId: 'tab-1',
        state: 'created',
        launchedAt: 42
      }
    })
    expect(mocks.activateWorktree).toHaveBeenCalledWith('workspace', {
      executionHostId: 'local'
    })
    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'codex',
        worktreeId: 'workspace',
        prompt: expect.stringContaining(
          'Sen BarkOS Labs şirketinde kalıcı çalışan Ada adlı ajansın.'
        ),
        promptDelivery: 'auto-submit'
      })
    )
    expect(mocks.markTrusted).toHaveBeenCalledWith({
      preset: 'codex',
      workspacePath: '/workspace/project'
    })
    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalEnv: { ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' }
      })
    )
    expect(mocks.recordSession).toHaveBeenCalledWith(result.ok ? result.binding : null)
  })

  it('applies the worker model to the launched agent session', async () => {
    const original = company()
    const lead = original.workers[0]
    const value = updateBarkosWorker(original, 'ada', { ...lead, model: 'gpt-5.6' }, 2)

    await launchBarkosWorkerSession({ company: value, workerId: 'ada', target: target() })

    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({ sessionOptions: { model: 'gpt-5.6' } })
    )
  })

  it('enables fail-closed side-effect enforcement for local and SSH Claude and Codex workers', async () => {
    const value = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship dependable systems.',
      leadName: 'Ada',
      agentId: 'claude',
      now: 1
    })

    await launchBarkosWorkerSession({ company: value, workerId: 'ada', target: target() })

    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'claude',
        additionalEnv: { ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' }
      })
    )

    mocks.launchAgent.mockClear()
    await launchBarkosWorkerSession({
      company: value,
      workerId: 'ada',
      target: target({ executionHostId: 'ssh:remote', hostKind: 'ssh' })
    })
    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalEnv: { ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' }
      })
    )

    const codex = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship dependable systems.',
      leadName: 'Grace',
      agentId: 'codex',
      now: 1
    })
    mocks.launchAgent.mockClear()
    await launchBarkosWorkerSession({ company: codex, workerId: 'grace', target: target() })
    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'codex',
        additionalEnv: { ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' }
      })
    )

    mocks.launchAgent.mockClear()
    await launchBarkosWorkerSession({
      company: codex,
      workerId: 'grace',
      target: target({ executionHostId: 'ssh:remote', hostKind: 'ssh' })
    })
    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        additionalEnv: { ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' }
      })
    )

    mocks.launchAgent.mockClear()
    await launchBarkosWorkerSession({
      company: codex,
      workerId: 'grace',
      target: target({ executionHostId: 'runtime:env-1', hostKind: 'remote' })
    })
    expect(mocks.launchAgent.mock.calls[0][0]).not.toHaveProperty('additionalEnv')
    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({ pairedSideEffectApprovalVersion: 1 })
    )
    expect(mocks.preparePairedApproval).toHaveBeenCalledWith('env-1', 'codex')
  })

  it('prepares Codex project trust on SSH before launching the worker prompt', async () => {
    const result = await launchBarkosWorkerSession({
      company: company(),
      workerId: 'ada',
      target: target({ executionHostId: 'ssh:remote', hostKind: 'ssh' })
    })

    expect(result).toMatchObject({ ok: true })
    expect(mocks.markTrusted).toHaveBeenCalledWith({
      preset: 'codex',
      workspacePath: '/workspace/project',
      connectionId: 'remote'
    })
    expect(mocks.markTrusted.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.launchAgent.mock.invocationCallOrder[0]
    )
  })

  it('leaves paired runtime trust to the host authority', async () => {
    await launchBarkosWorkerSession({
      company: company(),
      workerId: 'ada',
      target: target({ executionHostId: 'runtime:env-1', hostKind: 'remote' })
    })

    expect(mocks.markTrusted).not.toHaveBeenCalled()
  })

  it('fails closed before launch when the paired approval channel is unavailable', async () => {
    mocks.preparePairedApproval.mockResolvedValue(false)

    await expect(
      launchBarkosWorkerSession({
        company: company(),
        workerId: 'ada',
        target: target({ executionHostId: 'runtime:env-1', hostKind: 'remote' })
      })
    ).resolves.toEqual({ ok: false, reason: 'approval-channel-unavailable' })
    expect(mocks.launchAgent).not.toHaveBeenCalled()
    expect(mocks.activateWorktree).not.toHaveBeenCalled()
  })

  it('enforces local Droid only after its managed hook is verified', async () => {
    const value = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship dependable systems.',
      leadName: 'Ada',
      agentId: 'droid',
      now: 1
    })

    await expect(
      launchBarkosWorkerSession({ company: value, workerId: 'ada', target: target() })
    ).resolves.toMatchObject({ ok: true })
    expect(mocks.droidStatus).toHaveBeenCalledTimes(1)
    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'droid',
        additionalEnv: { ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' }
      })
    )

    mocks.launchAgent.mockClear()
    mocks.activateWorktree.mockClear()
    mocks.droidStatus.mockResolvedValue({
      agent: 'droid',
      state: 'partial',
      configPath: '/home/test/.factory/settings.json',
      managedHooksPresent: true,
      detail: 'Droid hooks are disabled in Factory settings'
    })
    await expect(
      launchBarkosWorkerSession({ company: value, workerId: 'ada', target: target() })
    ).resolves.toEqual({ ok: false, reason: 'approval-channel-unavailable' })
    expect(mocks.launchAgent).not.toHaveBeenCalled()
    expect(mocks.activateWorktree).not.toHaveBeenCalled()
  })

  it('enforces Droid over direct SSH and negotiates v2 for a paired launch', async () => {
    const value = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship dependable systems.',
      leadName: 'Ada',
      agentId: 'droid',
      now: 1
    })

    await expect(
      launchBarkosWorkerSession({
        company: value,
        workerId: 'ada',
        target: target({ executionHostId: 'ssh:remote', hostKind: 'ssh' })
      })
    ).resolves.toMatchObject({ ok: true })
    expect(mocks.droidStatus).not.toHaveBeenCalled()
    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'droid',
        additionalEnv: { ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' }
      })
    )

    mocks.activateWorktree.mockClear()
    mocks.launchAgent.mockClear()
    await expect(
      launchBarkosWorkerSession({
        company: value,
        workerId: 'ada',
        target: target({ executionHostId: 'runtime:env-1', hostKind: 'remote' })
      })
    ).resolves.toMatchObject({ ok: true })
    expect(mocks.preparePairedApproval).toHaveBeenCalledWith('env-1', 'droid')
    expect(mocks.activateWorktree).toHaveBeenCalledTimes(1)
    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'droid',
        pairedSideEffectApprovalVersion: 2
      })
    )
    expect(mocks.launchAgent.mock.calls[0][0]).not.toHaveProperty('additionalEnv')
  })

  it('enforces native and direct SSH Gemini only after its managed hook is verified', async () => {
    const value = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship dependable systems.',
      leadName: 'Ada',
      agentId: 'gemini',
      now: 1
    })

    await expect(
      launchBarkosWorkerSession({ company: value, workerId: 'ada', target: target() })
    ).resolves.toMatchObject({ ok: true })
    expect(mocks.geminiStatus).toHaveBeenCalledTimes(1)
    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'gemini',
        additionalEnv: { ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' }
      })
    )

    mocks.launchAgent.mockClear()
    mocks.geminiStatus.mockClear()
    await expect(
      launchBarkosWorkerSession({
        company: value,
        workerId: 'ada',
        target: target({ executionHostId: 'ssh:remote', hostKind: 'ssh' })
      })
    ).resolves.toMatchObject({ ok: true })
    expect(mocks.geminiStatus).not.toHaveBeenCalled()
    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'gemini',
        additionalEnv: { ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' }
      })
    )

    mocks.launchAgent.mockClear()
    await expect(
      launchBarkosWorkerSession({
        company: value,
        workerId: 'ada',
        target: target({ executionHostId: 'runtime:env-1', hostKind: 'remote' })
      })
    ).resolves.toMatchObject({ ok: true })
    expect(mocks.preparePairedApproval).toHaveBeenCalledWith('env-1', 'gemini')
    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'gemini',
        pairedSideEffectApprovalVersion: 3
      })
    )
    expect(mocks.launchAgent.mock.calls[0][0]).not.toHaveProperty('additionalEnv')

    mocks.launchAgent.mockClear()
    mocks.activateWorktree.mockClear()
    mocks.geminiStatus.mockResolvedValue({
      agent: 'gemini',
      state: 'not_installed',
      configPath: '/home/test/.gemini/settings.json',
      managedHooksPresent: false,
      detail: null
    })
    await expect(
      launchBarkosWorkerSession({ company: value, workerId: 'ada', target: target() })
    ).resolves.toEqual({ ok: false, reason: 'approval-channel-unavailable' })
    expect(mocks.launchAgent).not.toHaveBeenCalled()
    expect(mocks.activateWorktree).not.toHaveBeenCalled()
  })

  it('defers Droid WSL hook readiness to the host-side spawn boundary', async () => {
    const value = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship dependable systems.',
      leadName: 'Ada',
      agentId: 'droid',
      now: 1
    })
    mocks.projectRuntime.mockReturnValue({
      status: 'resolved',
      runtime: {
        kind: 'wsl',
        hostPlatform: 'wsl',
        projectId: 'project-1',
        distro: 'Ubuntu',
        reason: 'project-override',
        cacheKey: 'project-1:wsl:Ubuntu'
      }
    })

    await expect(
      launchBarkosWorkerSession({ company: value, workerId: 'ada', target: target() })
    ).resolves.toMatchObject({ ok: true })
    expect(mocks.droidStatus).not.toHaveBeenCalled()
    expect(mocks.activateWorktree).toHaveBeenCalledTimes(1)
    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'droid',
        additionalEnv: { ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' }
      })
    )
  })

  it('uses the folder activation path and records remote requests without a local tab id', async () => {
    mocks.launchAgent.mockReturnValue({ tabId: null, tabIdResult: Promise.resolve(null) })

    const result = await launchBarkosWorkerSession({
      company: company(),
      workerId: 'ada',
      target: target({
        workspaceId: 'folder:docs',
        workspaceKind: 'folder',
        executionHostId: 'ssh:remote',
        hostKind: 'ssh'
      }),
      now: 43
    })

    expect(mocks.activateFolder).toHaveBeenCalledWith('docs', {
      executionHostId: 'ssh:remote'
    })
    expect(result).toMatchObject({ ok: true, binding: { state: 'requested', tabId: null } })
  })

  it('adds only approved relevant memory to the worker briefing', async () => {
    const value = company()
    mocks.state.barkosMemoryVault = parseBarkosMemoryVault({
      schemaVersion: 1,
      companyId: value.id,
      companyCreatedAt: value.createdAt,
      entries: [
        {
          id: 'release-evidence',
          status: 'active',
          scope: { kind: 'project', targetId: 'workspace' },
          title: 'Release guard',
          content: 'Keep the accepted release guard intact.',
          source: {
            kind: 'accepted-evidence',
            evidenceId: 'release-evidence',
            taskId: 'release-task',
            assignmentId: 'release-assignment',
            dispatchId: 'release-dispatch',
            workerId: 'ada',
            roleId: 'lead',
            workspaceId: 'workspace',
            capturedAt: 2
          },
          confidence: 80,
          expiresAt: null,
          contradictsMemoryIds: [],
          supersededByMemoryId: null,
          promotedBy: 'user',
          createdAt: 2,
          promotedAt: 3,
          revokedAt: null
        }
      ],
      candidates: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 3
    })

    await launchBarkosWorkerSession({ company: value, workerId: 'ada', target: target() })

    expect(mocks.launchAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Keep the accepted release guard intact.')
      })
    )
  })

  it('does not report launch failure after the agent exists but session persistence fails', async () => {
    mocks.recordSession.mockRejectedValue(new Error('disk unavailable'))

    await expect(
      launchBarkosWorkerSession({
        company: company(),
        workerId: 'ada',
        target: target(),
        now: 44
      })
    ).resolves.toMatchObject({ ok: true, binding: { tabId: 'tab-1', state: 'created' } })
    expect(mocks.launchAgent).toHaveBeenCalledTimes(1)
  })

  it('rejects unavailable and incompatible targets before activation', async () => {
    await expect(
      launchBarkosWorkerSession({
        company: company(),
        workerId: 'ada',
        target: target({ agentAvailable: false })
      })
    ).resolves.toEqual({ ok: false, reason: 'agent-not-available' })
    await expect(
      launchBarkosWorkerSession({
        company: company(),
        workerId: 'ada',
        target: target({ compatible: false })
      })
    ).resolves.toEqual({ ok: false, reason: 'target-incompatible' })
    expect(mocks.activateWorktree).not.toHaveBeenCalled()
  })
})
