import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import type { RpcRequest, RpcResponse } from '../core'
import { RpcDispatcher } from '../dispatcher'
import { runBarkosLocalTestEvidenceCommand } from '../../../barkos/test-evidence-command-executor'
import type * as TestEvidenceCommandExecutor from '../../../barkos/test-evidence-command-executor'
import { BARKOS_TEST_EVIDENCE_METHODS } from './barkos-test-evidence'

vi.mock('../../../barkos/test-evidence-command-executor', async (importOriginal) => {
  const original = await importOriginal<typeof TestEvidenceCommandExecutor>()
  return { ...original, runBarkosLocalTestEvidenceCommand: vi.fn() }
})

const params = {
  version: 1,
  workspaceId: 'worktree-1',
  tabId: 'tab-1',
  orchestrationRunId: 'run-1',
  orchestrationTaskId: 'task-1',
  orchestrationDispatchId: 'dispatch-1',
  command: 'pnpm test'
}

function request(command = 'pnpm test'): RpcRequest {
  return {
    id: 'request-1',
    authToken: 'token',
    method: 'barkos.testEvidence.run',
    params: { ...params, command }
  }
}

function harness() {
  const resolveCwd = vi.fn(async () => '/workspace/repo')
  const runtime = {
    getRuntimeId: () => 'runtime-1',
    resolveBarkosPairedTestEvidenceCwd: resolveCwd
  } as unknown as OrcaRuntimeService
  return {
    resolveCwd,
    dispatcher: new RpcDispatcher({ runtime, methods: BARKOS_TEST_EVIDENCE_METHODS })
  }
}

async function dispatchPaired(
  dispatcher: RpcDispatcher,
  rpcRequest = request(),
  signal?: AbortSignal
): Promise<RpcResponse> {
  const replies: RpcResponse[] = []
  await dispatcher.dispatchStreaming(
    rpcRequest,
    (response) => replies.push(JSON.parse(response) as RpcResponse),
    { pairedDeviceId: 'device-1', clientKind: 'runtime', signal }
  )
  return replies[0]
}

describe('paired BarkOS test evidence RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(runBarkosLocalTestEvidenceCommand).mockResolvedValue({
      stdout: '12 tests passed',
      stderr: '',
      exitCode: 0,
      timedOut: false
    })
  })

  it('executes only after authenticated host authority resolves the cwd', async () => {
    const { dispatcher, resolveCwd } = harness()
    const response = await dispatchPaired(dispatcher)

    expect(response).toMatchObject({
      ok: true,
      result: { version: 1, command: 'pnpm test', status: 'passed' }
    })
    expect(resolveCwd).toHaveBeenCalledWith(params, 'device-1')
    expect(runBarkosLocalTestEvidenceCommand).toHaveBeenCalledWith(
      { command: 'pnpm test', binary: 'pnpm', args: ['test'] },
      '/workspace/repo',
      expect.any(AbortSignal)
    )
  })

  it('rejects unauthenticated callers and non-validation commands', async () => {
    const { dispatcher, resolveCwd } = harness()
    const unauthorized = await dispatcher.dispatch(request())
    expect(unauthorized).toMatchObject({ ok: false })

    const invalid = await dispatchPaired(dispatcher, request('pnpm install'))
    expect(invalid).toMatchObject({ ok: false })
    expect(resolveCwd).not.toHaveBeenCalled()
    expect(runBarkosLocalTestEvidenceCommand).not.toHaveBeenCalled()
  })

  it('honors request cancellation before spawning', async () => {
    const { dispatcher } = harness()
    const controller = new AbortController()
    controller.abort()

    const response = await dispatchPaired(dispatcher, request(), controller.signal)
    expect(response).toMatchObject({ ok: false })
    expect(runBarkosLocalTestEvidenceCommand).not.toHaveBeenCalled()
  })
})
