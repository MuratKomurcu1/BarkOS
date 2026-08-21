import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveEnvironment } from '../../shared/runtime-environment-store'
import { callRuntimeEnvironment } from '../ipc/runtime-environment-transport-routing'
import { runBarkosPairedTestEvidence } from './paired-test-evidence-client'

vi.mock('../../shared/runtime-environment-store', () => ({ resolveEnvironment: vi.fn() }))
vi.mock('../ipc/runtime-environment-transport-routing', () => ({
  callRuntimeEnvironment: vi.fn()
}))

const request = {
  version: 1 as const,
  workspaceId: 'worktree-1',
  tabId: 'tab-1',
  orchestrationRunId: 'run-1',
  orchestrationTaskId: 'task-1',
  orchestrationDispatchId: 'dispatch-1',
  command: 'pnpm test'
}

describe('paired BarkOS test evidence client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveEnvironment).mockReturnValue({
      id: 'environment-1',
      createdAt: 10,
      pairingRevision: 20
    } as never)
  })

  it('pins the pairing revision and runtime identity around execution', async () => {
    vi.mocked(callRuntimeEnvironment).mockImplementationOnce(async (...args) => {
      args[7]?.validateStatus?.({
        id: 'status',
        ok: true,
        result: {
          runtimeId: 'runtime-1',
          rendererGraphEpoch: 1,
          graphStatus: 'ready',
          authoritativeWindowId: null,
          liveTabCount: 0,
          liveLeafCount: 0,
          capabilities: ['barkos.test-evidence-execution.v1']
        },
        _meta: { runtimeId: 'runtime-1' }
      })
      return {
        id: 'run',
        ok: true,
        result: {
          version: 1,
          command: 'pnpm test',
          status: 'passed',
          summary: 'Exited with code 0.',
          durationMs: 10
        },
        _meta: { runtimeId: 'runtime-1' }
      }
    })
    const signal = new AbortController().signal

    await expect(
      runBarkosPairedTestEvidence({
        userDataPath: '/data',
        environmentId: 'environment-1',
        request,
        signal
      })
    ).resolves.toMatchObject({ status: 'passed' })
    expect(callRuntimeEnvironment).toHaveBeenCalledWith(
      '/data',
      'environment-1',
      'barkos.testEvidence.run',
      request,
      315_000,
      20,
      undefined,
      { signal, validateStatus: expect.any(Function) }
    )
  })

  it('fails closed when capability is absent or the runtime changes', async () => {
    vi.mocked(callRuntimeEnvironment).mockImplementationOnce(async (...args) => {
      args[7]?.validateStatus?.({
        id: 'status',
        ok: true,
        result: {
          runtimeId: 'runtime-1',
          rendererGraphEpoch: 1,
          graphStatus: 'ready',
          authoritativeWindowId: null,
          liveTabCount: 0,
          liveLeafCount: 0,
          capabilities: []
        },
        _meta: { runtimeId: 'runtime-1' }
      })
      throw new Error('request_should_not_run')
    })
    await expect(
      runBarkosPairedTestEvidence({
        userDataPath: '/data',
        environmentId: 'environment-1',
        request,
        signal: new AbortController().signal
      })
    ).rejects.toThrow('barkos_test_paired_runtime_capability_missing')
    expect(callRuntimeEnvironment).toHaveBeenCalledTimes(1)

    vi.mocked(callRuntimeEnvironment).mockImplementationOnce(async (...args) => {
      args[7]?.validateStatus?.({
        id: 'status',
        ok: true,
        result: {
          runtimeId: 'runtime-1',
          rendererGraphEpoch: 1,
          graphStatus: 'ready',
          authoritativeWindowId: null,
          liveTabCount: 0,
          liveLeafCount: 0,
          capabilities: ['barkos.test-evidence-execution.v1']
        },
        _meta: { runtimeId: 'runtime-1' }
      })
      return {
        id: 'run',
        ok: true,
        result: {
          version: 1,
          command: 'pnpm test',
          status: 'passed',
          summary: 'Exited with code 0.',
          durationMs: 10
        },
        _meta: { runtimeId: 'runtime-2' }
      }
    })
    await expect(
      runBarkosPairedTestEvidence({
        userDataPath: '/data',
        environmentId: 'environment-1',
        request,
        signal: new AbortController().signal
      })
    ).rejects.toThrow('barkos_test_paired_runtime_changed')
  })
})
