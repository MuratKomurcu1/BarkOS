import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { writeSecureJsonFileWithinLimit } from '../../shared/bounded-secure-json-file'
import type { BarkosCompany } from '../../shared/barkos/company'
import {
  BARKOS_PROVIDER_CAPACITY_SCHEMA_VERSION,
  type BarkosProviderCapacityLedger
} from '../../shared/barkos/provider-capacity'
import {
  createEmptyBarkosProviderCapacityLedger,
  parseBarkosProviderCapacityLedgerForCompany,
  recoverInterruptedBarkosProviderFailovers
} from '../../shared/barkos/provider-capacity-ledger'

export const BARKOS_PROVIDER_CAPACITY_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024
const BARKOS_PROVIDER_CAPACITY_PATH = join('barkos', 'provider-capacity-ledgers')

export type BarkosProviderCapacityStoreErrorCode =
  | 'snapshot-too-large'
  | 'snapshot-unreadable'
  | 'snapshot-invalid'
  | 'snapshot-conflict'
  | 'snapshot-version-unsupported'

export class BarkosProviderCapacityStoreError extends Error {
  constructor(
    readonly code: BarkosProviderCapacityStoreErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'BarkosProviderCapacityStoreError'
  }
}

function snapshotNumber(
  value: unknown,
  property: 'schemaVersion' | 'companyCreatedAt'
): number | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !(property in value) ||
    typeof value[property] !== 'number' ||
    !Number.isInteger(value[property])
  ) {
    return null
  }
  return value[property]
}

export class BarkosProviderCapacityStore {
  private readonly ledgerPath: string
  private readonly recoveredGenerations = new Set<string>()

  constructor(userDataPath: string) {
    this.ledgerPath = join(userDataPath, BARKOS_PROVIDER_CAPACITY_PATH)
  }

  private snapshotPath(companyId: string): string {
    return join(this.ledgerPath, `${companyId}.json`)
  }

  load(company: BarkosCompany): BarkosProviderCapacityLedger | null {
    const snapshotPath = this.snapshotPath(company.id)
    if (!existsSync(snapshotPath)) {
      return null
    }
    let serialized: string
    try {
      if (statSync(snapshotPath).size > BARKOS_PROVIDER_CAPACITY_SNAPSHOT_MAX_BYTES) {
        throw new BarkosProviderCapacityStoreError(
          'snapshot-too-large',
          'BarkOS provider capacity ledger exceeds the storage limit'
        )
      }
      serialized = readFileSync(snapshotPath, 'utf8')
    } catch (error) {
      if (error instanceof BarkosProviderCapacityStoreError) {
        throw error
      }
      throw new BarkosProviderCapacityStoreError(
        'snapshot-unreadable',
        'BarkOS provider capacity ledger could not be read',
        { cause: error }
      )
    }

    let value: unknown
    try {
      value = JSON.parse(serialized)
    } catch (error) {
      throw new BarkosProviderCapacityStoreError(
        'snapshot-invalid',
        'BarkOS provider capacity ledger is not valid JSON',
        { cause: error }
      )
    }
    const version = snapshotNumber(value, 'schemaVersion')
    if (version !== null && version > BARKOS_PROVIDER_CAPACITY_SCHEMA_VERSION) {
      throw new BarkosProviderCapacityStoreError(
        'snapshot-version-unsupported',
        `BarkOS provider capacity ledger version ${version} is newer than supported version ${BARKOS_PROVIDER_CAPACITY_SCHEMA_VERSION}`
      )
    }
    const generation = snapshotNumber(value, 'companyCreatedAt')
    if (generation !== null && generation !== company.createdAt) {
      const empty = createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt)
      this.write(company.id, empty)
      return empty
    }
    try {
      const ledger = parseBarkosProviderCapacityLedgerForCompany(value, company)
      const generationKey = `${company.id}:${company.createdAt}`
      if (this.recoveredGenerations.has(generationKey)) {
        return ledger
      }
      const recovered = recoverInterruptedBarkosProviderFailovers({ ledger, company })
      if (recovered.changed) {
        this.write(company.id, recovered.ledger)
      }
      this.recoveredGenerations.add(generationKey)
      return recovered.ledger
    } catch (error) {
      throw new BarkosProviderCapacityStoreError(
        'snapshot-invalid',
        'BarkOS provider capacity ledger failed contract validation',
        { cause: error }
      )
    }
  }

  save(value: unknown, company: BarkosCompany): BarkosProviderCapacityLedger {
    let ledger: BarkosProviderCapacityLedger
    try {
      ledger = parseBarkosProviderCapacityLedgerForCompany(value, company)
    } catch (error) {
      throw new BarkosProviderCapacityStoreError(
        'snapshot-invalid',
        'BarkOS provider capacity ledger failed contract validation',
        { cause: error }
      )
    }
    const snapshotPath = this.snapshotPath(company.id)
    if (existsSync(snapshotPath)) {
      const current = this.load(company)
      if (current && ledger.revision !== current.revision + 1) {
        throw new BarkosProviderCapacityStoreError(
          'snapshot-conflict',
          `BarkOS provider capacity ledger revision ${ledger.revision} does not follow stored revision ${current.revision}`
        )
      }
    }
    this.write(company.id, ledger)
    return ledger
  }

  private write(companyId: string, ledger: BarkosProviderCapacityLedger): void {
    writeSecureJsonFileWithinLimit(
      this.snapshotPath(companyId),
      ledger,
      BARKOS_PROVIDER_CAPACITY_SNAPSHOT_MAX_BYTES,
      { durable: true }
    )
  }
}
