import type { CodexRateLimitAccountsState } from '../../../shared/managed-account-types'
import type { BarkosCompany } from '../../../shared/barkos/company'
import type {
  BarkosProviderAccountRef,
  BarkosProviderCapacityLedger,
  BarkosProviderFailoverAudit
} from '../../../shared/barkos/provider-capacity'
import {
  executeBarkosCodexLocalAccountMutation,
  type BarkosCodexAccountMutationExecution
} from '../../../shared/barkos/provider-account-failover-executor'

export function activeHostCodexAccountId(state: CodexRateLimitAccountsState): string | null {
  return state.activeAccountIdsByRuntime
    ? state.activeAccountIdsByRuntime.host
    : state.activeAccountId
}

export function executeBarkosCodexAccountMutationOnDesktop(args: {
  company: BarkosCompany
  ledger: BarkosProviderCapacityLedger
  audit: BarkosProviderFailoverAudit
  account: BarkosProviderAccountRef
  sourceOrchestrationDispatchId: string
  persist: (ledger: BarkosProviderCapacityLedger) => Promise<BarkosProviderCapacityLedger>
}): Promise<BarkosCodexAccountMutationExecution> {
  return executeBarkosCodexLocalAccountMutation({
    ...args,
    mutate: async (accountId) =>
      activeHostCodexAccountId(
        await window.api.codexAccounts.select({
          accountId,
          runtime: 'host',
          wslDistro: null
        })
      ),
    readback: async () => activeHostCodexAccountId(await window.api.codexAccounts.list())
  })
}
