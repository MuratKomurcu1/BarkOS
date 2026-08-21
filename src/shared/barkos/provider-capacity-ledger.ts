import type { BarkosCompany } from './company'
import {
  BARKOS_MAX_FAILOVER_AUDITS,
  BARKOS_PROVIDER_CAPACITY_SCHEMA_VERSION,
  barkosProviderFailoverAuditSchema,
  barkosProviderCapacityLedgerSchema,
  type BarkosProviderCapacityLedger,
  type BarkosProviderCapacityObservation,
  type BarkosProviderFailoverAudit
} from './provider-capacity'
import { settleBarkosProviderFailoverAttempt } from './provider-failover-policy'

export function parseBarkosProviderCapacityLedger(value: unknown): BarkosProviderCapacityLedger {
  return barkosProviderCapacityLedgerSchema.parse(value)
}

export function parseBarkosProviderCapacityLedgerForCompany(
  value: unknown,
  company: BarkosCompany
): BarkosProviderCapacityLedger {
  const ledger = parseBarkosProviderCapacityLedger(value)
  if (ledger.companyId !== company.id || ledger.companyCreatedAt !== company.createdAt) {
    throw new Error('Provider capacity ledger does not match the active company generation')
  }
  const workerIds = new Set(company.workers.map((worker) => worker.id))
  if (ledger.failovers.some((audit) => !workerIds.has(audit.workerId))) {
    throw new Error('Provider capacity ledger references an unknown worker')
  }
  return ledger
}

export function createEmptyBarkosProviderCapacityLedger(
  companyId: string,
  companyCreatedAt: number,
  now = Date.now()
): BarkosProviderCapacityLedger {
  return parseBarkosProviderCapacityLedger({
    schemaVersion: BARKOS_PROVIDER_CAPACITY_SCHEMA_VERSION,
    companyId,
    companyCreatedAt,
    revision: 0,
    accounts: [],
    failovers: [],
    createdAt: now,
    updatedAt: now
  })
}

export function replaceBarkosProviderCapacityObservations(args: {
  ledger: BarkosProviderCapacityLedger
  company: BarkosCompany
  accounts: readonly BarkosProviderCapacityObservation[]
  now?: number
}): BarkosProviderCapacityLedger {
  const current = parseBarkosProviderCapacityLedgerForCompany(args.ledger, args.company)
  const now = args.now ?? Date.now()
  return parseBarkosProviderCapacityLedgerForCompany(
    {
      ...current,
      revision: current.revision + 1,
      accounts: args.accounts,
      updatedAt: Math.max(now, current.updatedAt + 1)
    },
    args.company
  )
}

export function upsertBarkosProviderFailoverAudit(args: {
  ledger: BarkosProviderCapacityLedger
  company: BarkosCompany
  audit: BarkosProviderFailoverAudit
  now?: number
}): BarkosProviderCapacityLedger {
  const current = parseBarkosProviderCapacityLedgerForCompany(args.ledger, args.company)
  const audit = barkosProviderFailoverAuditSchema.parse(args.audit)
  const existingIndex = current.failovers.findIndex((entry) => entry.id === audit.id)
  if (existingIndex === -1 && current.failovers.length >= BARKOS_MAX_FAILOVER_AUDITS) {
    throw new Error('BarkOS provider failover audit capacity reached')
  }
  const failovers = [...current.failovers]
  if (existingIndex === -1) {
    failovers.push(audit)
  } else {
    failovers[existingIndex] = audit
  }
  const now = args.now ?? Date.now()
  return parseBarkosProviderCapacityLedgerForCompany(
    {
      ...current,
      revision: current.revision + 1,
      failovers,
      updatedAt: Math.max(now, current.updatedAt + 1)
    },
    args.company
  )
}

export function recoverInterruptedBarkosProviderFailovers(args: {
  ledger: BarkosProviderCapacityLedger
  company: BarkosCompany
  now?: number
}): { ledger: BarkosProviderCapacityLedger; changed: boolean } {
  const current = parseBarkosProviderCapacityLedgerForCompany(args.ledger, args.company)
  const requestedNow = args.now ?? Date.now()
  let changed = false
  const failovers = current.failovers.map((audit) => {
    const latest = audit.attempts.at(-1)
    if (audit.state !== 'active' || latest?.outcome !== 'selected') {
      return audit
    }
    changed = true
    return settleBarkosProviderFailoverAttempt({
      audit,
      outcome: 'uncertain',
      reason: 'ambiguous-side-effect',
      now: Math.max(requestedNow, latest.startedAt)
    })
  })
  if (!changed) {
    return { ledger: current, changed: false }
  }
  return {
    ledger: parseBarkosProviderCapacityLedgerForCompany(
      {
        ...current,
        revision: current.revision + 1,
        failovers,
        updatedAt: Math.max(requestedNow, current.updatedAt + 1)
      },
      args.company
    ),
    changed: true
  }
}
