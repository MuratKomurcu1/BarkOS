import type { BarkosCompany } from '../../shared/barkos/company'
import type {
  BarkosUsageCostCandidate,
  BarkosUsageCostLedger,
  BarkosUsageCostRecord,
  BarkosUsageCostUnavailableReason
} from '../../shared/barkos/usage-cost-ledger'
import { replaceBarkosUsageCostRecords } from '../../shared/barkos/usage-cost-ledger'
import type { BarkosDispatch, BarkosWorkLedger } from '../../shared/barkos/work-ledger'
import type { ClaudeUsageStore } from '../claude-usage/store'
import type { ClaudeUsageSession } from '../claude-usage/types'
import type { CodexUsageStore } from '../codex-usage/store'
import type { CodexUsageSession } from '../codex-usage/types'
import {
  createClaudeUsageCostRecord,
  createCodexUsageCostRecord,
  usageSessionMismatchReason
} from './usage-cost-provider-records'

type SupportedProvider = 'claude' | 'codex'
type ProviderReadiness =
  | { ready: true }
  | { ready: false; reason: BarkosUsageCostUnavailableReason; detail: string | null }

const TERMINAL_DISPATCH_STATES = new Set<BarkosDispatch['state']>([
  'succeeded',
  'failed',
  'circuit-broken',
  'cancelled'
])

function boundedDetail(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.slice(0, 500) : null
}

function providerForDispatch(
  company: BarkosCompany,
  dispatch: BarkosDispatch
): SupportedProvider | null {
  const agentId = company.workers.find((worker) => worker.id === dispatch.workerId)?.agentId
  return agentId === 'claude' || agentId === 'codex' ? agentId : null
}

export function createUnavailableBarkosUsageCostRecord(args: {
  dispatch: BarkosDispatch
  provider: SupportedProvider | null
  providerSessionId?: string | null
  reason: BarkosUsageCostUnavailableReason
  detail?: string | null
  now: number
}): BarkosUsageCostRecord {
  return {
    dispatchId: args.dispatch.id,
    taskId: args.dispatch.taskId,
    workerId: args.dispatch.workerId,
    provider: args.provider,
    status: 'unavailable',
    providerSessionId: args.providerSessionId ?? null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    reasoningOutputTokens: null,
    totalTokens: null,
    estimatedCostMicrousd: null,
    estimatedCostSource: null,
    attribution: null,
    unavailableReason: args.reason,
    detail: boundedDetail(args.detail),
    periodStartedAt: null,
    periodEndedAt: null,
    collectedAt: args.now
  }
}

async function providerReadiness(
  provider: SupportedProvider,
  latestFinishedAt: number,
  stores: { claude: ClaudeUsageStore; codex: CodexUsageStore }
): Promise<ProviderReadiness> {
  const store = stores[provider]
  const current = store.getScanState()
  if (!current.enabled) {
    return { ready: false, reason: 'usage-not-enabled', detail: null }
  }
  const refreshed = await store.refresh(
    current.lastScanCompletedAt === null || current.lastScanCompletedAt < latestFinishedAt
  )
  return refreshed.lastScanError
    ? { ready: false, reason: 'scan-failed', detail: refreshed.lastScanError }
    : { ready: true }
}

