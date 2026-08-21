import type { BarkosCompany } from './company'
import { classifyBarkosProviderAccountMutation } from './provider-account-mutation'
import {
  barkosProviderAccountKey,
  barkosProviderRuntimeLanesEqual,
  type BarkosProviderAccountRef,
  type BarkosProviderCapacityLedger,
  type BarkosProviderFailoverAudit
} from './provider-capacity'
import {
  parseBarkosProviderCapacityLedgerForCompany,
  upsertBarkosProviderFailoverAudit
} from './provider-capacity-ledger'
import {
  appendBarkosProviderFailoverSelection,
  settleBarkosProviderFailoverAttempt
} from './provider-failover-policy'

export type BarkosCodexAccountMutationExecution =
  | {
      status: 'applied'
      ledger: BarkosProviderCapacityLedger
      audit: BarkosProviderFailoverAudit
    }
  | {
      status: 'not-applied' | 'uncertain'
      ledger: BarkosProviderCapacityLedger
      audit: BarkosProviderFailoverAudit
    }

export async function executeBarkosCodexLocalAccountMutation(args: {
  company: BarkosCompany
  ledger: BarkosProviderCapacityLedger
  audit: BarkosProviderFailoverAudit
  account: BarkosProviderAccountRef
  sourceOrchestrationDispatchId?: string
  persist: (ledger: BarkosProviderCapacityLedger) => Promise<BarkosProviderCapacityLedger>
  mutate: (accountId: string | null) => Promise<string | null>
  readback: () => Promise<string | null>
  now?: () => number
}): Promise<BarkosCodexAccountMutationExecution> {
  const current = parseBarkosProviderCapacityLedgerForCompany(args.ledger, args.company)
  requireEligibleCodexLocalAccount(current, args.account)
  requireCurrentAudit(current, args.audit)
  const now = args.now ?? Date.now
  const selected = appendBarkosProviderFailoverSelection({
    audit: args.audit,
    account: args.account,
    conversationMode: 'unknown',
    ...(args.sourceOrchestrationDispatchId
      ? { sourceOrchestrationDispatchId: args.sourceOrchestrationDispatchId }
      : {}),
    now: now()
  })
  let durableLedger = parseBarkosProviderCapacityLedgerForCompany(
    await args.persist(
      upsertBarkosProviderFailoverAudit({
        ledger: current,
        company: args.company,
        audit: selected,
        now: now()
      })
    ),
    args.company
  )
  let durableAudit = requirePersistedAudit(durableLedger, selected.id)

  let mutation: 'returned' | 'threw' = 'returned'
  let responseActiveAccountId: string | null | undefined
  try {
    responseActiveAccountId = await args.mutate(args.account.accountId)
  } catch {
    mutation = 'threw'
  }

  let readbackActiveAccountId: string | null | undefined
  let readbackSucceeded = false
  try {
    readbackActiveAccountId = await args.readback()
    readbackSucceeded = true
  } catch {
    readbackSucceeded = false
  }
  const outcome = classifyBarkosProviderAccountMutation({
    requestedAccountId: args.account.accountId,
    mutation,
    requireAuthoritativeReadback: true,
    ...(mutation === 'returned' ? { responseActiveAccountId } : {}),
    ...(readbackSucceeded ? { readbackActiveAccountId } : {})
  })
  if (outcome.status === 'applied') {
    return { status: 'applied', ledger: durableLedger, audit: durableAudit }
  }

  durableAudit = settleBarkosProviderFailoverAttempt({
    audit: durableAudit,
    outcome: outcome.status === 'uncertain' ? 'uncertain' : 'failed',
    reason: outcome.status === 'uncertain' ? 'ambiguous-side-effect' : 'execution-failed',
    now: now()
  })
  durableLedger = parseBarkosProviderCapacityLedgerForCompany(
    await args.persist(
      upsertBarkosProviderFailoverAudit({
        ledger: durableLedger,
        company: args.company,
        audit: durableAudit,
        now: now()
      })
    ),
    args.company
  )
  return {
    status: outcome.status,
    ledger: durableLedger,
    audit: requirePersistedAudit(durableLedger, durableAudit.id)
  }
}

function requireEligibleCodexLocalAccount(
  ledger: BarkosProviderCapacityLedger,
  account: BarkosProviderAccountRef
): void {
  if (
    account.provider !== 'codex' ||
    account.executionHostId !== 'local' ||
    account.runtimeLane.kind !== 'host'
  ) {
    throw new Error('BarkOS account mutation supports only Codex on the local host lane')
  }
  const key = barkosProviderAccountKey(account)
  const observation = ledger.accounts.find(
    (entry) => barkosProviderAccountKey(entry.account) === key
  )
  if (
    !observation ||
    observation.status !== 'available' ||
    observation.active ||
    !barkosProviderRuntimeLanesEqual(observation.account.runtimeLane, account.runtimeLane)
  ) {
    throw new Error('BarkOS account mutation requires an eligible inactive capacity observation')
  }
}

function requireCurrentAudit(
  ledger: BarkosProviderCapacityLedger,
  audit: BarkosProviderFailoverAudit
): void {
  const persisted = ledger.failovers.find((entry) => entry.id === audit.id)
  if (!persisted && audit.attempts.length > 0) {
    throw new Error('BarkOS failover audit is not present in the current capacity ledger')
  }
  if (
    persisted &&
    (persisted.updatedAt !== audit.updatedAt || persisted.attempts.length !== audit.attempts.length)
  ) {
    throw new Error('BarkOS failover audit is stale')
  }
}

function requirePersistedAudit(
  ledger: BarkosProviderCapacityLedger,
  auditId: string
): BarkosProviderFailoverAudit {
  const audit = ledger.failovers.find((entry) => entry.id === auditId)
  if (!audit) {
    throw new Error('Persisted BarkOS failover audit disappeared')
  }
  return audit
}
