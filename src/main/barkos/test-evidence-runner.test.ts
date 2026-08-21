import { describe, expect, it, vi } from 'vitest'
import { runBarkosTestEvidence } from './test-evidence-runner'

const request = { version: 1 as const, dispatchId: 'dispatch-1', command: 'pnpm test' }

function dependencies(
  options: {
    executionHostId?: 'local' | `ssh:${string}` | `runtime:${string}`
    workspaceId?: string
    workspaceKind?: 'folder' | 'worktree'
  } = {}
) {
  const executionHostId = options.executionHostId ?? 'local'
  const workspaceId = options.workspaceId ?? 'repo-1::/workspace/repo'
  const workspaceKind = options.workspaceKind ?? 'worktree'
  const runLocal = vi.fn(async () => ({
    stdout: '12 tests passed\nTOKEN=secret-value',
    stderr: '',
    exitCode: 0,
    timedOut: false
  }))
  const runSsh = vi.fn(async () => ({
    stdout: '',
    stderr: 'suite failed',
    exitCode: 1,
    timedOut: false
  }))
  const runRuntime = vi.fn(async () => ({
    version: 1 as const,
    command: 'pnpm test',
    status: 'passed' as const,
    summary: 'Exited with code 0. 12 tests passed',
    durationMs: 25
  }))
  return {
    companyStore: { load: () => ({ id: 'company-1', createdAt: 1 }) },
    ledgerStore: {
      load: () => ({
        dispatches: [
          {
            id: 'dispatch-1',
            assignmentId: 'assignment-1',
            taskId: 'task-1',
            workerId: 'worker-1',
            state: 'running',
            workspaceId,
            executionHostId,
            orchestrationRunId: 'run-1',
            orchestrationTaskId: 'task-runtime-1',
            orchestrationDispatchId: 'dispatch-runtime-1'
          }
        ],
        assignments: [
          {
            id: 'assignment-1',
            taskId: 'task-1',
            workerId: 'worker-1',
            status: 'dispatched'
          }
        ]
      })
    },
    workerSessionStore: {
      load: () => ({
        bindings: [
          {
            workerId: 'worker-1',
            state: 'created',
            workspaceId,
            workspaceKind,
            executionHostId,
            tabId: 'tab-1'
          }
        ]
      })
    },
    workspaceStore: {
      getFolderWorkspace: (id: string) =>
        id === 'docs'
          ? {
              id,
              folderPath: '/workspace/docs',
              executionHostId
            }
          : undefined,
      getRepos: () => [
        {
          id: 'repo-1',
          connectionId: executionHostId.startsWith('ssh:')
            ? decodeURIComponent(executionHostId.slice(4))
            : null,
          executionHostId
        }
      ]
    },
    runLocal,
    runSsh,
    runRuntime
  }
}

describe('BarkOS test evidence runner', () => {
  it('runs in the exact local worktree and redacts captured output', async () => {
    const deps = dependencies()
    const result = await runBarkosTestEvidence(deps as never, request, new AbortController().signal)

    expect(deps.runLocal).toHaveBeenCalledWith(
      'pnpm',
      ['test'],
      '/workspace/repo',
      expect.any(AbortSignal)
    )
    expect(result).toMatchObject({ status: 'passed', command: 'pnpm test' })
    expect(result.summary).toContain('12 tests passed')
    expect(result.summary).toContain('[redacted:labeled-kv]')
    expect(result.summary).not.toContain('secret-value')
  })

  it('routes an exact SSH folder binding without falling back locally', async () => {
    const deps = dependencies({
      executionHostId: 'ssh:server-1',
      workspaceId: 'folder:docs',
      workspaceKind: 'folder'
    })
    const result = await runBarkosTestEvidence(deps as never, request, new AbortController().signal)

    expect(deps.runSsh).toHaveBeenCalledWith(
      'server-1',
      'pnpm',
      ['test'],
      '/workspace/docs',
      expect.any(AbortSignal)
    )
    expect(deps.runLocal).not.toHaveBeenCalled()
    expect(result).toMatchObject({ status: 'failed' })
  })

  it('fails closed on stale Dispatch identity', async () => {
    const stale = dependencies()
    stale.workerSessionStore.load = () => ({ bindings: [] })
    await expect(
      runBarkosTestEvidence(stale as never, request, new AbortController().signal)
    ).rejects.toThrow('barkos_test_dispatch_authority_mismatch')
    expect(stale.runLocal).not.toHaveBeenCalled()
  })

  it('routes paired execution with exact workspace, tab, and Dispatch authority', async () => {
    const paired = dependencies({ executionHostId: 'runtime:env-1' })
    const result = await runBarkosTestEvidence(
      paired as never,
      request,
      new AbortController().signal
    )

    expect(paired.runRuntime).toHaveBeenCalledWith(
      'env-1',
      {
        version: 1,
        workspaceId: 'repo-1::/workspace/repo',
        tabId: 'tab-1',
        orchestrationRunId: 'run-1',
        orchestrationTaskId: 'task-runtime-1',
        orchestrationDispatchId: 'dispatch-runtime-1',
        command: 'pnpm test'
      },
      expect.any(AbortSignal)
    )
    expect(paired.runLocal).not.toHaveBeenCalled()
    expect(result.status).toBe('passed')
  })

  it('fails closed when paired execution lacks host authority or a runtime route', async () => {
    const missingAuthority = dependencies({ executionHostId: 'runtime:env-1' })
    const ledger = missingAuthority.ledgerStore.load()
    missingAuthority.ledgerStore.load = () => ledger
    const dispatch = ledger.dispatches[0]
    ;(dispatch as { orchestrationDispatchId: string | null }).orchestrationDispatchId = null
    await expect(
      runBarkosTestEvidence(missingAuthority as never, request, new AbortController().signal)
    ).rejects.toThrow('barkos_test_paired_runtime_authority_missing')

    const missingRoute = dependencies({ executionHostId: 'runtime:env-1' })
    delete (missingRoute as { runRuntime?: unknown }).runRuntime
    await expect(
      runBarkosTestEvidence(missingRoute as never, request, new AbortController().signal)
    ).rejects.toThrow('barkos_test_paired_runtime_unavailable')
  })
})
