import type { ExecutionHostId } from '../execution-host'
import type {
  ClaudeManagedAccountSummary,
  ClaudeRateLimitAccountsState,
  CodexManagedAccountSummary,
  CodexRateLimitAccountsState
} from '../managed-account-types'
import type {
  InactiveAccountUsage,
  ProviderRateLimits,
  RateLimitRuntimeTarget,
  RateLimitState
} from '../rate-limit-types'
import {
  barkosProviderAccountKey,
  type BarkosProvider,
  type BarkosProviderCapacityObservation,
  type BarkosProviderRuntimeLane
} from './provider-capacity'
import { normalizeBarkosProviderCapacityObservation } from './provider-capacity-observation'

const PROVIDER_LIMIT_KEYS = [
  ['gemini', 'gemini'],
  ['opencode-go', 'opencodeGo'],
  ['kimi', 'kimi'],
  ['minimax', 'minimax'],
  ['grok', 'grok'],
  ['antigravity', 'antigravity']
] as const satisfies readonly [BarkosProvider, keyof RateLimitState][]

type ProviderAccountsInput = {
  claude: ClaudeRateLimitAccountsState
  codex: CodexRateLimitAccountsState
  rateLimits: RateLimitState
  executionHostId: ExecutionHostId
  failedProviders?: readonly ('claude' | 'codex')[]
  observedAt?: number
}

function runtimeLane(
  runtime: 'host' | 'wsl' | undefined,
  distro: string | null | undefined
): BarkosProviderRuntimeLane {
  return runtime === 'wsl'
    ? { kind: 'wsl', distro: distro?.trim() || '__default__' }
    : { kind: 'host' }
}

function targetLane(target: RateLimitRuntimeTarget): BarkosProviderRuntimeLane {
  return runtimeLane(target.runtime, target.wslDistro)
}

function lanesEqual(left: BarkosProviderRuntimeLane, right: BarkosProviderRuntimeLane): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === 'host' || (right.kind === 'wsl' && left.distro === right.distro))
  )
}

function activeIdForLane(
  state: ClaudeRateLimitAccountsState | CodexRateLimitAccountsState,
  lane: BarkosProviderRuntimeLane
): string | null {
  if (lane.kind === 'host') {
    return state.activeAccountIdsByRuntime?.host ?? state.activeAccountId ?? null
  }
  return state.activeAccountIdsByRuntime?.wsl?.[lane.distro] ?? null
}

function accountLane(
  account: ClaudeManagedAccountSummary | CodexManagedAccountSummary
): BarkosProviderRuntimeLane {
  if ('managedAuthRuntime' in account) {
    return runtimeLane(account.managedAuthRuntime, account.wslDistro)
  }
  return runtimeLane(
    'managedHomeRuntime' in account ? account.managedHomeRuntime : undefined,
    account.wslDistro
  )
}

function usageForAccount(
  accountId: string,
  active: boolean,
  lane: BarkosProviderRuntimeLane,
  target: RateLimitRuntimeTarget,
  current: ProviderRateLimits | null,
  inactive: readonly InactiveAccountUsage[]
): ProviderRateLimits | null {
  if (active && lanesEqual(lane, targetLane(target))) {
    return current
  }
  return inactive.find((entry) => entry.accountId === accountId)?.rateLimits ?? null
}

function providerObservations(args: {
  provider: 'claude' | 'codex'
  accounts: readonly (ClaudeManagedAccountSummary | CodexManagedAccountSummary)[]
  selection: ClaudeRateLimitAccountsState | CodexRateLimitAccountsState
  target: RateLimitRuntimeTarget
  current: ProviderRateLimits | null
  inactive: readonly InactiveAccountUsage[]
  executionHostId: ExecutionHostId
  observedAt: number
  authoritative: boolean
}): BarkosProviderCapacityObservation[] {
  const observations: BarkosProviderCapacityObservation[] = []
  const lanes = new Map<string, BarkosProviderRuntimeLane>()
  const addLane = (lane: BarkosProviderRuntimeLane): void => {
    lanes.set(lane.kind === 'host' ? 'host' : `wsl:${lane.distro}`, lane)
  }
  addLane({ kind: 'host' })
  addLane(targetLane(args.target))
  Object.keys(args.selection.activeAccountIdsByRuntime?.wsl ?? {}).forEach((distro) =>
    addLane({ kind: 'wsl', distro })
  )
  args.accounts.forEach((account) => addLane(accountLane(account)))

  for (const account of args.accounts) {
    const lane = accountLane(account)
    const active = activeIdForLane(args.selection, lane) === account.id
    observations.push(
      normalizeBarkosProviderCapacityObservation({
        account: {
          provider: args.provider,
          accountId: account.id,
          executionHostId: args.executionHostId,
          runtimeLane: lane
        },
        active,
        limits: args.authoritative
          ? usageForAccount(account.id, active, lane, args.target, args.current, args.inactive)
          : null,
        observedAt: args.observedAt
      })
    )
  }
  for (const lane of lanes.values()) {
    if (activeIdForLane(args.selection, lane) !== null) {
      continue
    }
    observations.push(
      normalizeBarkosProviderCapacityObservation({
        account: {
          provider: args.provider,
          accountId: null,
          executionHostId: args.executionHostId,
          runtimeLane: lane
        },
        active: true,
        limits:
          args.authoritative && lanesEqual(lane, targetLane(args.target)) ? args.current : null,
        observedAt: args.observedAt
      })
    )
  }
  return observations
}

export function buildBarkosProviderCapacityObservations(
  args: ProviderAccountsInput
): BarkosProviderCapacityObservation[] {
  const observedAt = args.observedAt ?? Date.now()
  const observations = [
    ...providerObservations({
      provider: 'claude',
      accounts: args.claude.accounts,
      selection: args.claude,
      target: args.rateLimits.claudeTarget,
      current: args.failedProviders?.includes('claude') ? null : args.rateLimits.claude,
      inactive: args.rateLimits.inactiveClaudeAccounts,
      executionHostId: args.executionHostId,
      observedAt,
      authoritative: !args.failedProviders?.includes('claude')
    }),
    ...providerObservations({
      provider: 'codex',
      accounts: args.codex.accounts,
      selection: args.codex,
      target: args.rateLimits.codexTarget,
      current: args.failedProviders?.includes('codex') ? null : args.rateLimits.codex,
      inactive: args.rateLimits.inactiveCodexAccounts,
      executionHostId: args.executionHostId,
      observedAt,
      authoritative: !args.failedProviders?.includes('codex')
    })
  ]
  for (const [provider, key] of PROVIDER_LIMIT_KEYS) {
    observations.push(
      normalizeBarkosProviderCapacityObservation({
        account: {
          provider,
          accountId: null,
          executionHostId: args.executionHostId,
          runtimeLane: { kind: 'host' }
        },
        active: true,
        limits: args.rateLimits[key],
        observedAt
      })
    )
  }
  return Array.from(
    new Map(
      observations.map((entry) => [barkosProviderAccountKey(entry.account), entry] as const)
    ).values()
  )
}
