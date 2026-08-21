import { getSettingsFocusedExecutionHostId } from '../../../shared/execution-host'
import type { BarkosCompany } from '../../../shared/barkos/company'
import type { BarkosProviderCapacityLedger } from '../../../shared/barkos/provider-capacity'
import { buildBarkosProviderCapacityObservations } from '../../../shared/barkos/provider-capacity-account-snapshot'
import { replaceBarkosProviderCapacityObservations } from '../../../shared/barkos/provider-capacity-ledger'
import type { RateLimitState } from '../../../shared/rate-limit-types'
import { fetchProviderAccountsSnapshot } from '@/runtime/runtime-provider-accounts-client'
import { useAppStore } from '@/store'

function emptyRateLimits(): RateLimitState {
  return {
    claude: null,
    codex: null,
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

export async function persistCurrentBarkosProviderCapacitySnapshot(
  company: BarkosCompany
): Promise<BarkosProviderCapacityLedger> {
  const initialState = useAppStore.getState()
  const settings = initialState.settings
  const executionHostId = getSettingsFocusedExecutionHostId(settings)
  const snapshot = await fetchProviderAccountsSnapshot(settings)
  const latestState = useAppStore.getState()
  const ledger = latestState.barkosProviderCapacity
  const latestCompany = latestState.barkosCompany
  if (
    !ledger ||
    !latestCompany ||
    latestCompany.id !== company.id ||
    latestCompany.createdAt !== company.createdAt
  ) {
    throw new Error('BarkOS provider capacity changed while the snapshot was being read')
  }
  const rateLimits =
    snapshot.rateLimits ??
    (executionHostId === 'local' ? latestState.rateLimits : emptyRateLimits())
  const accounts = buildBarkosProviderCapacityObservations({
    claude: snapshot.claude,
    codex: snapshot.codex,
    rateLimits,
    executionHostId,
    failedProviders: snapshot.failedProviders
  })
  return latestState.saveBarkosProviderCapacity(
    replaceBarkosProviderCapacityObservations({
      ledger,
      company: latestCompany,
      accounts
    })
  )
}
