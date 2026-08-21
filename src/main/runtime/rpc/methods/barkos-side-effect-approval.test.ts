import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RpcRequest, RpcResponse } from '../core'
import { RpcDispatcher } from '../dispatcher'
import { BARKOS_SIDE_EFFECT_APPROVAL_METHODS } from './barkos-side-effect-approval'

function request(method: string, params?: unknown): RpcRequest {
  return { id: 'request-1', authToken: 'token', method, params }
}

describe('paired BarkOS side-effect approval RPC', () => {
  it('accepts resolutions only from the authenticated runtime owner', async () => {
    const resolve = vi.fn(() => true)
    const runtime = {
      getRuntimeId: () => 'runtime-1',
      getBarkosPairedSideEffectApprovalBroker: () => ({ resolve })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: BARKOS_SIDE_EFFECT_APPROVAL_METHODS })
    const params = {
      version: 1,
      requestId: 'approval-1',
      response: { version: 1, matched: true, decision: null }
    }

    const unauthorized = await dispatcher.dispatch(
      request('barkos.sideEffectApproval.resolve', params)
    )
    expect(unauthorized).toMatchObject({ ok: false })
    expect(resolve).not.toHaveBeenCalled()

    const replies: RpcResponse[] = []
    await dispatcher.dispatchStreaming(
      request('barkos.sideEffectApproval.resolve', params),
      (response) => replies.push(JSON.parse(response) as RpcResponse),
      { pairedDeviceId: 'device-1', clientKind: 'runtime' }
    )
    expect(replies[0]).toMatchObject({ ok: true, result: { resolved: true } })
    expect(resolve).toHaveBeenCalledWith('device-1', params)
  })

  it('rejects mobile subscribers before registering a broker listener', async () => {
    const subscribe = vi.fn()
    const runtime = {
      getRuntimeId: () => 'runtime-1',
      getBarkosPairedSideEffectApprovalBroker: () => ({ subscribe })
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: BARKOS_SIDE_EFFECT_APPROVAL_METHODS })
    const replies: RpcResponse[] = []

    await dispatcher.dispatchStreaming(
      request('barkos.sideEffectApproval.subscribe'),
      (response) => replies.push(JSON.parse(response) as RpcResponse),
      { pairedDeviceId: 'mobile-1', clientKind: 'mobile' }
    )
    expect(replies[0]).toMatchObject({ ok: false })
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('binds the Droid-capable v2 stream and resolutions to protocol version 2', async () => {
    let close!: () => void
    const closed = new Promise<void>((resolve) => {
      close = resolve
    })
    const subscribe = vi.fn(() => ({
      subscriptionId: 'subscription-2',
      close: vi.fn(),
      closed
    }))
    const resolve = vi.fn(() => true)
    const runtime = {
      getRuntimeId: () => 'runtime-1',
      getBarkosPairedSideEffectApprovalBroker: () => ({ subscribe, resolve }),
      registerSubscriptionCleanup: vi.fn(),
      cleanupSubscription: vi.fn()
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: BARKOS_SIDE_EFFECT_APPROVAL_METHODS })
    const replies: RpcResponse[] = []
    const subscription = dispatcher.dispatchStreaming(
      request('barkos.sideEffectApproval.subscribeV2'),
      (response) => replies.push(JSON.parse(response) as RpcResponse),
      { pairedDeviceId: 'device-1', clientKind: 'runtime' }
    )
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalled())
    expect(subscribe).toHaveBeenCalledWith('device-1', expect.any(Function), 2)
    close()
    await subscription

    await dispatcher.dispatchStreaming(
      request('barkos.sideEffectApproval.resolveV2', {
        version: 2,
        requestId: 'approval-2',
        response: { version: 1, matched: true, decision: null }
      }),
      (response) => replies.push(JSON.parse(response) as RpcResponse),
      { pairedDeviceId: 'device-1', clientKind: 'runtime' }
    )
    expect(resolve).toHaveBeenCalledWith(
      'device-1',
      expect.objectContaining({ version: 2, requestId: 'approval-2' })
    )
  })

  it('binds the Gemini-capable v3 stream and resolution to version 3', async () => {
    let close!: () => void
    const closed = new Promise<void>((resolve) => {
      close = resolve
    })
    const subscribe = vi.fn(() => ({
      subscriptionId: 'subscription-3',
      close: vi.fn(),
      closed
    }))
    const resolve = vi.fn(() => true)
    const runtime = {
      getRuntimeId: () => 'runtime-1',
      getBarkosPairedSideEffectApprovalBroker: () => ({ subscribe, resolve }),
      registerSubscriptionCleanup: vi.fn(),
      cleanupSubscription: vi.fn()
    } as unknown as OrcaRuntimeService
    const dispatcher = new RpcDispatcher({ runtime, methods: BARKOS_SIDE_EFFECT_APPROVAL_METHODS })
    const replies: RpcResponse[] = []
    const subscription = dispatcher.dispatchStreaming(
      request('barkos.sideEffectApproval.subscribeV3'),
      (response) => replies.push(JSON.parse(response) as RpcResponse),
      { pairedDeviceId: 'device-1', clientKind: 'runtime' }
    )
    await vi.waitFor(() => expect(subscribe).toHaveBeenCalled())
    expect(subscribe).toHaveBeenCalledWith('device-1', expect.any(Function), 3)
    close()
    await subscription

    await dispatcher.dispatchStreaming(
      request('barkos.sideEffectApproval.resolveV3', {
        version: 3,
        requestId: 'approval-3',
        response: {
          version: 1,
          matched: true,
          decision: { decision: 'deny', reason: 'Blocked.' }
        }
      }),
      (response) => replies.push(JSON.parse(response) as RpcResponse),
      { pairedDeviceId: 'device-1', clientKind: 'runtime' }
    )
    expect(resolve).toHaveBeenCalledWith(
      'device-1',
      expect.objectContaining({ version: 3, requestId: 'approval-3' })
    )
  })
})
