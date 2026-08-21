import { describe, expect, it, vi } from 'vitest'
import type { BarkosCompany } from '../../shared/barkos/company'
import { createEmptyBarkosUsageCostLedger } from '../../shared/barkos/usage-cost-ledger'
import type { BarkosDispatch, BarkosWorkLedger } from '../../shared/barkos/work-ledger'
import type { ClaudeUsageStore } from '../claude-usage/store'
import type { CodexUsageStore } from '../codex-usage/store'
import type { CodexUsageSession } from '../codex-usage/types'
import { collectBarkosUsageCosts } from './usage-cost-collector'

const company = {
  id: 'barkos-labs',
  createdAt: 1,
  workers: [{ id: 'worker-one', agentId: 'codex' }]
} as BarkosCompany

function dispatch(id = 'dispatch-one', overrides: Partial<BarkosDispatch> = {}): BarkosDispatch {
  return {
    id,
    assignmentId: `assignment-${id}`,
    taskId: `task-${id}`,
    workerId: 'worker-one',
    attempt: 1,
    state: 'succeeded',
    workspaceId: 'workspace-one',
    executionHostId: 'local',
    orchestrationRunId: 'run-one',
    orchestrationTaskId: `runtime-task-${id}`,
    orchestrationDispatchId: `runtime-${id}`,
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

function codexSession(overrides: Partial<CodexUsageSession> = {}): CodexUsageSession {
  return {
    sessionId: 'session-one',
    firstTimestamp: new Date(1_100).toISOString(),
    lastTimestamp: new Date(1_900).toISOString(),
    primaryModel: 'gpt-5.6-terra',
    hasMixedModels: false,
    primaryProjectLabel: 'BarkOS',
    hasMixedLocations: false,
    primaryWorktreeId: 'workspace-one',
    primaryRepoId: 'repo-one',
    eventCount: 1,
    totalInputTokens: 1_000,
    totalCachedInputTokens: 500,
    totalOutputTokens: 200,
    totalReasoningOutputTokens: 50,
    totalTokens: 1_250,
    hasInferredPricing: false,
    locationBreakdown: [
      {
        locationKey: 'workspace-one',
        projectLabel: 'BarkOS',
        repoId: 'repo-one',
        worktreeId: 'workspace-one',
        eventCount: 1,
        inputTokens: 1_000,
        cachedInputTokens: 500,
        outputTokens: 200,
        reasoningOutputTokens: 50,
        totalTokens: 1_250,
        hasInferredPricing: false
      }
    ],
    modelBreakdown: [],
    locationModelBreakdown: [
      {
        locationKey: 'workspace-one',
        modelKey: 'gpt-5.6-terra',
        modelLabel: 'gpt-5.6-terra',
        repoId: 'repo-one',
        worktreeId: 'workspace-one',
        eventCount: 1,
        inputTokens: 1_000,
        cachedInputTokens: 500,
        outputTokens: 200,
        reasoningOutputTokens: 50,
        totalTokens: 1_250,
        hasInferredPricing: false
      }
    ],
    ...overrides
  }
}

function stores(session: CodexUsageSession | null, enabled = true) {
  const codex = {
    getScanState: () => ({ enabled, lastScanCompletedAt: 2_000, lastScanError: null }),
    refresh: vi.fn(async () => ({ lastScanError: null })),
    findSessionForAttribution: vi.fn(() => session)
  } as unknown as CodexUsageStore
  const claude = {
    getScanState: () => ({ enabled: false, lastScanCompletedAt: null, lastScanError: null }),
    refresh: vi.fn(),
    findSessionForAttribution: vi.fn()
  } as unknown as ClaudeUsageStore
  return { claude, codex }
}

describe('BarkOS usage-cost collection', () => {
  it('attributes exact local provider tokens and labels money as an API-equivalent estimate', async () => {
    const runtime = stores(codexSession())
    const ledger = await collectBarkosUsageCosts({
      company,
      workLedger: workLedger([dispatch()]),
      costLedger: createEmptyBarkosUsageCostLedger(company.id, company.createdAt),
      candidates: [
        {
          dispatchId: 'dispatch-one',
          orchestrationDispatchId: 'runtime-dispatch-one',
          providerSessionId: 'session-one'
        }
      ],
      claudeUsage: runtime.claude,
      codexUsage: runtime.codex,
      now: 3_000
    })

    expect(ledger.records[0]).toMatchObject({
      status: 'known',
      totalTokens: 1_250,
      estimatedCostSource: 'api-equivalent',
      attribution: 'exclusive-provider-session'
    })
    expect(ledger.records[0].estimatedCostMicrousd).toBeGreaterThan(0)
  })

  it('refuses to split one provider session across multiple Dispatches', async () => {
    const runtime = stores(codexSession())
    const dispatches = [dispatch(), dispatch('dispatch-two')]
    const ledger = await collectBarkosUsageCosts({
      company,
      workLedger: workLedger(dispatches),
      costLedger: createEmptyBarkosUsageCostLedger(company.id, company.createdAt),
      candidates: dispatches.map((item) => ({
        dispatchId: item.id,
        orchestrationDispatchId: item.orchestrationDispatchId,
        providerSessionId: 'session-one'
      })),
      claudeUsage: runtime.claude,
      codexUsage: runtime.codex,
      now: 3_000
    })

    expect(ledger.records).toHaveLength(2)
    expect(
      ledger.records.every((record) => record.unavailableReason === 'shared-provider-session')
    ).toBe(true)
    expect(runtime.codex.findSessionForAttribution).not.toHaveBeenCalled()
  })

  it('fails closed when activity falls outside the Dispatch or tracking is disabled', async () => {
    const outsideRuntime = stores(codexSession({ firstTimestamp: new Date(500).toISOString() }))
    const outside = await collectBarkosUsageCosts({
      company,
      workLedger: workLedger([dispatch()]),
      costLedger: createEmptyBarkosUsageCostLedger(company.id, company.createdAt),
      candidates: [
        {
          dispatchId: 'dispatch-one',
          orchestrationDispatchId: 'runtime-dispatch-one',
          providerSessionId: 'session-one'
        }
      ],
      claudeUsage: outsideRuntime.claude,
      codexUsage: outsideRuntime.codex,
      now: 3_000
    })
    expect(outside.records[0].unavailableReason).toBe('session-outside-dispatch-window')

    const disabledRuntime = stores(codexSession(), false)
    const disabled = await collectBarkosUsageCosts({
      company,
      workLedger: workLedger([dispatch()]),
      costLedger: createEmptyBarkosUsageCostLedger(company.id, company.createdAt),
      candidates: [
        {
          dispatchId: 'dispatch-one',
          orchestrationDispatchId: 'runtime-dispatch-one',
          providerSessionId: 'session-one'
        }
      ],
      claudeUsage: disabledRuntime.claude,
      codexUsage: disabledRuntime.codex,
      now: 3_000
    })
    expect(disabled.records[0].unavailableReason).toBe('usage-not-enabled')
    expect(disabledRuntime.codex.refresh).not.toHaveBeenCalled()
  })

  it('rejects a provider session containing activity from another workspace', async () => {
    const mixedLocation = {
      ...codexSession().locationBreakdown[0],
      locationKey: 'workspace-two',
      worktreeId: 'workspace-two'
    }
    const runtime = stores(
      codexSession({
        hasMixedLocations: true,
        locationBreakdown: [...codexSession().locationBreakdown, mixedLocation]
      })
    )
    const ledger = await collectBarkosUsageCosts({
      company,
      workLedger: workLedger([dispatch()]),
      costLedger: createEmptyBarkosUsageCostLedger(company.id, company.createdAt),
      candidates: [
        {
          dispatchId: 'dispatch-one',
          orchestrationDispatchId: 'runtime-dispatch-one',
          providerSessionId: 'session-one'
        }
      ],
      claudeUsage: runtime.claude,
      codexUsage: runtime.codex,
      now: 3_000
    })

    expect(ledger.records[0].unavailableReason).toBe('workspace-mismatch')
    expect(ledger.records[0].totalTokens).toBeNull()
  })

  it('uses host-owned remote evidence without scanning desktop provider stores', async () => {
    const runtime = stores(codexSession())
    const remoteDispatch = dispatch('dispatch-remote', {
      executionHostId: 'runtime:paired-one'
    })
    const remoteRecord = {
      dispatchId: remoteDispatch.id,
      taskId: remoteDispatch.taskId,
      workerId: remoteDispatch.workerId,
      provider: 'codex' as const,
      status: 'known' as const,
      providerSessionId: 'host-session-one',
      model: 'gpt-5.6-terra',
      inputTokens: 10,
      outputTokens: 5,
      cacheReadTokens: 2,
      cacheWriteTokens: null,
      reasoningOutputTokens: 1,
      totalTokens: 18,
      estimatedCostMicrousd: 4,
      estimatedCostSource: 'api-equivalent' as const,
      attribution: 'exclusive-provider-session' as const,
      unavailableReason: null,
      detail: null,
      periodStartedAt: 1_100,
      periodEndedAt: 1_900,
      collectedAt: 3_000
    }
    const ledger = await collectBarkosUsageCosts({
      company,
      workLedger: workLedger([remoteDispatch]),
      costLedger: createEmptyBarkosUsageCostLedger(company.id, company.createdAt),
      candidates: [],
      claudeUsage: runtime.claude,
      codexUsage: runtime.codex,
      remoteRecords: new Map([[remoteDispatch.id, remoteRecord]]),
      now: 3_000
    })

    expect(ledger.records).toEqual([remoteRecord])
    expect(runtime.codex.refresh).not.toHaveBeenCalled()
    expect(runtime.codex.findSessionForAttribution).not.toHaveBeenCalled()
  })
})
