import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY,
  BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY_V2,
  BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY_V3
} from '../../shared/barkos/paired-side-effect-approval'
import { makePaneKey } from '../../shared/stable-pane-id'

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  subscribe: vi.fn(),
  call: vi.fn(),
  close: vi.fn(),
  evaluatePaired: vi.fn()
}))

vi.mock('../ipc/runtime-environment-transport-routing', () => ({
  getRuntimeEnvironmentStatus: mocks.getStatus,
  subscribeRuntimeEnvironment: mocks.subscribe,
  callRuntimeEnvironment: mocks.call
}))

import { BarkosPairedSideEffectApprovalClient } from './paired-side-effect-approval-client'

const paneKey = makePaneKey('tab-1', '11111111-1111-4111-8111-111111111111')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getStatus.mockResolvedValue({
    id: 'status',
    ok: true,
    result: {
      runtimeId: 'runtime-1',
      capabilities: [
        BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY,
        BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY_V2,
        BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY_V3
      ]
    },
    _meta: { runtimeId: 'runtime-1' }
  })
  mocks.subscribe.mockImplementation(
    async (_path, _environmentId, _method, _params, _timeout, callbacks) => {
      callbacks.onEvent({
        type: 'response',
        response: {
          id: 'subscribe',
          ok: true,
          result: { type: 'ready', version: 1, subscriptionId: 'subscription-1' },
          _meta: { runtimeId: 'runtime-1' }
        }
      })
      return { requestId: 'request-1', close: mocks.close, sendBinary: vi.fn() }
    }
  )
  mocks.evaluatePaired.mockReturnValue({ version: 1, matched: true, decision: null })
  mocks.call.mockResolvedValue({
    id: 'resolve',
    ok: true,
    result: { resolved: true },
    _meta: { runtimeId: 'runtime-1' }
  })
})

