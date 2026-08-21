import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeStatus } from '../../../shared/runtime-types'
import {
  assertRuntimeEnvironmentCapability,
  callRuntimeRpc,
  clearRecentRuntimeCompatibilityFailure,
  clearRuntimeCompatibilityCacheForTests,
  runtimeEnvironmentSupportsCapability
} from './runtime-rpc-client'
import {
  MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
  RUNTIME_PROTOCOL_VERSION
} from '../../../shared/protocol-version'

const runtimeEnvironmentCall = vi.fn()

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  runtimeEnvironmentCall.mockReset()
  vi.stubGlobal('window', {
    api: {
      runtimeEnvironments: { call: runtimeEnvironmentCall }
    }
  })
})

describe('runtime compatibility cache', () => {
  it('reuses recent remote compatibility failures during startup catalog bursts', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'status',
      ok: false,
      error: { code: 'runtime_unavailable', message: 'offline' },
      _meta: { runtimeId: 'remote-runtime' }
    })
    const target = { kind: 'environment', environmentId: 'env-offline' } as const

    await expect(
      callRuntimeRpc(target, 'repo.list', undefined, { reuseRecentCompatibilityFailure: true })
    ).rejects.toThrow('offline')
    await expect(
      callRuntimeRpc(target, 'projectGroup.list', undefined, {
        reuseRecentCompatibilityFailure: true
      })
    ).rejects.toThrow('offline')
    await expect(
      callRuntimeRpc(target, 'folderWorkspace.list', undefined, {
        reuseRecentCompatibilityFailure: true
      })
    ).rejects.toThrow('offline')

    expect(runtimeEnvironmentCall.mock.calls.map((call) => call[0].method)).toEqual(['status.get'])
  })

  it('expires startup compatibility failures at the TTL boundary', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(0))
    try {
      let statusCalls = 0
      runtimeEnvironmentCall.mockImplementation(({ method }: { method: string }) => {
        if (method === 'status.get') {
          statusCalls += 1
          if (statusCalls === 1) {
            return Promise.resolve({
              id: 'status',
              ok: false,
              error: { code: 'runtime_unavailable', message: 'offline' },
              _meta: { runtimeId: 'remote-runtime' }
            })
          }
          return Promise.resolve({
            id: 'status',
            ok: true,
            result: {
              runtimeId: 'remote-runtime',
              graphStatus: 'ready',
              runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
              minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION
            },
            _meta: { runtimeId: 'remote-runtime' }
          })
        }
        return Promise.resolve({
          id: method,
          ok: true,
          result: { ok: true },
          _meta: { runtimeId: 'remote-runtime' }
        })
      })
      const target = { kind: 'environment', environmentId: 'env-ttl' } as const

      await expect(
        callRuntimeRpc(target, 'repo.list', undefined, { reuseRecentCompatibilityFailure: true })
      ).rejects.toThrow('offline')
      vi.setSystemTime(new Date(60_000))
      await expect(
        callRuntimeRpc(target, 'repo.list', undefined, { reuseRecentCompatibilityFailure: true })
      ).resolves.toEqual({ ok: true })

      expect(runtimeEnvironmentCall.mock.calls.map((call) => call[0].method)).toEqual([
        'status.get',
        'status.get',
        'repo.list'
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('retries normal remote calls after a catalog-burst compatibility failure', async () => {
    let statusCalls = 0
    runtimeEnvironmentCall.mockImplementation(({ method }: { method: string }) => {
      if (method === 'status.get') {
        statusCalls += 1
        if (statusCalls === 1) {
          return Promise.resolve({
            id: 'status',
            ok: false,
            error: { code: 'runtime_unavailable', message: 'offline' },
            _meta: { runtimeId: 'remote-runtime' }
          })
        }
        return Promise.resolve({
          id: 'status',
          ok: true,
          result: {
            runtimeId: 'remote-runtime',
            graphStatus: 'ready',
            runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
            minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION
          },
          _meta: { runtimeId: 'remote-runtime' }
        })
      }
      return Promise.resolve({
        id: method,
        ok: true,
        result: { ok: true },
        _meta: { runtimeId: 'remote-runtime' }
      })
    })
    const target = { kind: 'environment', environmentId: 'env-recovers' } as const

    await expect(
      callRuntimeRpc(target, 'repo.list', undefined, { reuseRecentCompatibilityFailure: true })
    ).rejects.toThrow('offline')
    await expect(callRuntimeRpc(target, 'git.status')).resolves.toEqual({ ok: true })

    expect(runtimeEnvironmentCall.mock.calls.map((call) => call[0].method)).toEqual([
      'status.get',
      'status.get',
      'git.status'
    ])
  })

  it('lets background compatibility checks reuse a recent foreground failure', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'status',
      ok: false,
      error: { code: 'runtime_unavailable', message: 'offline' },
      _meta: { runtimeId: 'remote-runtime' }
    })
    const target = { kind: 'environment', environmentId: 'env-offline' } as const

    await expect(callRuntimeRpc(target, 'git.status')).rejects.toThrow('offline')
    await expect(
      callRuntimeRpc(target, 'repo.list', undefined, {
        reuseRecentCompatibilityFailure: true
      })
    ).rejects.toThrow('offline')

    expect(runtimeEnvironmentCall.mock.calls.map((call) => call[0].method)).toEqual(['status.get'])
  })

  it('re-probes after a status success clears a recent compatibility failure', async () => {
    let statusCalls = 0
    runtimeEnvironmentCall.mockImplementation(({ method }: { method: string }) => {
      if (method === 'status.get') {
        statusCalls += 1
        if (statusCalls === 1) {
          return Promise.resolve({
            id: 'status',
            ok: false,
            error: { code: 'runtime_unavailable', message: 'offline' },
            _meta: { runtimeId: 'remote-runtime' }
          })
        }
        return Promise.resolve({
          id: 'status',
          ok: true,
          result: {
            runtimeId: 'remote-runtime',
            graphStatus: 'ready',
            runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
            minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION
          },
          _meta: { runtimeId: 'remote-runtime' }
        })
      }
      return Promise.resolve({
        id: method,
        ok: true,
        result: { ok: true },
        _meta: { runtimeId: 'remote-runtime' }
      })
    })
    const target = { kind: 'environment', environmentId: 'env-back-online' } as const

    await expect(
      callRuntimeRpc(target, 'repo.list', undefined, { reuseRecentCompatibilityFailure: true })
    ).rejects.toThrow('offline')
    clearRecentRuntimeCompatibilityFailure('env-back-online')
    await expect(
      callRuntimeRpc(target, 'worktree.detectedList', undefined, {
        reuseRecentCompatibilityFailure: true
      })
    ).resolves.toEqual({ ok: true })

    expect(runtimeEnvironmentCall.mock.calls.map((call) => call[0].method)).toEqual([
      'status.get',
      'status.get',
      'worktree.detectedList'
    ])
  })

  it('keeps a proven-compatible cache entry when clearing recent failures', async () => {
    runtimeEnvironmentCall.mockImplementation(({ method }: { method: string }) => {
      if (method === 'status.get') {
        return Promise.resolve({
          id: 'status',
          ok: true,
          result: {
            runtimeId: 'remote-runtime',
            graphStatus: 'ready',
            runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
            minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION
          },
          _meta: { runtimeId: 'remote-runtime' }
        })
      }
      return Promise.resolve({
        id: method,
        ok: true,
        result: { ok: true },
        _meta: { runtimeId: 'remote-runtime' }
      })
    })
    const target = { kind: 'environment', environmentId: 'env-still-ok' } as const

    await expect(callRuntimeRpc(target, 'repo.list')).resolves.toEqual({ ok: true })
    clearRecentRuntimeCompatibilityFailure('env-still-ok')
    await expect(callRuntimeRpc(target, 'git.status')).resolves.toEqual({ ok: true })

    expect(runtimeEnvironmentCall.mock.calls.map((call) => call[0].method)).toEqual([
      'status.get',
      'repo.list',
      'git.status'
    ])
  })

  it('re-probes when a status success clears a still-pending compatibility probe', async () => {
    // Reconnect race: the offline probe stays queued on the dropped connection
    // (pending, not yet failed) while a fresh status publish reports the host
    // reachable. The clear must drop that doomed pending probe so the next
    // reuse-flagged call starts a fresh probe instead of coalescing onto it.
    let rejectFirstStatus!: (error: Error) => void
    let statusCalls = 0
    runtimeEnvironmentCall.mockImplementation(({ method }: { method: string }) => {
      if (method === 'status.get') {
        statusCalls += 1
        if (statusCalls === 1) {
          return new Promise((_, reject) => {
            rejectFirstStatus = reject
          })
        }
        return Promise.resolve({
          id: 'status',
          ok: true,
          result: {
            runtimeId: 'remote-runtime',
            graphStatus: 'ready',
            runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
            minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION
          },
          _meta: { runtimeId: 'remote-runtime' }
        })
      }
      return Promise.resolve({
        id: method,
        ok: true,
        result: { ok: true },
        _meta: { runtimeId: 'remote-runtime' }
      })
    })
    const target = { kind: 'environment', environmentId: 'env-reconnect' } as const

    const pendingResult = callRuntimeRpc(target, 'repo.list', undefined, {
      reuseRecentCompatibilityFailure: true
    }).then(
      () => 'resolved',
      (error) => `rejected:${error.message}`
    )
    // Let the first status.get register its in-flight cache entry.
    await Promise.resolve()

    clearRecentRuntimeCompatibilityFailure('env-reconnect')

    const secondCall = callRuntimeRpc(target, 'worktree.detectedList', undefined, {
      reuseRecentCompatibilityFailure: true
    })
    await Promise.resolve()
    // The doomed pending probe rejects; it must not fail the fresh re-probe.
    rejectFirstStatus(new Error('stale connection closed'))

    await expect(secondCall).resolves.toEqual({ ok: true })
    await expect(pendingResult).resolves.toBe('rejected:stale connection closed')

    expect(runtimeEnvironmentCall.mock.calls.map((call) => call[0].method)).toEqual([
      'status.get',
      'status.get',
      'worktree.detectedList'
    ])
  })

  it('checks advertised runtime capabilities after protocol compatibility', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'status',
      ok: true,
      result: {
        runtimeId: 'remote-runtime',
        graphStatus: 'ready',
        runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
        minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
        capabilities: ['project-host-setup.v1']
      },
      _meta: { runtimeId: 'remote-runtime' }
    })

    await expect(
      assertRuntimeEnvironmentCapability(
        'env-1',
        'project-host-setup.v1',
        'Project setup is unavailable.'
      )
    ).resolves.toBeUndefined()
  })

  it('re-probes capability support after a failed compatibility cache entry', async () => {
    let statusCalls = 0
    runtimeEnvironmentCall.mockImplementation(({ method }: { method: string }) => {
      if (method === 'status.get') {
        statusCalls += 1
        if (statusCalls === 1) {
          return Promise.resolve({
            id: 'status',
            ok: false,
            error: { code: 'runtime_unavailable', message: 'offline' },
            _meta: { runtimeId: 'remote-runtime' }
          })
        }
        return Promise.resolve({
          id: 'status',
          ok: true,
          result: {
            runtimeId: 'remote-runtime',
            graphStatus: 'ready',
            runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
            minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
            capabilities: ['linear.issue-attribute-filter.v1']
          },
          _meta: { runtimeId: 'remote-runtime' }
        })
      }
      return Promise.resolve({
        id: method,
        ok: true,
        result: { ok: true },
        _meta: { runtimeId: 'remote-runtime' }
      })
    })
    const target = { kind: 'environment', environmentId: 'env-cap-recover' } as const

    await expect(callRuntimeRpc(target, 'repo.list')).rejects.toThrow('offline')
    await expect(
      runtimeEnvironmentSupportsCapability('env-cap-recover', 'linear.issue-attribute-filter.v1')
    ).resolves.toBe(true)
    expect(statusCalls).toBe(2)
  })

  it('re-probes a missing capability on retry so a runtime upgrade can recover', async () => {
    let statusCalls = 0
    runtimeEnvironmentCall.mockImplementation(() => {
      statusCalls += 1
      return Promise.resolve({
        id: 'status',
        ok: true,
        result: {
          runtimeId: 'remote-runtime',
          graphStatus: 'ready',
          runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
          minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
          capabilities: statusCalls === 1 ? [] : ['linear.issue-attribute-filter.v1']
        },
        _meta: { runtimeId: 'remote-runtime' }
      })
    })

    await expect(
      runtimeEnvironmentSupportsCapability('env-cap-upgrade', 'linear.issue-attribute-filter.v1')
    ).resolves.toBe(false)
    await expect(
      runtimeEnvironmentSupportsCapability('env-cap-upgrade', 'linear.issue-attribute-filter.v1')
    ).resolves.toBe(true)
    expect(statusCalls).toBe(2)
  })

  it('dispatches capability-selected legacy without a redundant status probe', async () => {
    const methods: string[] = []
    runtimeEnvironmentCall.mockImplementation(({ method }: { method: string }) => {
      methods.push(method)
      if (method === 'status.get') {
        return Promise.resolve({
          id: 'status',
          ok: true,
          result: {
            runtimeId: 'old-runtime',
            graphStatus: 'ready',
            runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
            minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
            capabilities: []
          },
          _meta: { runtimeId: 'old-runtime' }
        })
      }
      return Promise.resolve({
        id: method,
        ok: true,
        result: { terminal: { handle: 'legacy' } },
        _meta: { runtimeId: 'old-runtime' }
      })
    })
    const target = { kind: 'environment', environmentId: 'env-legacy' } as const

    await expect(
      runtimeEnvironmentSupportsCapability('env-legacy', 'agent-session.host-authority.v1')
    ).resolves.toBe(false)
    await callRuntimeRpc(target, 'terminal.create', {}, { skipCompatibilityCheck: true })

    expect(methods).toEqual(['status.get', 'terminal.create'])
  })

  it('coalesces concurrent cold-cache capability probes onto one status.get', async () => {
    let statusCalls = 0
    runtimeEnvironmentCall.mockImplementation(() => {
      statusCalls += 1
      return Promise.resolve({
        id: 'status',
        ok: true,
        result: {
          runtimeId: 'remote-runtime',
          graphStatus: 'ready',
          runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
          minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
          capabilities: ['linear.issue-attribute-filter.v1']
        },
        _meta: { runtimeId: 'remote-runtime' }
      })
    })

    const [a, b, c] = await Promise.all([
      runtimeEnvironmentSupportsCapability(
        'env-cap-concurrent',
        'linear.issue-attribute-filter.v1'
      ),
      runtimeEnvironmentSupportsCapability(
        'env-cap-concurrent',
        'linear.issue-attribute-filter.v1'
      ),
      runtimeEnvironmentSupportsCapability('env-cap-concurrent', 'linear.issue-attribute-filter.v1')
    ])

    expect([a, b, c]).toEqual([true, true, true])
    expect(statusCalls).toBe(1)
  })

  it('expires a supported capability verdict so a runtime downgrade is detected', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(0))
    try {
      let statusCalls = 0
      runtimeEnvironmentCall.mockImplementation(() => {
        statusCalls += 1
        return Promise.resolve({
          id: 'status',
          ok: true,
          result: {
            runtimeId: 'remote-runtime',
            graphStatus: 'ready',
            runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
            minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
            capabilities: statusCalls === 1 ? ['linear.issue-attribute-filter.v1'] : []
          },
          _meta: { runtimeId: 'remote-runtime' }
        })
      })

      await expect(
        runtimeEnvironmentSupportsCapability(
          'env-cap-downgrade',
          'linear.issue-attribute-filter.v1'
        )
      ).resolves.toBe(true)
      vi.setSystemTime(new Date(59_999))
      await expect(
        runtimeEnvironmentSupportsCapability(
          'env-cap-downgrade',
          'linear.issue-attribute-filter.v1'
        )
      ).resolves.toBe(true)
      vi.setSystemTime(new Date(60_000))
      await expect(
        runtimeEnvironmentSupportsCapability(
          'env-cap-downgrade',
          'linear.issue-attribute-filter.v1'
        )
      ).resolves.toBe(false)
      expect(statusCalls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('invalidates a positive capability verdict when the endpoint runtime changes', async () => {
    let statusCalls = 0
    runtimeEnvironmentCall.mockImplementation(() => {
      statusCalls += 1
      const runtimeId = statusCalls === 1 ? 'runtime-before-restart' : 'runtime-after-restart'
      return Promise.resolve({
        id: 'status',
        ok: true,
        result: {
          runtimeId,
          graphStatus: 'ready',
          runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
          minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
          capabilities: statusCalls === 1 ? ['agent-session.host-authority.v1'] : []
        },
        _meta: { runtimeId }
      })
    })

    await expect(
      runtimeEnvironmentSupportsCapability(
        'env-runtime-replaced',
        'agent-session.host-authority.v1'
      )
    ).resolves.toBe(true)
    clearRecentRuntimeCompatibilityFailure('env-runtime-replaced', {
      runtimeId: 'runtime-after-restart',
      graphStatus: 'ready',
      runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
      minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION
    } as RuntimeStatus)
    await expect(
      runtimeEnvironmentSupportsCapability(
        'env-runtime-replaced',
        'agent-session.host-authority.v1'
      )
    ).resolves.toBe(false)
    expect(statusCalls).toBe(2)
  })

  it('rejects missing advertised runtime capabilities with the caller message', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'status',
      ok: true,
      result: {
        runtimeId: 'remote-runtime',
        graphStatus: 'ready',
        runtimeProtocolVersion: RUNTIME_PROTOCOL_VERSION,
        minCompatibleRuntimeClientVersion: MIN_COMPATIBLE_RUNTIME_CLIENT_VERSION,
        capabilities: []
      },
      _meta: { runtimeId: 'remote-runtime' }
    })

    await expect(
      assertRuntimeEnvironmentCapability(
        'env-1',
        'project-host-setup.v1',
        'Project setup is unavailable.'
      )
    ).rejects.toThrow('Project setup is unavailable.')
  })
})