export async function collectBarkosUsageCosts(args: {
  company: BarkosCompany
  workLedger: BarkosWorkLedger
  costLedger: BarkosUsageCostLedger
  candidates: BarkosUsageCostCandidate[]
  claudeUsage: ClaudeUsageStore
  codexUsage: CodexUsageStore
  remoteRecords?: ReadonlyMap<string, BarkosUsageCostRecord>
  now?: number
}): Promise<BarkosUsageCostLedger> {
  const now = args.now ?? Date.now()
  const terminalDispatches = args.workLedger.dispatches.filter(
    (dispatch) => TERMINAL_DISPATCH_STATES.has(dispatch.state) && dispatch.finishedAt !== null
  )
  const candidates = new Map(args.candidates.map((candidate) => [candidate.dispatchId, candidate]))
  const existing = new Map(args.costLedger.records.map((record) => [record.dispatchId, record]))
  const sessionUseCounts = new Map<string, number>()
  for (const dispatch of terminalDispatches) {
    const provider = providerForDispatch(args.company, dispatch)
    const candidate = candidates.get(dispatch.id)
    const sessionId =
      candidate?.orchestrationDispatchId === dispatch.orchestrationDispatchId
        ? candidate.providerSessionId
        : (existing.get(dispatch.id)?.providerSessionId ?? null)
    if (dispatch.executionHostId === 'local' && provider && sessionId) {
      const key = `${provider}\0${sessionId}`
      sessionUseCounts.set(key, (sessionUseCounts.get(key) ?? 0) + 1)
    }
  }
  const localDispatches = terminalDispatches.filter(
    (dispatch) => dispatch.executionHostId === 'local'
  )
  const latestFinishedAt = Math.max(
    ...localDispatches.map((dispatch) => dispatch.finishedAt ?? 0),
    0
  )
  const readiness = new Map<SupportedProvider, ProviderReadiness>()
  for (const provider of ['claude', 'codex'] as const) {
    if (
      localDispatches.some((dispatch) => providerForDispatch(args.company, dispatch) === provider)
    ) {
      readiness.set(
        provider,
        await providerReadiness(provider, latestFinishedAt, {
          claude: args.claudeUsage,
          codex: args.codexUsage
        })
      )
    }
  }

  const records: BarkosUsageCostRecord[] = []
  for (const dispatch of terminalDispatches) {
    const provider = providerForDispatch(args.company, dispatch)
    if (!provider) {
      records.push(
        createUnavailableBarkosUsageCostRecord({
          dispatch,
          provider,
          reason: 'provider-unsupported',
          now
        })
      )
      continue
    }
    if (dispatch.executionHostId !== 'local') {
      records.push(
        args.remoteRecords?.get(dispatch.id) ??
          createUnavailableBarkosUsageCostRecord({
            dispatch,
            provider,
            reason: 'remote-usage-unavailable',
            now
          })
      )
      continue
    }
    const candidate = candidates.get(dispatch.id)
    const providerSessionId =
      candidate?.orchestrationDispatchId === dispatch.orchestrationDispatchId
        ? candidate.providerSessionId
        : (existing.get(dispatch.id)?.providerSessionId ?? null)
    if (!providerSessionId) {
      records.push(
        createUnavailableBarkosUsageCostRecord({
          dispatch,
          provider,
          reason: 'provider-session-missing',
          now
        })
      )
      continue
    }
    if ((sessionUseCounts.get(`${provider}\0${providerSessionId}`) ?? 0) > 1) {
      records.push(
        createUnavailableBarkosUsageCostRecord({
          dispatch,
          provider,
          providerSessionId,
          reason: 'shared-provider-session',
          now
        })
      )
      continue
    }
    if (!candidate && existing.has(dispatch.id)) {
      records.push(existing.get(dispatch.id)!)
      continue
    }
    const ready = readiness.get(provider)
    if (!ready?.ready) {
      records.push(
        createUnavailableBarkosUsageCostRecord({
          dispatch,
          provider,
          providerSessionId,
          reason: ready?.reason ?? 'scan-failed',
          detail: ready?.detail,
          now
        })
      )
      continue
    }
    const session =
      provider === 'claude'
        ? args.claudeUsage.findSessionForAttribution(providerSessionId)
        : args.codexUsage.findSessionForAttribution(providerSessionId)
    if (!session) {
      records.push(
        createUnavailableBarkosUsageCostRecord({
          dispatch,
          provider,
          providerSessionId,
          reason: 'session-not-found',
          now
        })
      )
      continue
    }
    const known =
      provider === 'claude'
        ? createClaudeUsageCostRecord({
            dispatch,
            session: session as ClaudeUsageSession,
            now
          })
        : createCodexUsageCostRecord({ dispatch, session: session as CodexUsageSession, now })
    if (!known) {
      records.push(
        createUnavailableBarkosUsageCostRecord({
          dispatch,
          provider,
          providerSessionId,
          reason: usageSessionMismatchReason(session, dispatch),
          now
        })
      )
      continue
    }
    records.push(known)
  }
  return replaceBarkosUsageCostRecords({ ledger: args.costLedger, records, now })
}
