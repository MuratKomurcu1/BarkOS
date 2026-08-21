import { describe, expect, it, vi } from 'vitest'
import type {
  RuntimeCreateAgentSessionRequest,
  RuntimeCreateAgentSessionResult
} from '../../shared/agent-session-host-authority'

const hookMocks = vi.hoisted(() => ({
  droidStatus: vi.fn(() => ({
    agent: 'droid',
    state: 'installed',
    configPath: '/home/test/.factory/settings.json',
    managedHooksPresent: true,
    detail: null as string | null
  })),
  geminiStatus: vi.fn(() => ({
    agent: 'gemini',
    state: 'installed',
    configPath: '/home/test/.gemini/settings.json',
    managedHooksPresent: true,
    detail: null as string | null
  }))
}))

vi.mock('../droid/hook-service', () => ({
  droidHookService: { getStatus: hookMocks.droidStatus }
}))

vi.mock('../gemini/hook-service', () => ({
  geminiHookService: { getStatus: hookMocks.geminiStatus }
}))

import { OrcaRuntimeService } from './orca-runtime'
import { wslHookRelayManager } from '../agent-hooks/wsl-hook-relay-manager'

function operationId(now = Date.now()): string {
  return `${now}-0123456789abcdef0123456789abcdef`
}

function request(
  clientOperationId: string,
  overrides: Partial<RuntimeCreateAgentSessionRequest> = {}
): RuntimeCreateAgentSessionRequest {
  return {
    clientOperationId,
    worktree: 'id:worktree-1',
    agent: 'codex',
    prompt: 'do the thing',
    presentation: 'background',
    ...overrides
  }
}

function terminal() {
  return {
    handle: 'term_operation',
    tabId: '11111111-1111-4111-8111-111111111111',
    paneKey: '11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222',
    ptyId: 'pty-operation',
    worktreeId: 'worktree-1',
    title: null,
    surface: 'background' as const
  }
}

function createRuntime(provider?: {
  supportsAgentSessionClaims?: () => boolean
  supportsAgentSessionCreateOperations?: () => boolean
}) {
  const runtime = new OrcaRuntimeService(
    {
      getSettings: () => ({
        disabledTuiAgents: [],
        agentCmdOverrides: {},
        agentDefaultArgs: {},
        agentDefaultEnv: {}
      })
    } as never,
    undefined,
    provider ? { getLocalProvider: () => provider as never } : undefined
  )
  const internal = runtime as unknown as {
    resolveTerminalWorkspaceLaunchScope: ReturnType<typeof vi.fn>
    markLocalWorkspaceTrustedForAgent: ReturnType<typeof vi.fn>
    markRemoteWorkspaceTrustedForAgent: ReturnType<typeof vi.fn>
  }
  internal.resolveTerminalWorkspaceLaunchScope = vi.fn(async () => ({
    id: 'worktree-1',
    path: '/tmp/worktree-1',
    connectionId: null
  }))
  internal.markLocalWorkspaceTrustedForAgent = vi.fn()
  internal.markRemoteWorkspaceTrustedForAgent = vi.fn()
  return runtime
}

