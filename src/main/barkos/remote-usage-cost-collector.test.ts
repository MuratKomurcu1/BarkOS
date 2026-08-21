import { describe, expect, it, vi } from 'vitest'
import type { ClaudeUsageStore } from '../claude-usage/store'
import type { CodexUsageStore } from '../codex-usage/store'
import type { CodexUsageSession } from '../codex-usage/types'
import {
  collectBarkosRemoteUsageCosts,
  type BarkosRemoteUsageDispatchIdentity
} from './remote-usage-cost-collector'

const verifiedIdentity: BarkosRemoteUsageDispatchIdentity = {
  status: 'verified',
  orchestrationDispatchId: 'dispatch-1',
  workspaceId: 'workspace-1',
  provider: 'codex',
  providerSessionId: 'session-1',
  startedAt: 1_000,
  finishedAt: 2_000
}

function codexSession(overrides: Partial<CodexUsageSession> = {}): CodexUsageSession {
  return {
    sessionId: 'session-1',
    firstTimestamp: new Date(1_100).toISOString(),
    lastTimestamp: new Date(1_900).toISOString(),
    primaryModel: 'gpt-5.6-terra',
    hasMixedModels: false,
    primaryProjectLabel: 'BarkOS',
    hasMixedLocations: false,
    primaryWorktreeId: 'workspace-1',
    primaryRepoId: 'repo-1',
    eventCount: 1,
    totalInputTokens: 1_000,
    totalCachedInputTokens: 500,
    totalOutputTokens: 200,
    totalReasoningOutputTokens: 50,
    totalTokens: 1_250,
    hasInferredPricing: false,
    locationBreakdown: [
      {
        locationKey: 'workspace-1',
        projectLabel: 'BarkOS',
        repoId: 'repo-1',
        worktreeId: 'workspace-1',
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
        locationKey: 'workspace-1',
        modelKey: 'gpt-5.6-terra',
        modelLabel: 'gpt-5.6-terra',
        repoId: 'repo-1',
        worktreeId: 'workspace-1',
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
  return { claudeUsage: claude, codexUsage: codex, codex }
}

function collect(args: {
  identities?: BarkosRemoteUsageDispatchIdentity[]
  session?: CodexUsageSession | null
  enabled?: boolean
}) {
  const identities = args.identities ?? [verifiedIdentity]
  const runtimeStores = stores(
    args.session === undefined ? codexSession() : args.session,
    args.enabled
  )
  return {
    result: collectBarkosRemoteUsageCosts({
      request: {
        version: 1,
        orchestrationDispatchIds: identities.map((identity) => identity.orchestrationDispatchId)
      },
      runtimeId: 'runtime-1',
      stores: runtimeStores,
      resolveDispatch: (dispatchId) =>
        identities.find((identity) => identity.orchestrationDispatchId === dispatchId)!,
      now: 3_000
    }),
    runtimeStores
  }
}

describe('BarkOS remote usage-cost host collection', () => {
  it('returns only aggregate evidence for an exact host-owned session', async () => {
    const { result, runtimeStores } = collect({})

    await expect(result).resolves.toEqual({
      version: 1,
      runtimeId: 'runtime-1',
      records: [
        expect.objectContaining({
          status: 'known',
          orchestrationDispatchId: 'dispatch-1',
          providerSessionId: 'session-1',
          totalTokens: 1_250,
          attribution: 'exclusive-provider-session'
        })
      ]
    })
    expect(runtimeStores.codex.refresh).toHaveBeenCalledWith(false)
    expect(JSON.stringify(await result)).not.toMatch(/path|transcript/i)
  })

  it('fails closed when host tracking is disabled or the session is absent', async () => {
    await expect(collect({ enabled: false }).result).resolves.toMatchObject({
      records: [{ status: 'unavailable', reason: 'usage-not-enabled' }]
    })
    await expect(collect({ session: null }).result).resolves.toMatchObject({
      records: [{ status: 'unavailable', reason: 'session-not-found' }]
    })
  })

  it('refuses to split one provider session across requested dispatches', async () => {
    const second = {
      ...verifiedIdentity,
      orchestrationDispatchId: 'dispatch-2'
    } satisfies BarkosRemoteUsageDispatchIdentity

    await expect(collect({ identities: [verifiedIdentity, second] }).result).resolves.toMatchObject(
      {
        records: [
          { status: 'unavailable', reason: 'shared-provider-session' },
          { status: 'unavailable', reason: 'shared-provider-session' }
        ]
      }
    )
  })

  it('rejects activity outside the dispatch window and forwards authority failures', async () => {
    await expect(
      collect({ session: codexSession({ firstTimestamp: new Date(500).toISOString() }) }).result
    ).resolves.toMatchObject({
      records: [{ status: 'unavailable', reason: 'session-outside-dispatch-window' }]
    })
    const rejected: BarkosRemoteUsageDispatchIdentity = {
      status: 'unavailable',
      orchestrationDispatchId: 'dispatch-1',
      reason: 'execution-owner-mismatch'
    }
    await expect(collect({ identities: [rejected] }).result).resolves.toMatchObject({
      records: [{ status: 'unavailable', reason: 'execution-owner-mismatch' }]
    })
  })
})
