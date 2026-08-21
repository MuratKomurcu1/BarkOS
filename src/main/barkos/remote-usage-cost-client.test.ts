import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BarkosCompany } from '../../shared/barkos/company'
import { toRuntimeExecutionHostId, toSshExecutionHostId } from '../../shared/execution-host'
import type { BarkosDispatch, BarkosWorkLedger } from '../../shared/barkos/work-ledger'

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  call: vi.fn()
}))

vi.mock('../ipc/runtime-environment-transport-routing', () => ({
  getRuntimeEnvironmentStatus: mocks.getStatus,
  callRuntimeEnvironment: mocks.call
}))

import { collectBarkosPairedRemoteUsageCosts } from './remote-usage-cost-client'

const company = {
  id: 'barkos-labs',
  createdAt: 1,
  workers: [{ id: 'worker-one', agentId: 'codex' }]
} as BarkosCompany

function dispatch(overrides: Partial<BarkosDispatch> = {}): BarkosDispatch {
  return {
    id: 'dispatch-one',
    assignmentId: 'assignment-one',
    taskId: 'task-one',
    workerId: 'worker-one',
    attempt: 1,
    state: 'succeeded',
    workspaceId: 'workspace-one',
    executionHostId: toRuntimeExecutionHostId('paired-one'),
    orchestrationRunId: 'run-one',
    orchestrationTaskId: 'runtime-task-one',
    orchestrationDispatchId: 'runtime-dispatch-one',
    memoryDelivery: null,
    stop: null,
    error: null,
    createdAt: 900,
    startedAt: 1_000,
    finishedAt: 2_000,
    ...overrides
  }
}

function workLedger(dispatches: BarkosDispatch[]): BarkosWorkLedger {
  return {
    schemaVersion: 5,
    companyId: company.id,
    objectives: [],
    plans: [],
    assignments: [],
    dispatches,
    evidence: [],
    approvalGates: [],
    revision: 0,
    createdAt: 1,
    updatedAt: 2_000
  }
}

function candidate(orchestrationDispatchId: string | null = 'runtime-dispatch-one') {
  return {
    dispatchId: 'dispatch-one',
    orchestrationDispatchId,
    providerSessionId: 'renderer-session-is-not-sent'
  }
}

function knownRemoteRecord(overrides: Record<string, unknown> = {}) {
  return {
    status: 'known',
    orchestrationDispatchId: 'runtime-dispatch-one',
    workspaceId: 'workspace-one',
    provider: 'codex',
    providerSessionId: 'host-session-one',
    model: 'gpt-5.6-terra',
    inputTokens: 1_000,
    outputTokens: 200,
    cacheReadTokens: 500,
    cacheWriteTokens: null,
    reasoningOutputTokens: 50,
    totalTokens: 1_250,
    estimatedCostMicrousd: 400,
    estimatedCostSource: 'api-equivalent',
    attribution: 'exclusive-provider-session',
    periodStartedAt: 1_100,
    periodEndedAt: 1_900,
    collectedAt: 2_100,
    ...overrides
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getStatus.mockResolvedValue({
    ok: true,
    result: { runtimeId: 'runtime-one', capabilities: ['barkos.remote-usage-cost.v1'] },
    _meta: { runtimeId: 'runtime-one' }
  })
  mocks.call.mockResolvedValue({
    ok: true,
    result: { version: 1, runtimeId: 'runtime-one', records: [knownRemoteRecord()] },
    _meta: { runtimeId: 'runtime-one' }
  })
})

describe('BarkOS paired remote usage-cost client', () => {
  it('maps capability-negotiated host aggregate evidence to the local Dispatch', async () => {
    const records = await collectBarkosPairedRemoteUsageCosts({
      userDataPath: '/user-data',
      company,
      workLedger: workLedger([dispatch()]),
      candidates: [candidate()],
      now: 3_000
    })

    expect(records.get('dispatch-one')).toMatchObject({
      status: 'known',
      providerSessionId: 'host-session-one',
      totalTokens: 1_250,
      collectedAt: 3_000
    })
    expect(mocks.call).toHaveBeenCalledWith(
      '/user-data',
      'paired-one',
      'barkos.usageCost.collect',
      { version: 1, orchestrationDispatchIds: ['runtime-dispatch-one'] },
      30_000
    )
    expect(JSON.stringify(mocks.call.mock.calls[0]?.[3])).not.toContain('renderer-session')
  })

  it('does not call old hosts or request unmatched and direct-SSH dispatches', async () => {
    mocks.getStatus.mockResolvedValueOnce({
      ok: true,
      result: { runtimeId: 'runtime-one', capabilities: [] },
      _meta: { runtimeId: 'runtime-one' }
    })
    await expect(
      collectBarkosPairedRemoteUsageCosts({
        userDataPath: '/user-data',
        company,
        workLedger: workLedger([dispatch()]),
        candidates: [candidate()],
        now: 3_000
      })
    ).resolves.toEqual(new Map())
    expect(mocks.call).not.toHaveBeenCalled()

    mocks.getStatus.mockClear()
    await collectBarkosPairedRemoteUsageCosts({
      userDataPath: '/user-data',
      company,
      workLedger: workLedger([
        dispatch(),
        dispatch({ id: 'dispatch-ssh', executionHostId: toSshExecutionHostId('server-one') })
      ]),
      candidates: [candidate(null)],
      now: 3_000
    })
    expect(mocks.getStatus).not.toHaveBeenCalled()
  })

  it('fails closed on runtime or evidence mismatches and maps host refusals without details', async () => {
    mocks.call.mockResolvedValueOnce({
      ok: true,
      result: {
        version: 1,
        runtimeId: 'runtime-one',
        records: [knownRemoteRecord({ workspaceId: 'different-workspace' })]
      },
      _meta: { runtimeId: 'runtime-one' }
    })
    const mismatched = await collectBarkosPairedRemoteUsageCosts({
      userDataPath: '/user-data',
      company,
      workLedger: workLedger([dispatch()]),
      candidates: [candidate()],
      now: 3_000
    })
    expect(mismatched).toEqual(new Map())

    mocks.call.mockResolvedValueOnce({
      ok: true,
      result: {
        version: 1,
        runtimeId: 'runtime-one',
        records: [
          {
            status: 'unavailable',
            orchestrationDispatchId: 'runtime-dispatch-one',
            reason: 'execution-owner-mismatch',
            detail: '/private/host/path',
            collectedAt: 2_100
          }
        ]
      },
      _meta: { runtimeId: 'runtime-one' }
    })
    const unavailable = await collectBarkosPairedRemoteUsageCosts({
      userDataPath: '/user-data',
      company,
      workLedger: workLedger([dispatch()]),
      candidates: [candidate()],
      now: 3_000
    })
    expect(unavailable.get('dispatch-one')).toMatchObject({
      status: 'unavailable',
      unavailableReason: 'remote-usage-unavailable',
      detail: 'Remote host: execution-owner-mismatch'
    })
  })
})