describe('paired BarkOS side-effect approval client', () => {
  it('prepares only hosts that advertise the approval capability', async () => {
    const client = new BarkosPairedSideEffectApprovalClient('/profile', {
      evaluatePaired: mocks.evaluatePaired
    } as never)

    await expect(client.prepare('env-1', 'codex')).resolves.toBe(true)
    await expect(client.prepare('env-1', 'codex')).resolves.toBe(true)
    expect(mocks.subscribe).toHaveBeenCalledOnce()

    mocks.getStatus.mockResolvedValue({
      id: 'status',
      ok: true,
      result: { runtimeId: 'runtime-2', capabilities: [] },
      _meta: { runtimeId: 'runtime-2' }
    })
    await expect(client.prepare('env-2', 'codex')).resolves.toBe(false)
    expect(mocks.subscribe).toHaveBeenCalledOnce()
  })

  it('fails closed for Droid when the paired host advertises only v1', async () => {
    mocks.getStatus.mockResolvedValue({
      id: 'status',
      ok: true,
      result: {
        runtimeId: 'runtime-old',
        capabilities: [BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY]
      },
      _meta: { runtimeId: 'runtime-old' }
    })
    const client = new BarkosPairedSideEffectApprovalClient('/profile', {
      evaluatePaired: mocks.evaluatePaired
    } as never)

    await expect(client.prepare('env-old', 'droid')).resolves.toBe(false)
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })

  it('fails closed for Gemini when the paired host advertises only v2', async () => {
    mocks.getStatus.mockResolvedValue({
      id: 'status',
      ok: true,
      result: {
        runtimeId: 'runtime-old',
        capabilities: [BARKOS_PAIRED_SIDE_EFFECT_APPROVAL_RUNTIME_CAPABILITY_V2]
      },
      _meta: { runtimeId: 'runtime-old' }
    })
    const client = new BarkosPairedSideEffectApprovalClient('/profile', {
      evaluatePaired: mocks.evaluatePaired
    } as never)

    await expect(client.prepare('env-old', 'gemini')).resolves.toBe(false)
    expect(mocks.subscribe).not.toHaveBeenCalled()
  })

  it('evaluates a host request locally and returns the result through owner-authenticated RPC', async () => {
    let callbacks!: { onEvent: (event: unknown) => void }
    mocks.subscribe.mockImplementation(async (...args) => {
      callbacks = args[5]
      callbacks.onEvent({
        type: 'response',
        response: {
          id: 'subscribe',
          ok: true,
          result: { type: 'ready', version: 1, subscriptionId: 'subscription-1' },
          _meta: { runtimeId: 'runtime-1' }
        }
      })
      return { requestId: 'request-1', close: mocks.close, sendBinary: vi.fn() }
    })
    const client = new BarkosPairedSideEffectApprovalClient('/profile', {
      evaluatePaired: mocks.evaluatePaired
    } as never)
    await client.prepare('env-1', 'codex')

    callbacks.onEvent({
      type: 'response',
      response: {
        id: 'subscribe',
        ok: true,
        result: {
          type: 'request',
          version: 1,
          requestId: 'approval-1',
          request: {
            source: 'codex',
            paneKey,
            launchToken: 'launch-token',
            sideEffectEnforcement: true,
            toolName: 'shell',
            toolInput: { command: 'git push' }
          },
          authority: {
            runtimeId: 'runtime-1',
            worktreeId: 'worktree-1',
            terminalHandle: 'term-1',
            orchestrationRunId: 'run-1',
            orchestrationTaskId: 'task-1',
            orchestrationDispatchId: 'dispatch-1'
          }
        },
        _meta: { runtimeId: 'runtime-1' }
      }
    })
    await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledOnce())

    expect(mocks.evaluatePaired).toHaveBeenCalledWith(
      expect.objectContaining({ environmentId: 'env-1', expectedRuntimeId: 'runtime-1' })
    )
    expect(mocks.call).toHaveBeenCalledWith(
      '/profile',
      'env-1',
      'barkos.sideEffectApproval.resolve',
      {
        version: 1,
        requestId: 'approval-1',
        response: { version: 1, matched: true, decision: null }
      },
      4_000
    )
  })

  it('negotiates v2 before accepting a paired Droid approval request', async () => {
    let callbacks!: { onEvent: (event: unknown) => void }
    mocks.subscribe.mockImplementation(async (...args) => {
      callbacks = args[5]
      callbacks.onEvent({
        type: 'response',
        response: {
          id: 'subscribe',
          ok: true,
          result: { type: 'ready', version: 2, subscriptionId: 'subscription-2' },
          _meta: { runtimeId: 'runtime-1' }
        }
      })
      return { requestId: 'request-2', close: mocks.close, sendBinary: vi.fn() }
    })
    const client = new BarkosPairedSideEffectApprovalClient('/profile', {
      evaluatePaired: mocks.evaluatePaired
    } as never)

    await expect(client.prepare('env-1', 'droid')).resolves.toBe(true)
    expect(mocks.subscribe).toHaveBeenCalledWith(
      '/profile',
      'env-1',
      'barkos.sideEffectApproval.subscribeV2',
      undefined,
      10_000,
      expect.any(Object)
    )

    callbacks.onEvent({
      type: 'response',
      response: {
        id: 'subscribe',
        ok: true,
        result: {
          type: 'request',
          version: 2,
          requestId: 'approval-2',
          request: {
            source: 'droid',
            paneKey,
            launchToken: 'launch-token',
            sideEffectEnforcement: true,
            toolName: 'Execute',
            toolInput: { command: 'git push' }
          },
          authority: {
            runtimeId: 'runtime-1',
            worktreeId: 'worktree-1',
            terminalHandle: 'term-1',
            orchestrationRunId: 'run-1',
            orchestrationTaskId: 'task-1',
            orchestrationDispatchId: 'dispatch-1'
          }
        },
        _meta: { runtimeId: 'runtime-1' }
      }
    })
    await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledOnce())
    expect(mocks.call).toHaveBeenCalledWith(
      '/profile',
      'env-1',
      'barkos.sideEffectApproval.resolveV2',
      {
        version: 2,
        requestId: 'approval-2',
        response: { version: 1, matched: true, decision: null }
      },
      4_000
    )
  })

  it('negotiates v3 before resolving a paired Gemini approval request', async () => {
    let callbacks!: { onEvent: (event: unknown) => void }
    mocks.evaluatePaired.mockReturnValue({
      version: 1,
      matched: true,
      decision: { decision: 'deny', reason: 'Approval required.' }
    })
    mocks.subscribe.mockImplementation(async (...args) => {
      callbacks = args[5]
      callbacks.onEvent({
        type: 'response',
        response: {
          id: 'subscribe',
          ok: true,
          result: { type: 'ready', version: 3, subscriptionId: 'subscription-3' },
          _meta: { runtimeId: 'runtime-1' }
        }
      })
      return { requestId: 'request-3', close: mocks.close, sendBinary: vi.fn() }
    })
    const client = new BarkosPairedSideEffectApprovalClient('/profile', {
      evaluatePaired: mocks.evaluatePaired
    } as never)

    await expect(client.prepare('env-1', 'gemini')).resolves.toBe(true)
    expect(mocks.subscribe).toHaveBeenCalledWith(
      '/profile',
      'env-1',
      'barkos.sideEffectApproval.subscribeV3',
      undefined,
      10_000,
      expect.any(Object)
    )

    callbacks.onEvent({
      type: 'response',
      response: {
        id: 'subscribe',
        ok: true,
        result: {
          type: 'request',
          version: 3,
          requestId: 'approval-3',
          request: {
            source: 'gemini',
            paneKey,
            launchToken: 'launch-token',
            sideEffectEnforcement: true,
            toolName: 'run_shell_command',
            toolInput: { command: 'git push' }
          },
          authority: {
            runtimeId: 'runtime-1',
            worktreeId: 'worktree-1',
            terminalHandle: 'term-1',
            orchestrationRunId: 'run-1',
            orchestrationTaskId: 'task-1',
            orchestrationDispatchId: 'dispatch-1'
          }
        },
        _meta: { runtimeId: 'runtime-1' }
      }
    })
    await vi.waitFor(() => expect(mocks.call).toHaveBeenCalledOnce())
    expect(mocks.call).toHaveBeenCalledWith(
      '/profile',
      'env-1',
      'barkos.sideEffectApproval.resolveV3',
      {
        version: 3,
        requestId: 'approval-3',
        response: {
          version: 1,
          matched: true,
          decision: { decision: 'deny', reason: 'Approval required.' }
        }
      },
      4_000
    )
  })
})
