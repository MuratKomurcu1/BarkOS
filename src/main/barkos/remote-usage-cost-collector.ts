import type {
  BarkosRemoteUsageCostRecord,
  BarkosRemoteUsageCostRequest,
  BarkosRemoteUsageCostResponse,
  BarkosRemoteUsageCostUnavailableReason
} from '../../shared/barkos/remote-usage-cost'
import { BARKOS_REMOTE_USAGE_COST_VERSION } from '../../shared/barkos/remote-usage-cost'
import type { ClaudeUsageStore } from '../claude-usage/store'
import type { ClaudeUsageSession } from '../claude-usage/types'
import type { CodexUsageStore } from '../codex-usage/store'
import type { CodexUsageSession } from '../codex-usage/types'
import {
  createClaudeUsageCostRecord,
  createCodexUsageCostRecord,
  usageSessionMismatchReason,
  type BarkosUsageCostAttributionDispatch
} from './usage-cost-provider-records'

type SupportedProvider = 'claude' | 'codex'

export type BarkosRemoteUsageDispatchIdentity =
  | Readonly<{
      status: 'verified'
      orchestrationDispatchId: string
      workspaceId: string
      provider: SupportedProvider
      providerSessionId: string
      startedAt: number
      finishedAt: number
    }>
  | Readonly<{
      status: 'unavailable'
      orchestrationDispatchId: string
      reason: BarkosRemoteUsageCostUnavailableReason
      detail?: string | null
    }>

type UsageStores = Readonly<{
  claudeUsage: ClaudeUsageStore
  codexUsage: CodexUsageStore
}>

function boundedDetail(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, 500) : null
}

function unavailable(
  identity: Pick<BarkosRemoteUsageDispatchIdentity, 'orchestrationDispatchId'>,
  reason: BarkosRemoteUsageCostUnavailableReason,
  now: number,
  detail?: string | null
): BarkosRemoteUsageCostRecord {
  return {
    status: 'unavailable',
    orchestrationDispatchId: identity.orchestrationDispatchId,
    reason,
    detail: boundedDetail(detail),
    collectedAt: now
  }
}

async function providerReady(
  provider: SupportedProvider,
  latestFinishedAt: number,
  stores: UsageStores
): Promise<
  | { ready: true }
  | { ready: false; detail: string | null; reason: 'scan-failed' | 'usage-not-enabled' }
> {
  try {
    const store = provider === 'claude' ? stores.claudeUsage : stores.codexUsage
    const current = store.getScanState()
    if (!current.enabled) {
      return { ready: false, reason: 'usage-not-enabled', detail: null }
    }
    const refreshed = await store.refresh(
      current.lastScanCompletedAt === null || current.lastScanCompletedAt < latestFinishedAt
    )
    return refreshed.lastScanError
      ? { ready: false, reason: 'scan-failed', detail: null }
      : { ready: true }
  } catch {
    return { ready: false, reason: 'scan-failed', detail: null }
  }
}

function attributionDispatch(
  identity: Extract<BarkosRemoteUsageDispatchIdentity, { status: 'verified' }>
): BarkosUsageCostAttributionDispatch {
  return {
    id: identity.orchestrationDispatchId,
    taskId: identity.orchestrationDispatchId,
    workerId: identity.provider,
    workspaceId: identity.workspaceId,
    startedAt: identity.startedAt,
    finishedAt: identity.finishedAt
  }
}

function knownRemoteRecord(
  identity: Extract<BarkosRemoteUsageDispatchIdentity, { status: 'verified' }>,
  record: NonNullable<ReturnType<typeof createClaudeUsageCostRecord>>
): BarkosRemoteUsageCostRecord {
  return {
    status: 'known',
    orchestrationDispatchId: identity.orchestrationDispatchId,
    workspaceId: identity.workspaceId,
    provider: identity.provider,
    providerSessionId: record.providerSessionId!,
    model: record.model,
    inputTokens: record.inputTokens!,
    outputTokens: record.outputTokens!,
    cacheReadTokens: record.cacheReadTokens,
    cacheWriteTokens: record.cacheWriteTokens,
    reasoningOutputTokens: record.reasoningOutputTokens,
    totalTokens: record.totalTokens!,
    estimatedCostMicrousd: record.estimatedCostMicrousd,
    estimatedCostSource: record.estimatedCostSource,
    attribution: 'exclusive-provider-session',
    periodStartedAt: record.periodStartedAt!,
    periodEndedAt: record.periodEndedAt!,
    collectedAt: record.collectedAt
  }
}

export async function collectBarkosRemoteUsageCosts(args: {
  request: BarkosRemoteUsageCostRequest
  runtimeId: string
  stores: UsageStores | null
  resolveDispatch: (orchestrationDispatchId: string) => BarkosRemoteUsageDispatchIdentity
  now?: number
}): Promise<BarkosRemoteUsageCostResponse> {
  const now = args.now ?? Date.now()
  const identities = args.request.orchestrationDispatchIds.map(args.resolveDispatch)
  const verified = identities.filter(
    (identity): identity is Extract<BarkosRemoteUsageDispatchIdentity, { status: 'verified' }> =>
      identity.status === 'verified'
  )
  const sessionCounts = new Map<string, number>()
  for (const identity of verified) {
    const key = `${identity.provider}\0${identity.providerSessionId}`
    sessionCounts.set(key, (sessionCounts.get(key) ?? 0) + 1)
  }
  const readiness = new Map<SupportedProvider, Awaited<ReturnType<typeof providerReady>>>()
  if (args.stores) {
    for (const provider of ['claude', 'codex'] as const) {
      const matching = verified.filter((identity) => identity.provider === provider)
      if (matching.length > 0) {
        readiness.set(
          provider,
          await providerReady(
            provider,
            Math.max(...matching.map((identity) => identity.finishedAt)),
            args.stores
          )
        )
      }
    }
  }

  const records: BarkosRemoteUsageCostRecord[] = []
  for (const identity of identities) {
    if (identity.status === 'unavailable') {
      records.push(unavailable(identity, identity.reason, now, identity.detail))
      continue
    }
    if (!args.stores) {
      records.push(unavailable(identity, 'usage-not-enabled', now))
      continue
    }
    if ((sessionCounts.get(`${identity.provider}\0${identity.providerSessionId}`) ?? 0) > 1) {
      records.push(unavailable(identity, 'shared-provider-session', now))
      continue
    }
    const ready = readiness.get(identity.provider)
    if (!ready?.ready) {
      records.push(unavailable(identity, ready?.reason ?? 'scan-failed', now, ready?.detail))
      continue
    }
    const session =
      identity.provider === 'claude'
        ? args.stores.claudeUsage.findSessionForAttribution(identity.providerSessionId)
        : args.stores.codexUsage.findSessionForAttribution(identity.providerSessionId)
    if (!session) {
      records.push(unavailable(identity, 'session-not-found', now))
      continue
    }
    const dispatch = attributionDispatch(identity)
    const known =
      identity.provider === 'claude'
        ? createClaudeUsageCostRecord({
            dispatch,
            session: session as ClaudeUsageSession,
            now
          })
        : createCodexUsageCostRecord({
            dispatch,
            session: session as CodexUsageSession,
            now
          })
    if (!known) {
      records.push(unavailable(identity, usageSessionMismatchReason(session, dispatch), now))
      continue
    }
    records.push(knownRemoteRecord(identity, known))
  }
  return { version: BARKOS_REMOTE_USAGE_COST_VERSION, runtimeId: args.runtimeId, records }
}
