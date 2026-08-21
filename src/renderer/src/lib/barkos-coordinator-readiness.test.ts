import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import type * as runtimeRpcClientModule from '../runtime/runtime-rpc-client'

const callRuntimeRpc = vi.hoisted(() => vi.fn())

vi.mock('../runtime/runtime-rpc-client', async (importOriginal) => {
  const original = await importOriginal<typeof runtimeRpcClientModule>()
  return { ...original, callRuntimeRpc }
})

import { waitForBarkosCoordinatorReadiness } from './barkos-coordinator-readiness'

const binding: BarkosWorkerSessionBinding = {
  workerId: 'ada',
  agent: 'codex',
  targetId: 'target-main',
  workspaceId: 'workspace-main',
  workspaceKind: 'folder',
  executionHostId: 'local',
  tabId: 'tab-lead',
  state: 'created',
  launchedAt: 1
}

beforeEach(() => callRuntimeRpc.mockReset())

describe('BarkOS coordinator readiness', () => {
  it('waits until the agent terminal receives a stable runtime identity', async () => {
    callRuntimeRpc
      .mockRejectedValueOnce(
        Object.assign(new Error('Not ready'), { code: 'stable_pane_required' })
      )
      .mockResolvedValueOnce({ run: null })

    await waitForBarkosCoordinatorReadiness({
      binding,
      terminalHandle: 'term-lead',
      timeoutMs: 100,
      retryDelayMs: 0
    })

    expect(callRuntimeRpc).toHaveBeenCalledTimes(2)
    expect(callRuntimeRpc).toHaveBeenLastCalledWith({ kind: 'local' }, 'orchestration.runCurrent', {
      from: 'term-lead'
    })
  })

  it('does not retry an operational runtime failure', async () => {
    callRuntimeRpc.mockRejectedValueOnce(Object.assign(new Error('Denied'), { code: 'forbidden' }))

    await expect(
      waitForBarkosCoordinatorReadiness({
        binding,
        terminalHandle: 'term-lead',
        timeoutMs: 100,
        retryDelayMs: 0
      })
    ).rejects.toThrow('Denied')
    expect(callRuntimeRpc).toHaveBeenCalledTimes(1)
  })
})
