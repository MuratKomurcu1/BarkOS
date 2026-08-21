import type {
  ProviderRateLimits,
  RateLimitWindow,
  UsageRateLimitFailureKind
} from '../rate-limit-types'
import {
  barkosProviderCapacityObservationSchema,
  type BarkosProviderAccountRef,
  type BarkosProviderCapacityObservation
} from './provider-capacity'

export const BARKOS_CAPACITY_SNAPSHOT_FRESH_MS = 15 * 60_000

function rateLimitWindows(limits: ProviderRateLimits): RateLimitWindow[] {
  return [
    limits.session,
    limits.weekly,
    limits.fableWeekly ?? null,
    limits.monthly ?? null,
    ...(limits.buckets ?? [])
  ].filter((window): window is RateLimitWindow => window !== null)
}

function unavailableReason(
  failureKind: UsageRateLimitFailureKind | undefined
): BarkosProviderCapacityObservation['reason'] {
  switch (failureKind) {
    case 'missing-credentials':
    case 'refreshable-credentials-without-token':
    case 'delegated-refresh-required':
    case 'keychain-unavailable':
    case 'missing-scope':
      return 'missing-credentials'
    case 'stale-token':
      return 'stale-credentials'
    case 'usage-unavailable':
      return 'usage-unavailable'
    case 'cli-unavailable':
    case 'deferred-by-live-session':
    case 'network':
    case 'parse':
    case 'rate-limited':
    case 'server':
    case 'unknown':
    case undefined:
      return 'provider-error'
  }
}

function futureMinimum(values: readonly (number | null | undefined)[], now: number): number | null {
  const future = values.filter(
    (value): value is number => value !== null && value !== undefined && value > now
  )
  return future.length > 0 ? Math.min(...future) : null
}

export function normalizeBarkosProviderCapacityObservation(args: {
  account: BarkosProviderAccountRef
  active: boolean
  limits: ProviderRateLimits | null
  observedAt?: number
}): BarkosProviderCapacityObservation {
  const observedAt = args.observedAt ?? Date.now()
  const limits = args.limits
  if (!limits) {
    return observation(args.account, args.active, observedAt, {
      status: 'unknown',
      reason: 'missing-snapshot'
    })
  }
  const retryAt = limits.usageMetadata?.retryAtMs ?? null
  const base = { sourceUpdatedAt: limits.updatedAt, retryAt }
  if (limits.status === 'fetching' || limits.status === 'idle') {
    return observation(args.account, args.active, observedAt, {
      ...base,
      status: 'unknown',
      reason: 'refreshing'
    })
  }
  if (limits.updatedAt <= 0 || observedAt - limits.updatedAt > BARKOS_CAPACITY_SNAPSHOT_FRESH_MS) {
    return observation(args.account, args.active, observedAt, {
      ...base,
      status: 'unknown',
      reason: 'stale-snapshot'
    })
  }
  if (retryAt !== null && retryAt > observedAt) {
    return observation(args.account, args.active, observedAt, {
      ...base,
      status: 'cooldown',
      reason: 'provider-retry-after'
    })
  }
  if (limits.status === 'error' || limits.status === 'unavailable') {
    const failureKind = limits.usageMetadata?.failureKind
    const rateLimited = failureKind === 'rate-limited'
    return observation(args.account, args.active, observedAt, {
      ...base,
      status: rateLimited ? 'limited' : 'unavailable',
      reason: rateLimited ? 'provider-retry-after' : unavailableReason(failureKind)
    })
  }

  const windows = rateLimitWindows(limits)
  if (windows.length === 0) {
    return observation(args.account, args.active, observedAt, {
      ...base,
      status: 'unknown',
      reason: 'usage-unknown'
    })
  }
  const usedPercent = Math.max(...windows.map((window) => window.usedPercent))
  const exhausted = windows.filter((window) => window.usedPercent >= 100)
  const resetsAt = futureMinimum(
    (exhausted.length > 0 ? exhausted : windows).map((window) => window.resetsAt),
    observedAt
  )
  if (exhausted.length > 0) {
    const staleExhaustion = exhausted.every(
      (window) => window.resetsAt !== null && window.resetsAt <= observedAt
    )
    return observation(args.account, args.active, observedAt, {
      ...base,
      status: staleExhaustion ? 'unknown' : 'limited',
      reason: staleExhaustion ? 'stale-snapshot' : 'usage-exhausted',
      usedPercent,
      resetsAt
    })
  }
  return observation(args.account, args.active, observedAt, {
    ...base,
    status: 'available',
    reason: 'within-limits',
    usedPercent,
    resetsAt
  })
}

function observation(
  account: BarkosProviderAccountRef,
  active: boolean,
  observedAt: number,
  fields: Pick<BarkosProviderCapacityObservation, 'status' | 'reason'> &
    Partial<
      Pick<
        BarkosProviderCapacityObservation,
        'usedPercent' | 'resetsAt' | 'retryAt' | 'sourceUpdatedAt'
      >
    >
): BarkosProviderCapacityObservation {
  return barkosProviderCapacityObservationSchema.parse({
    account,
    active,
    status: fields.status,
    reason: fields.reason,
    usedPercent: fields.usedPercent ?? null,
    resetsAt: fields.resetsAt ?? null,
    retryAt: fields.retryAt ?? null,
    sourceUpdatedAt: fields.sourceUpdatedAt ?? null,
    observedAt
  })
}
