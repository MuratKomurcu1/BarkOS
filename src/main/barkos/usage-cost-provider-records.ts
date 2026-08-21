import type {
  BarkosUsageCostRecord,
  BarkosUsageCostUnavailableReason
} from '../../shared/barkos/usage-cost-ledger'
import type { BarkosDispatch } from '../../shared/barkos/work-ledger'
import { estimateCostUsd as estimateClaudeCostUsd } from '../claude-usage/claude-model-pricing'
import type { ClaudeUsageSession } from '../claude-usage/types'
import { estimateCostUsd as estimateCodexCostUsd } from '../codex-usage/codex-usage-cost-estimate'
import type { CodexUsageSession } from '../codex-usage/types'

type UsageSession = ClaudeUsageSession | CodexUsageSession
export type BarkosUsageCostAttributionDispatch = Pick<
  BarkosDispatch,
  'id' | 'taskId' | 'workerId' | 'workspaceId' | 'startedAt' | 'finishedAt'
>

function sessionPeriod(session: UsageSession): { startedAt: number; endedAt: number } | null {
  const startedAt = new Date(session.firstTimestamp).getTime()
  const endedAt = new Date(session.lastTimestamp).getTime()
  return Number.isFinite(startedAt) && Number.isFinite(endedAt) ? { startedAt, endedAt } : null
}

function periodIsExclusiveToDispatch(
  period: { startedAt: number; endedAt: number },
  dispatch: BarkosUsageCostAttributionDispatch
): boolean {
  return Boolean(
    dispatch.startedAt !== null &&
    dispatch.finishedAt !== null &&
    period.startedAt >= dispatch.startedAt &&
    period.endedAt <= dispatch.finishedAt
  )
}

function estimatedMicrousd(costUsd: number | null): number | null {
  if (costUsd === null || !Number.isFinite(costUsd) || costUsd < 0) {
    return null
  }
  return Math.min(Math.round(costUsd * 1_000_000), Number.MAX_SAFE_INTEGER)
}

export function usageSessionMismatchReason(
  session: UsageSession,
  dispatch: BarkosUsageCostAttributionDispatch
): Extract<
  BarkosUsageCostUnavailableReason,
  'session-outside-dispatch-window' | 'workspace-mismatch'
> {
  const workspaceMatches =
    session.locationBreakdown.length > 0 &&
    session.locationBreakdown.every((entry) => entry.worktreeId === dispatch.workspaceId)
  return workspaceMatches && sessionPeriod(session)
    ? 'session-outside-dispatch-window'
    : 'workspace-mismatch'
}

export function createClaudeUsageCostRecord(args: {
  dispatch: BarkosUsageCostAttributionDispatch
  session: ClaudeUsageSession
  now: number
}): BarkosUsageCostRecord | null {
  const period = sessionPeriod(args.session)
  if (!period || !periodIsExclusiveToDispatch(period, args.dispatch)) {
    return null
  }
  const locations = args.session.locationBreakdown.filter(
    (entry) => entry.worktreeId === args.dispatch.workspaceId
  )
  if (locations.length !== args.session.locationBreakdown.length || locations.length === 0) {
    return null
  }
  const totals = locations.reduce(
    (sum, entry) => ({
      input: sum.input + entry.inputTokens,
      output: sum.output + entry.outputTokens,
      cacheRead: sum.cacheRead + entry.cacheReadTokens,
      cacheWrite: sum.cacheWrite + entry.cacheWriteTokens
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  )
  const cost = estimatedMicrousd(
    estimateClaudeCostUsd(
      args.session.model,
      totals.input,
      totals.output,
      totals.cacheRead,
      totals.cacheWrite
    )
  )
  return {
    dispatchId: args.dispatch.id,
    taskId: args.dispatch.taskId,
    workerId: args.dispatch.workerId,
    provider: 'claude',
    status: 'known',
    providerSessionId: args.session.sessionId,
    model: args.session.model,
    inputTokens: totals.input,
    outputTokens: totals.output,
    cacheReadTokens: totals.cacheRead,
    cacheWriteTokens: totals.cacheWrite,
    reasoningOutputTokens: null,
    totalTokens: totals.input + totals.output + totals.cacheRead + totals.cacheWrite,
    estimatedCostMicrousd: cost,
    estimatedCostSource: cost === null ? null : 'api-equivalent',
    attribution: 'exclusive-provider-session',
    unavailableReason: null,
    detail: null,
    periodStartedAt: period.startedAt,
    periodEndedAt: period.endedAt,
    collectedAt: args.now
  }
}

export function createCodexUsageCostRecord(args: {
  dispatch: BarkosUsageCostAttributionDispatch
  session: CodexUsageSession
  now: number
}): BarkosUsageCostRecord | null {
  const period = sessionPeriod(args.session)
  if (!period || !periodIsExclusiveToDispatch(period, args.dispatch)) {
    return null
  }
  const locations = args.session.locationBreakdown.filter(
    (entry) => entry.worktreeId === args.dispatch.workspaceId
  )
  if (locations.length !== args.session.locationBreakdown.length || locations.length === 0) {
    return null
  }
  const totals = locations.reduce(
    (sum, entry) => ({
      input: sum.input + entry.inputTokens,
      cachedInput: sum.cachedInput + entry.cachedInputTokens,
      output: sum.output + entry.outputTokens,
      reasoning: sum.reasoning + entry.reasoningOutputTokens,
      total: sum.total + entry.totalTokens
    }),
    { input: 0, cachedInput: 0, output: 0, reasoning: 0, total: 0 }
  )
  const modelRows = args.session.locationModelBreakdown.filter(
    (entry) => entry.worktreeId === args.dispatch.workspaceId
  )
  const costs = modelRows.map((entry) =>
    estimateCodexCostUsd(
      entry.modelKey,
      entry.inputTokens,
      entry.cachedInputTokens,
      entry.outputTokens
    )
  )
  const cost =
    costs.length > 0 && costs.every((value): value is number => value !== null)
      ? estimatedMicrousd(costs.reduce((sum, value) => sum + value, 0))
      : null
  const modelLabels = [...new Set(modelRows.map((entry) => entry.modelLabel))]
  return {
    dispatchId: args.dispatch.id,
    taskId: args.dispatch.taskId,
    workerId: args.dispatch.workerId,
    provider: 'codex',
    status: 'known',
    providerSessionId: args.session.sessionId,
    model: modelLabels.length === 1 ? modelLabels[0] : args.session.primaryModel,
    inputTokens: totals.input,
    outputTokens: totals.output,
    cacheReadTokens: totals.cachedInput,
    cacheWriteTokens: null,
    reasoningOutputTokens: totals.reasoning,
    totalTokens: totals.total,
    estimatedCostMicrousd: cost,
    estimatedCostSource: cost === null ? null : 'api-equivalent',
    attribution: 'exclusive-provider-session',
    unavailableReason: null,
    detail: null,
    periodStartedAt: period.startedAt,
    periodEndedAt: period.endedAt,
    collectedAt: args.now
  }
}
