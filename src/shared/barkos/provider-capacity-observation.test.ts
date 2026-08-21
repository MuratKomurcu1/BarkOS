import { describe, expect, it } from 'vitest'
import type { ProviderRateLimits, RateLimitState } from '../rate-limit-types'
import { normalizeBarkosProviderCapacityObservation } from './provider-capacity-observation'
import { buildBarkosProviderCapacityObservations } from './provider-capacity-account-snapshot'

const now = 1_800_000_000_000
const account = {
  provider: 'codex' as const,
  accountId: 'codex-a',
  executionHostId: 'local' as const,
  runtimeLane: { kind: 'host' as const }
}

function limits(overrides: Partial<ProviderRateLimits> = {}): ProviderRateLimits {
  return {
    provider: 'codex',
    session: {
      usedPercent: 25,
      windowMinutes: 300,
      resetsAt: now + 1_000,
      resetDescription: null
    },
    weekly: null,
    updatedAt: now,
    error: null,
    status: 'ok',
    ...overrides
  }
}

function rateLimitState(): RateLimitState {
  return {
    claude: null,
    codex: limits(),
    gemini: null,
    opencodeGo: null,
    kimi: null,
    antigravity: null,
    minimax: null,
    grok: null,
    minimaxCookieConfigured: false,
    grokAuthConfigured: false,
    claudeTarget: { runtime: 'host', wslDistro: null },
    codexTarget: { runtime: 'host', wslDistro: null },
    inactiveClaudeAccounts: [],
    inactiveCodexAccounts: []
  }
}

describe('BarkOS provider capacity observation', () => {
  it('normalizes fresh usage, exhaustion, retry-after, and stale data', () => {
    expect(
      normalizeBarkosProviderCapacityObservation({
        account,
        active: true,
        limits: limits(),
        observedAt: now
      })
    ).toMatchObject({ status: 'available', reason: 'within-limits', usedPercent: 25 })

    expect(
      normalizeBarkosProviderCapacityObservation({
        account,
        active: true,
        limits: limits({
          session: {
            usedPercent: 100,
            windowMinutes: 300,
            resetsAt: now + 5_000,
            resetDescription: null
          }
        }),
        observedAt: now
      })
    ).toMatchObject({ status: 'limited', reason: 'usage-exhausted', resetsAt: now + 5_000 })

    expect(
      normalizeBarkosProviderCapacityObservation({
        account,
        active: true,
        limits: limits({ usageMetadata: { retryAtMs: now + 10_000 } }),
        observedAt: now
      })
    ).toMatchObject({ status: 'cooldown', reason: 'provider-retry-after' })

    expect(
      normalizeBarkosProviderCapacityObservation({
        account,
        active: true,
        limits: limits({ updatedAt: now - 16 * 60_000 }),
        observedAt: now
      })
    ).toMatchObject({ status: 'unknown', reason: 'stale-snapshot' })
  })

  it('keeps host and WSL account lanes separate', () => {
    const state = rateLimitState()
    state.inactiveCodexAccounts = [
      {
        accountId: 'codex-wsl',
        rateLimits: limits({ session: null }),
        updatedAt: now,
        isFetching: false
      }
    ]
    const observations = buildBarkosProviderCapacityObservations({
      claude: {
        accounts: [],
        activeAccountId: null,
        activeAccountIdsByRuntime: { host: null, wsl: {} }
      },
      codex: {
        accounts: [
          {
            id: 'codex-host',
            email: 'host@example.test',
            managedHomeRuntime: 'host',
            createdAt: 1,
            updatedAt: 1,
            lastAuthenticatedAt: 1
          },
          {
            id: 'codex-wsl',
            email: 'wsl@example.test',
            managedHomeRuntime: 'wsl',
            wslDistro: 'Ubuntu',
            createdAt: 1,
            updatedAt: 1,
            lastAuthenticatedAt: 1
          }
        ],
        activeAccountId: 'codex-host',
        activeAccountIdsByRuntime: { host: 'codex-host', wsl: { Ubuntu: 'codex-wsl' } }
      },
      rateLimits: state,
      executionHostId: 'runtime:server-one',
      observedAt: now
    })

    expect(observations.find((entry) => entry.account.accountId === 'codex-host')).toMatchObject({
      account: { executionHostId: 'runtime:server-one', runtimeLane: { kind: 'host' } },
      active: true,
      status: 'available'
    })
    expect(observations.find((entry) => entry.account.accountId === 'codex-wsl')).toMatchObject({
      account: { runtimeLane: { kind: 'wsl', distro: 'Ubuntu' } },
      active: true,
      status: 'unknown'
    })
  })

  it('fails closed when a provider roster is only a partial fallback', () => {
    const state = rateLimitState()
    state.inactiveCodexAccounts = [
      {
        accountId: 'codex-inactive',
        rateLimits: limits(),
        updatedAt: now,
        isFetching: false
      }
    ]
    const observations = buildBarkosProviderCapacityObservations({
      claude: {
        accounts: [],
        activeAccountId: null,
        activeAccountIdsByRuntime: { host: null, wsl: {} }
      },
      codex: {
        accounts: [
          {
            id: 'codex-inactive',
            email: 'inactive@example.test',
            managedHomeRuntime: 'host',
            createdAt: 1,
            updatedAt: 1,
            lastAuthenticatedAt: 1
          }
        ],
        activeAccountId: null,
        activeAccountIdsByRuntime: { host: null, wsl: {} }
      },
      rateLimits: state,
      executionHostId: 'local',
      failedProviders: ['codex'],
      observedAt: now
    })

    expect(
      observations.find((entry) => entry.account.accountId === 'codex-inactive')
    ).toMatchObject({ status: 'unknown', reason: 'missing-snapshot' })
  })
})
