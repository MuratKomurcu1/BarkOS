import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { writeSecureJsonFileWithinLimit } from '../../shared/bounded-secure-json-file'
import type { BarkosCompany } from '../../shared/barkos/company'
import {
  BARKOS_USAGE_COST_LEDGER_SCHEMA_VERSION,
  createEmptyBarkosUsageCostLedger,
  parseBarkosUsageCostLedgerForCompany,
  type BarkosUsageCostLedger
} from '../../shared/barkos/usage-cost-ledger'

export const BARKOS_USAGE_COST_SNAPSHOT_MAX_BYTES = 4 * 1024 * 1024
const BARKOS_USAGE_COST_PATH = join('barkos', 'usage-cost-ledgers')

export class BarkosUsageCostStoreError extends Error {
  constructor(
    readonly code:
      | 'snapshot-too-large'
      | 'snapshot-unreadable'
      | 'snapshot-invalid'
      | 'snapshot-conflict'
      | 'snapshot-version-unsupported',
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'BarkosUsageCostStoreError'
  }
}

function snapshotInteger(value: unknown, property: string): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  const candidate = (value as Record<string, unknown>)[property]
  return typeof candidate === 'number' && Number.isInteger(candidate) ? candidate : null
}

export class BarkosUsageCostStore {
  private readonly ledgerPath: string

  constructor(userDataPath: string) {
    this.ledgerPath = join(userDataPath, BARKOS_USAGE_COST_PATH)
  }

  load(company: BarkosCompany): BarkosUsageCostLedger | null {
    const snapshotPath = this.snapshotPath(company.id)
    if (!existsSync(snapshotPath)) {
      return null
    }
    let value: unknown
    try {
      if (statSync(snapshotPath).size > BARKOS_USAGE_COST_SNAPSHOT_MAX_BYTES) {
        throw new BarkosUsageCostStoreError(
          'snapshot-too-large',
          'BarkOS usage-cost ledger exceeds the storage limit'
        )
      }
      value = JSON.parse(readFileSync(snapshotPath, 'utf8'))
    } catch (error) {
      if (error instanceof BarkosUsageCostStoreError) {
        throw error
      }
      throw new BarkosUsageCostStoreError(
        'snapshot-unreadable',
        'BarkOS usage-cost ledger could not be read',
        { cause: error }
      )
    }
    const version = snapshotInteger(value, 'schemaVersion')
    if (version !== null && version > BARKOS_USAGE_COST_LEDGER_SCHEMA_VERSION) {
      throw new BarkosUsageCostStoreError(
        'snapshot-version-unsupported',
        `BarkOS usage-cost ledger version ${version} is newer than supported version ${BARKOS_USAGE_COST_LEDGER_SCHEMA_VERSION}`
      )
    }
    const companyCreatedAt = snapshotInteger(value, 'companyCreatedAt')
    if (companyCreatedAt !== null && companyCreatedAt !== company.createdAt) {
      const empty = createEmptyBarkosUsageCostLedger(company.id, company.createdAt)
      this.write(company.id, empty)
      return empty
    }
    try {
      return parseBarkosUsageCostLedgerForCompany(value, company)
    } catch (error) {
      throw new BarkosUsageCostStoreError(
        'snapshot-invalid',
        'BarkOS usage-cost ledger failed contract validation',
        { cause: error }
      )
    }
  }

  save(value: unknown, company: BarkosCompany): BarkosUsageCostLedger {
    let ledger: BarkosUsageCostLedger
    try {
      ledger = parseBarkosUsageCostLedgerForCompany(value, company)
    } catch (error) {
      throw new BarkosUsageCostStoreError(
        'snapshot-invalid',
        'BarkOS usage-cost ledger failed contract validation',
        { cause: error }
      )
    }
    const current = this.load(company)
    if (current && ledger.revision !== current.revision + 1) {
      throw new BarkosUsageCostStoreError(
        'snapshot-conflict',
        `BarkOS usage-cost ledger revision ${ledger.revision} does not follow stored revision ${current.revision}`
      )
    }
    this.write(company.id, ledger)
    return ledger
  }

  private snapshotPath(companyId: string): string {
    return join(this.ledgerPath, `${companyId}.json`)
  }

  private write(companyId: string, ledger: BarkosUsageCostLedger): void {
    writeSecureJsonFileWithinLimit(
      this.snapshotPath(companyId),
      ledger,
      BARKOS_USAGE_COST_SNAPSHOT_MAX_BYTES,
      { durable: true }
    )
  }
}
