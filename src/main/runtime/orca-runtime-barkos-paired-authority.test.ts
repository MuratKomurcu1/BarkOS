import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { makePaneKey } from '../../shared/stable-pane-id'
import type { BarkosPairedSideEffectHostAuthority } from '../barkos/paired-side-effect-approval-broker'
import type { BarkosRemoteUsageDispatchIdentity } from '../barkos/remote-usage-cost-collector'
import { OrcaRuntimeService } from './orca-runtime'

const paneKey = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')

function runtimeAuthorityHarness() {
  const runtime = new OrcaRuntimeService()
  const pty = {
    connected: true,
    barkosSideEffectApprovalOwnerDeviceId: 'device-1',
    launchToken: 'launch-token',
    launchIncarnationId: 'incarnation-1',
    incarnationId: 'incarnation-1',
    launchAgent: 'codex',
    worktreeId: 'worktree-1',
    tabId: 'tab-1',
    connectionId: null as string | null
  }
  const internal = runtime as unknown as {
    runtimeId: string
    getPtyRecordForPaneKey: ReturnType<typeof vi.fn>
    getTerminalHandleForPaneKey: ReturnType<typeof vi.fn>
    getOrchestrationDb: ReturnType<typeof vi.fn>
    getOrchestrationDispatchAuthority: ReturnType<typeof vi.fn>
    getAgentProviderSessionRowsForPaneFn: ReturnType<typeof vi.fn>
    resolveTerminalWorkspaceLaunchScope: ReturnType<typeof vi.fn>
    resolveBarkosRemoteUsageDispatch: (
      orchestrationDispatchId: string,
      ownerDeviceId: string
    ) => BarkosRemoteUsageDispatchIdentity
    resolveBarkosPairedTestEvidenceCwd: (
      request: {
        version: 1
        workspaceId: string
        tabId: string
        orchestrationRunId: string
        orchestrationTaskId: string
        orchestrationDispatchId: string
        command: string
      },
      ownerDeviceId: string
    ) => Promise<string>
    resolveBarkosPairedSideEffectHostAuthority: (request: {
      source: 'codex'
      paneKey: string
      launchToken: string
      sideEffectEnforcement: true
      toolName: string
      toolInput: unknown
    }) => BarkosPairedSideEffectHostAuthority
  }
  internal.getPtyRecordForPaneKey = vi.fn(() => pty)
  internal.getTerminalHandleForPaneKey = vi.fn(() => 'term-1')
  const dispatch = {
    id: 'dispatch-1',
    run_id: 'run-1',
    task_id: 'task-1',
    status: 'dispatched',
    assignee_handle: 'term-1',
    assignee_pane_key: paneKey,
    process_incarnation: 'process-1',
    launch_token_hash: createHash('sha256').update('launch-token').digest('hex'),
    dispatched_at: new Date(1_000).toISOString(),
    completed_at: new Date(2_000).toISOString()
  }
  internal.getOrchestrationDb = vi.fn(() => ({
    getDispatchContextById: vi.fn(() => dispatch),
    getActiveDispatchForIdentity: vi.fn(() => ({
      id: 'dispatch-1',
      run_id: 'run-1',
      task_id: 'task-1',
      assignee_pane_key: paneKey,
      launch_token_hash: createHash('sha256').update('launch-token').digest('hex')
    }))
  }))
  internal.getOrchestrationDispatchAuthority = vi.fn(() => ({
    processIncarnation: 'process-1',
    worktreeId: 'worktree-1',
    hostScope: { kind: 'local', hostId: 'local' }
  }))
  internal.getAgentProviderSessionRowsForPaneFn = vi.fn(() => [
    {
      paneKey,
      agentType: 'codex',
      worktreeId: 'worktree-1',
      orchestration: { dispatchId: 'dispatch-1' },
      providerSession: { id: 'provider-session-1' }
    }
  ])
  internal.resolveTerminalWorkspaceLaunchScope = vi.fn(async () => ({
    id: 'worktree-1',
    path: '/workspace/repo',
    connectionId: null
  }))
  return { internal, pty, dispatch }
}

