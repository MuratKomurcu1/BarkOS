import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RpcRequest, RpcResponse } from '../core'
import { RpcDispatcher } from '../dispatcher'
import { BARKOS_USAGE_COST_METHODS } from './barkos-usage-cost'

const params = {
  version: 1 as const,
  orchestrationDispatchIds: ['dispatch-1']
}

function request(requestParams: unknown = params): RpcRequest {
  return {
    id: 'request-1',
    authToken: 'token',
    method: 'barkos.usageCost.collect',
    params: requestParams
  }
}

function harness() {
  const collect = vi.fn(async () => ({ version: 1, runtimeId: 'runtime-1', records: [] }))
  const runtime = {
    getRuntimeId: () => 'runtime-1',
    collectBarkosRemoteUsageCosts: collect
  } as unknown as OrcaRuntimeService
  return { collect, dispatcher: new RpcDispatcher({ runtime, methods: BARKOS_USAGE_COST_METHODS }) }
}

async function dispatchPaired(
  dispatcher: RpcDispatcher,
  rpcRequest = request()
): Promise<RpcResponse> {
  const replies: RpcResponse[] = []
  await dispatcher.dispatchStreaming(
    rpcRequest,
    (response) => replies.push(JSON.parse(response) as RpcResponse),
    { pairedDeviceId: 'device-1', clientKind: 'runtime' }
  )
  return replies[0]
}

describe('paired BarkOS usage cost RPC', () => {
  it('binds collection to the authenticated paired runtime owner', async () => {
    const { collect, dispatcher } = harness()

    await expect(dispatchPaired(dispatcher)).resolves.toMatchObject({ ok: true })
    expect(collect).toHaveBeenCalledWith(params, 'device-1')
  })

  it('rejects unauthenticated callers and incompatible request versions', async () => {
    const { collect, dispatcher } = harness()

    await expect(dispatcher.dispatch(request())).resolves.toMatchObject({ ok: false })
    await expect(
      dispatchPaired(dispatcher, request({ ...params, version: 2 }))
    ).resolves.toMatchObject({ ok: false })
    expect(collect).not.toHaveBeenCalled()
  })
})