describe('agent-session create operation ledger', () => {
  it('selects legacy before trust, spawn, or ledger state for an old daemon', async () => {
    const provider = {
      supportsAgentSessionClaims: vi.fn(() => false),
      supportsAgentSessionCreateOperations: vi.fn(() => false)
    }
    const runtime = createRuntime(provider)
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue(terminal())
    const internal = runtime as unknown as {
      markLocalWorkspaceTrustedForAgent: ReturnType<typeof vi.fn>
    }
    const id = operationId()

    await expect(runtime.createAgentSession(request(id))).rejects.toThrow(
      'agent_session_legacy_required'
    )
    await expect(
      runtime.ensureAgentSession({
        kind: 'explicit',
        worktree: 'id:worktree-1',
        agent: 'codex',
        providerSession: { key: 'session_id', id: 'provider-session-1' }
      })
    ).rejects.toThrow('agent_session_legacy_required')

    expect(createTerminal).not.toHaveBeenCalled()
    expect(internal.markLocalWorkspaceTrustedForAgent).not.toHaveBeenCalled()

    provider.supportsAgentSessionCreateOperations.mockReturnValue(true)
    await expect(runtime.createAgentSession(request(id))).resolves.toMatchObject({
      disposition: 'created'
    })
    provider.supportsAgentSessionCreateOperations.mockReturnValue(false)
    await expect(runtime.createAgentSession(request(id))).resolves.toMatchObject({
      disposition: 'replayed'
    })
    expect(createTerminal).toHaveBeenCalledOnce()
  })

  it('requests exact client legacy fallback before nested SSH side effects', async () => {
    const runtime = createRuntime()
    const internal = runtime as unknown as {
      resolveTerminalWorkspaceLaunchScope: ReturnType<typeof vi.fn>
    }
    internal.resolveTerminalWorkspaceLaunchScope.mockResolvedValue({
      id: 'worktree-1',
      path: '/remote/worktree-1',
      connectionId: 'ssh-1'
    })
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue(terminal())

    await expect(
      runtime.ensureAgentSession({
        kind: 'explicit',
        worktree: 'id:worktree-1',
        agent: 'codex',
        providerSession: { key: 'session_id', id: 'provider-session-1' }
      })
    ).rejects.toThrow('agent_session_legacy_required')

    expect(createTerminal).not.toHaveBeenCalled()
  })

  it('selects nested SSH legacy fallback before reading a Pi transcript path locally', async () => {
    const runtime = createRuntime()
    const internal = runtime as unknown as {
      resolveTerminalWorkspaceLaunchScope: ReturnType<typeof vi.fn>
      markRemoteWorkspaceTrustedForAgent: ReturnType<typeof vi.fn>
    }
    internal.resolveTerminalWorkspaceLaunchScope.mockResolvedValue({
      id: 'worktree-1',
      path: '/remote/worktree-1',
      connectionId: 'ssh-1'
    })
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue(terminal())

    await expect(
      runtime.ensureAgentSession({
        kind: 'explicit',
        worktree: 'id:worktree-1',
        agent: 'pi',
        providerSession: {
          key: 'session_id',
          id: 'provider-session-1',
          transcriptPath: '/remote-only/pi/session.jsonl'
        }
      })
    ).rejects.toThrow('agent_session_legacy_required')

    expect(createTerminal).not.toHaveBeenCalled()
    expect(internal.markRemoteWorkspaceTrustedForAgent).not.toHaveBeenCalled()
  })

  it('replays the same completed operation without spawning again', async () => {
    const runtime = createRuntime()
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue(terminal())
    const id = operationId()

    await expect(
      runtime.createAgentSession(request(id), { clientId: 'device-a' })
    ).resolves.toMatchObject({ disposition: 'created' })
    await expect(
      runtime.createAgentSession(request(id), { clientId: 'device-a' })
    ).resolves.toMatchObject({ disposition: 'replayed' })
    expect(createTerminal).toHaveBeenCalledOnce()
  })

  it('joins concurrent retries and conflicts on a changed fingerprint', async () => {
    const runtime = createRuntime()
    let finish!: (result: ReturnType<typeof terminal>) => void
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const id = operationId()
    const first = runtime.createAgentSession(request(id), { clientId: 'device-a' })
    const joined = runtime.createAgentSession(request(id), { clientId: 'device-a' })

    await expect(
      runtime.createAgentSession(request(id, { prompt: 'changed' }), { clientId: 'device-a' })
    ).rejects.toThrow('agent_session_operation_conflict')
    await expect(
      runtime.createAgentSession(request(id, { agentArgs: '--profile changed' }), {
        clientId: 'device-a'
      })
    ).rejects.toThrow('agent_session_operation_conflict')
    finish(terminal())
    await expect(first).resolves.toMatchObject({ disposition: 'created' })
    await expect(joined).resolves.toMatchObject({ disposition: 'replayed' })
    expect(createTerminal).toHaveBeenCalledOnce()
  })

  it('isolates operation ids by authenticated caller', async () => {
    const runtime = createRuntime()
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue(terminal())
    const id = operationId()

    await runtime.createAgentSession(request(id), { clientId: 'device-a' })
    await runtime.createAgentSession(request(id), { clientId: 'device-b' })
    expect(createTerminal).toHaveBeenCalledTimes(2)
  })

  it('rejects an expired unseen operation before terminal creation', async () => {
    const runtime = createRuntime()
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue(terminal())
    const expired = operationId(Date.now() - 25 * 60 * 60 * 1_000)

    await expect(
      runtime.createAgentSession(request(expired), { clientId: 'device-a' })
    ).rejects.toThrow('agent_session_operation_expired')
    expect(createTerminal).not.toHaveBeenCalled()
  })

  it('injects paired enforcement and retains authenticated ownership on the spawned PTY', async () => {
    const runtime = createRuntime()
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue(terminal())

    await runtime.createAgentSession(
      request(operationId(), { sideEffectApproval: { version: 1 } }),
      {
        clientId: 'device-a',
        clientKind: 'runtime',
        barkosSideEffectApprovalOwnerDeviceId: 'device-a'
      }
    )

    expect(createTerminal).toHaveBeenCalledWith(
      'id:worktree-1',
      expect.objectContaining({
        env: expect.objectContaining({ ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' }),
        barkosSideEffectApprovalOwnerDeviceId: 'device-a'
      })
    )
  })

  it('starts paired Droid only after its v2 managed approval hook is ready', async () => {
    const runtime = createRuntime()
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue(terminal())
    const caller = {
      clientId: 'device-a',
      clientKind: 'runtime' as const,
      barkosSideEffectApprovalOwnerDeviceId: 'device-a'
    }

    await runtime.createAgentSession(
      request(operationId(), { agent: 'droid', sideEffectApproval: { version: 2 } }),
      caller
    )
    expect(hookMocks.droidStatus).toHaveBeenCalled()
    expect(createTerminal).toHaveBeenCalledWith(
      'id:worktree-1',
      expect.objectContaining({
        launchAgent: 'droid',
        env: expect.objectContaining({ ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' }),
        barkosSideEffectApprovalOwnerDeviceId: 'device-a'
      })
    )

    const unavailable = createRuntime()
    const unavailableCreate = vi.spyOn(unavailable, 'createTerminal').mockResolvedValue(terminal())
    hookMocks.droidStatus.mockReturnValueOnce({
      agent: 'droid',
      state: 'partial',
      configPath: '/home/test/.factory/settings.json',
      managedHooksPresent: false,
      detail: 'missing managed hook'
    })
    await expect(
      unavailable.createAgentSession(
        request(operationId(), { agent: 'droid', sideEffectApproval: { version: 2 } }),
        caller
      )
    ).rejects.toThrow('barkos_paired_droid_approval_hook_unavailable')
    expect(unavailableCreate).not.toHaveBeenCalled()
  })

  it('rejects paired Droid v1 before terminal creation', async () => {
    const runtime = createRuntime()
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue(terminal())

    await expect(
      runtime.createAgentSession(
        request(operationId(), { agent: 'droid', sideEffectApproval: { version: 1 } }),
        {
          clientId: 'device-a',
          clientKind: 'runtime',
          barkosSideEffectApprovalOwnerDeviceId: 'device-a'
        }
      )
    ).rejects.toThrow('barkos_paired_droid_approval_version_unsupported')
    expect(createTerminal).not.toHaveBeenCalled()
  })

  it('starts paired Gemini only after its v3 managed approval hook is ready', async () => {
    const runtime = createRuntime()
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue(terminal())
    const caller = {
      clientId: 'device-a',
      clientKind: 'runtime' as const,
      barkosSideEffectApprovalOwnerDeviceId: 'device-a'
    }

    await runtime.createAgentSession(
      request(operationId(), { agent: 'gemini', sideEffectApproval: { version: 3 } }),
      caller
    )
    expect(hookMocks.geminiStatus).toHaveBeenCalled()
    expect(createTerminal).toHaveBeenCalledWith(
      'id:worktree-1',
      expect.objectContaining({
        launchAgent: 'gemini',
        env: expect.objectContaining({ ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' }),
        barkosSideEffectApprovalOwnerDeviceId: 'device-a'
      })
    )

    const unavailable = createRuntime()
    const unavailableCreate = vi.spyOn(unavailable, 'createTerminal').mockResolvedValue(terminal())
    hookMocks.geminiStatus.mockReturnValueOnce({
      agent: 'gemini',
      state: 'partial',
      configPath: '/home/test/.gemini/settings.json',
      managedHooksPresent: false,
      detail: 'missing managed hook'
    })
    await expect(
      unavailable.createAgentSession(
        request(operationId(), { agent: 'gemini', sideEffectApproval: { version: 3 } }),
        caller
      )
    ).rejects.toThrow('barkos_paired_gemini_approval_hook_unavailable')
    expect(unavailableCreate).not.toHaveBeenCalled()
  })

  it('rejects paired Gemini v2 before terminal creation', async () => {
    const runtime = createRuntime()
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue(terminal())

    await expect(
      runtime.createAgentSession(
        request(operationId(), { agent: 'gemini', sideEffectApproval: { version: 2 } }),
        {
          clientId: 'device-a',
          clientKind: 'runtime',
          barkosSideEffectApprovalOwnerDeviceId: 'device-a'
        }
      )
    ).rejects.toThrow('barkos_paired_gemini_approval_version_unsupported')
    expect(createTerminal).not.toHaveBeenCalled()
  })

  it('starts paired OpenCode on the v4 contract without a local hook pre-await', async () => {
    const runtime = createRuntime()
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue(terminal())
    hookMocks.droidStatus.mockClear()
    hookMocks.geminiStatus.mockClear()

    await runtime.createAgentSession(
      request(operationId(), { agent: 'opencode', sideEffectApproval: { version: 4 } }),
      {
        clientId: 'device-a',
        clientKind: 'runtime',
        barkosSideEffectApprovalOwnerDeviceId: 'device-a'
      }
    )
    // Why: opencode has no standalone installer — Orca writes the gate plugin
    // while building PTY env, so unlike droid/gemini there is no status to await.
    expect(hookMocks.droidStatus).not.toHaveBeenCalled()
    expect(hookMocks.geminiStatus).not.toHaveBeenCalled()
    expect(createTerminal).toHaveBeenCalledWith(
      'id:worktree-1',
      expect.objectContaining({
        launchAgent: 'opencode',
        env: expect.objectContaining({ ORCA_BARKOS_SIDE_EFFECT_ENFORCEMENT: '1' })
      })
    )
  })

  it('rejects paired OpenCode v3 before terminal creation', async () => {
    const runtime = createRuntime()
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockResolvedValue(terminal())

    await expect(
      runtime.createAgentSession(
        request(operationId(), { agent: 'opencode', sideEffectApproval: { version: 3 } }),
        {
          clientId: 'device-a',
          clientKind: 'runtime',
          barkosSideEffectApprovalOwnerDeviceId: 'device-a'
        }
      )
    ).rejects.toThrow('barkos_paired_opencode_approval_version_unsupported')
    expect(createTerminal).not.toHaveBeenCalled()
  })

  it('starts paired OpenCode inside WSL only after the guest overlay is ready', async () => {
    const overlay = vi.spyOn(wslHookRelayManager, 'getOpenCodeOverlayDir')
    const wslRuntime = createRuntime()
    const internal = wslRuntime as unknown as {
      resolveTerminalWorkspaceLaunchScope: ReturnType<typeof vi.fn>
    }
    internal.resolveTerminalWorkspaceLaunchScope = vi.fn(async () => ({
      id: 'worktree-1',
      path: '\\\\wsl.localhost\\Ubuntu\\home\\me\\repo',
      connectionId: null
    }))
    const caller = {
      clientId: 'device-a',
      clientKind: 'runtime' as const,
      barkosSideEffectApprovalOwnerDeviceId: 'device-a'
    }
    const payload = request(operationId(), {
      agent: 'opencode',
      sideEffectApproval: { version: 4 }
    })

    await expect(wslRuntime.createAgentSession(payload, caller)).rejects.toThrow(
      'barkos_paired_opencode_approval_hook_unavailable'
    )
    const blockedCreate = vi.spyOn(wslRuntime, 'createTerminal')
    expect(blockedCreate).not.toHaveBeenCalled()

    const readyRuntime = createRuntime()
    const readyInternal = readyRuntime as unknown as {
      resolveTerminalWorkspaceLaunchScope: ReturnType<typeof vi.fn>
    }
    readyInternal.resolveTerminalWorkspaceLaunchScope = vi.fn(async () => ({
      id: 'worktree-1',
      path: '\\\\wsl.localhost\\Ubuntu\\home\\me\\repo',
      connectionId: null
    }))
    const readyCreate = vi.spyOn(readyRuntime, 'createTerminal').mockResolvedValue(terminal())
    overlay.mockReturnValue('/tmp/wsl-opencode-overlay')
    await readyRuntime.createAgentSession(
      request(operationId(), { agent: 'opencode', sideEffectApproval: { version: 4 } }),
      caller
    )
    expect(readyCreate).toHaveBeenCalledWith(
      'id:worktree-1',
      expect.objectContaining({ launchAgent: 'opencode' })
    )
    overlay.mockRestore()
  })

  it('releases a failed pre-spawn operation for a safe retry', async () => {
    const runtime = createRuntime()
    const createTerminal = vi
      .spyOn(runtime, 'createTerminal')
      .mockRejectedValueOnce(new Error('pre-spawn failure'))
      .mockResolvedValueOnce(terminal())
    const id = operationId()

    await expect(runtime.createAgentSession(request(id), { clientId: 'device-a' })).rejects.toThrow(
      'pre-spawn failure'
    )
    await expect(
      runtime.createAgentSession(request(id), { clientId: 'device-a' })
    ).resolves.toMatchObject({ disposition: 'created' })
    expect(createTerminal).toHaveBeenCalledTimes(2)
    expect(createTerminal.mock.calls[0]?.[1]).toMatchObject({
      tabId: createTerminal.mock.calls[1]?.[1]?.tabId,
      leafId: createTerminal.mock.calls[1]?.[1]?.leafId,
      preAllocatedHandle: createTerminal.mock.calls[1]?.[1]?.preAllocatedHandle,
      agentSessionCreateOperationId:
        createTerminal.mock.calls[1]?.[1]?.agentSessionCreateOperationId
    })
    expect(createTerminal.mock.calls[0]?.[1]?.agentSessionCreateOperationId).toMatch(
      /^[A-Za-z0-9_-]{43}$/
    )
  })

  it.each([
    ['controller admission fails', 'agent_session_exited_during_start'],
    ['publication fails', 'post-spawn publication failure']
  ])('retains a replay fence when %s after physical spawn commit', async (_case, message) => {
    const runtime = createRuntime()
    const failure = new Error(message)
    const createTerminal = vi
      .spyOn(runtime, 'createTerminal')
      .mockImplementation(async (_worktree, opts) => {
        opts?.onPtySpawnCommitted?.()
        throw failure
      })
    const id = operationId()

    await expect(runtime.createAgentSession(request(id), { clientId: 'device-a' })).rejects.toThrow(
      failure.message
    )
    await expect(runtime.createAgentSession(request(id), { clientId: 'device-a' })).rejects.toThrow(
      failure.message
    )
    expect(createTerminal).toHaveBeenCalledOnce()
  })

  it('retains a replay fence when the provider reports an unknown spawn outcome', async () => {
    const runtime = createRuntime()
    const failure = Object.assign(new Error('cleanup could not prove exit'), {
      agentSessionOperationOutcome: 'unknown' as const
    })
    const createTerminal = vi.spyOn(runtime, 'createTerminal').mockRejectedValue(failure)
    const id = operationId()

    const attempts: Promise<RuntimeCreateAgentSessionResult>[] = [
      runtime.createAgentSession(request(id), { clientId: 'device-a' }),
      runtime.createAgentSession(request(id), { clientId: 'device-a' })
    ]
    await expect(Promise.all(attempts)).rejects.toThrow(failure.message)
    await expect(runtime.createAgentSession(request(id), { clientId: 'device-a' })).rejects.toThrow(
      failure.message
    )
    expect(createTerminal).toHaveBeenCalledOnce()
  })
})