describe('runtime paired BarkOS worker authority', () => {
  it('binds authority to live PTY incarnation, launch token, agent, and Dispatch', () => {
    const { internal } = runtimeAuthorityHarness()
    const request = {
      source: 'codex' as const,
      paneKey,
      launchToken: 'launch-token',
      sideEffectEnforcement: true as const,
      toolName: 'shell',
      toolInput: { command: 'git push' }
    }

    expect(internal.resolveBarkosPairedSideEffectHostAuthority(request)).toEqual({
      status: 'verified',
      ownerDeviceId: 'device-1',
      authority: {
        runtimeId: internal.runtimeId,
        worktreeId: 'worktree-1',
        terminalHandle: 'term-1',
        orchestrationRunId: 'run-1',
        orchestrationTaskId: 'task-1',
        orchestrationDispatchId: 'dispatch-1'
      }
    })
  })

  it('denies stale token and process incarnations', () => {
    const { internal, pty } = runtimeAuthorityHarness()
    const request = {
      source: 'codex' as const,
      paneKey,
      launchToken: 'wrong-token',
      sideEffectEnforcement: true as const,
      toolName: 'shell',
      toolInput: { command: 'git push' }
    }
    expect(internal.resolveBarkosPairedSideEffectHostAuthority(request)).toEqual({
      status: 'invalid'
    })

    request.launchToken = 'launch-token'
    pty.incarnationId = 'incarnation-2'
    expect(internal.resolveBarkosPairedSideEffectHostAuthority(request)).toEqual({
      status: 'invalid'
    })
  })

  it('resolves paired test cwd only for the owning device and exact live Dispatch', async () => {
    const { internal } = runtimeAuthorityHarness()
    const request = {
      version: 1 as const,
      workspaceId: 'worktree-1',
      tabId: 'tab-1',
      orchestrationRunId: 'run-1',
      orchestrationTaskId: 'task-1',
      orchestrationDispatchId: 'dispatch-1',
      command: 'pnpm test'
    }

    await expect(internal.resolveBarkosPairedTestEvidenceCwd(request, 'device-1')).resolves.toBe(
      '/workspace/repo'
    )
    await expect(internal.resolveBarkosPairedTestEvidenceCwd(request, 'device-2')).rejects.toThrow(
      'barkos_test_paired_runtime_authority_mismatch'
    )
  })

  it('denies stale Dispatches, nested hosts, and changed process authority', async () => {
    const { internal, dispatch } = runtimeAuthorityHarness()
    const request = {
      version: 1 as const,
      workspaceId: 'worktree-1',
      tabId: 'tab-1',
      orchestrationRunId: 'run-1',
      orchestrationTaskId: 'task-1',
      orchestrationDispatchId: 'dispatch-1',
      command: 'pnpm test'
    }

    dispatch.status = 'completed'
    await expect(internal.resolveBarkosPairedTestEvidenceCwd(request, 'device-1')).rejects.toThrow(
      'barkos_test_paired_runtime_authority_mismatch'
    )

    dispatch.status = 'dispatched'
    internal.resolveTerminalWorkspaceLaunchScope = vi.fn(async () => ({
      id: 'worktree-1',
      path: '/workspace/repo',
      connectionId: 'nested-ssh'
    }))
    await expect(internal.resolveBarkosPairedTestEvidenceCwd(request, 'device-1')).rejects.toThrow(
      'barkos_test_paired_runtime_authority_mismatch'
    )

    internal.resolveTerminalWorkspaceLaunchScope = vi.fn(async () => {
      internal.getOrchestrationDispatchAuthority = vi.fn(() => ({
        processIncarnation: 'process-2',
        worktreeId: 'worktree-1',
        hostScope: { kind: 'local', hostId: 'local' }
      }))
      return { id: 'worktree-1', path: '/workspace/repo', connectionId: null }
    })
    await expect(internal.resolveBarkosPairedTestEvidenceCwd(request, 'device-1')).rejects.toThrow(
      'barkos_test_paired_runtime_authority_mismatch'
    )
  })

  it('resolves remote usage identity only for the authenticated host owner', () => {
    const { internal, dispatch, pty } = runtimeAuthorityHarness()
    dispatch.status = 'completed'

    expect(internal.resolveBarkosRemoteUsageDispatch('dispatch-1', 'device-1')).toEqual({
      status: 'verified',
      orchestrationDispatchId: 'dispatch-1',
      workspaceId: 'worktree-1',
      provider: 'codex',
      providerSessionId: 'provider-session-1',
      startedAt: 1_000,
      finishedAt: 2_000
    })
    expect(internal.resolveBarkosRemoteUsageDispatch('dispatch-1', 'device-2')).toMatchObject({
      status: 'unavailable',
      reason: 'execution-owner-mismatch'
    })

    pty.connectionId = 'nested-ssh'
    expect(internal.resolveBarkosRemoteUsageDispatch('dispatch-1', 'device-1')).toMatchObject({
      status: 'unavailable',
      reason: 'execution-not-local-to-host'
    })
  })
})
