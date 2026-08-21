import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { writeSecureJsonFileWithinLimit } from '../../shared/bounded-secure-json-file'
import type { BarkosCompany } from '../../shared/barkos/company'
import { parseBarkosWorkLedgerForCompany } from '../../shared/barkos/work-ledger-company'
import {
  BarkosWorkLedgerMigrationError,
  migrateBarkosWorkLedgerSnapshot
} from '../../shared/barkos/work-ledger-migrations'
import type { BarkosWorkLedger } from '../../shared/barkos/work-ledger'

export const BARKOS_WORK_LEDGER_SNAPSHOT_MAX_BYTES = 8 * 1024 * 1024
const BARKOS_WORK_LEDGER_PATH = join('barkos', 'work-ledgers')
const BARKOS_WORK_LEDGER_MIGRATION_BACKUP_PATH = join('barkos', 'migration-backups')

export type BarkosWorkLedgerStoreErrorCode =
  | 'snapshot-too-large'
  | 'snapshot-unreadable'
  | 'snapshot-invalid'
  | 'snapshot-conflict'
  | 'snapshot-migration-failed'
  | 'snapshot-version-unsupported'

export class BarkosWorkLedgerStoreError extends Error {
  constructor(
    readonly code: BarkosWorkLedgerStoreErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'BarkosWorkLedgerStoreError'
  }
}

type ReadSnapshotResult = {
  ledger: BarkosWorkLedger
  migratedFromVersion: number | null
  sourceValue: unknown
}

function readSnapshot(snapshotPath: string, company: BarkosCompany): ReadSnapshotResult {
  let serialized: string
  try {
    if (statSync(snapshotPath).size > BARKOS_WORK_LEDGER_SNAPSHOT_MAX_BYTES) {
      throw new BarkosWorkLedgerStoreError(
        'snapshot-too-large',
        'BarkOS work ledger exceeds the storage limit'
      )
    }
    serialized = readFileSync(snapshotPath, 'utf8')
  } catch (error) {
    if (error instanceof BarkosWorkLedgerStoreError) {
      throw error
    }
    throw new BarkosWorkLedgerStoreError(
      'snapshot-unreadable',
      'BarkOS work ledger could not be read',
      { cause: error }
    )
  }

  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch (error) {
    throw new BarkosWorkLedgerStoreError(
      'snapshot-invalid',
      'BarkOS work ledger is not valid JSON',
      {
        cause: error
      }
    )
  }

  try {
    const result = migrateBarkosWorkLedgerSnapshot(value)
    return {
      ledger: parseBarkosWorkLedgerForCompany(result.ledger, company),
      migratedFromVersion: result.migratedFromVersion,
      sourceValue: value
    }
  } catch (error) {
    if (error instanceof BarkosWorkLedgerMigrationError && error.code === 'unsupported-version') {
      throw new BarkosWorkLedgerStoreError('snapshot-version-unsupported', error.message, {
        cause: error
      })
    }
    throw new BarkosWorkLedgerStoreError(
      'snapshot-invalid',
      'BarkOS work ledger failed contract validation',
      { cause: error }
    )
  }
}

export class BarkosWorkLedgerStore {
  private readonly workLedgerPath: string
  private readonly migrationBackupPath: string

  constructor(userDataPath: string) {
    this.workLedgerPath = join(userDataPath, BARKOS_WORK_LEDGER_PATH)
    this.migrationBackupPath = join(userDataPath, BARKOS_WORK_LEDGER_MIGRATION_BACKUP_PATH)
  }

  private snapshotPath(companyId: string): string {
    return join(this.workLedgerPath, `${companyId}.json`)
  }

  load(company: BarkosCompany): BarkosWorkLedger | null {
    const snapshotPath = this.snapshotPath(company.id)
    if (!existsSync(snapshotPath)) {
      return null
    }

    const result = readSnapshot(snapshotPath, company)
    if (result.migratedFromVersion !== null) {
      const backupPath = join(
        this.migrationBackupPath,
        `${company.id}-work-ledger-v${result.migratedFromVersion}-before-v${result.ledger.schemaVersion}.json`
      )
      try {
        writeSecureJsonFileWithinLimit(
          backupPath,
          result.sourceValue,
          BARKOS_WORK_LEDGER_SNAPSHOT_MAX_BYTES,
          { durable: true }
        )
        writeSecureJsonFileWithinLimit(
          snapshotPath,
          result.ledger,
          BARKOS_WORK_LEDGER_SNAPSHOT_MAX_BYTES,
          { durable: true }
        )
      } catch (error) {
        throw new BarkosWorkLedgerStoreError(
          'snapshot-migration-failed',
          'BarkOS work-ledger migration could not be persisted',
          { cause: error }
        )
      }
    }
    return result.ledger
  }

  save(value: unknown, company: BarkosCompany): BarkosWorkLedger {
    const ledger = parseBarkosWorkLedgerForCompany(value, company)
    const snapshotPath = this.snapshotPath(company.id)
    if (existsSync(snapshotPath)) {
      const current = this.load(company)
      if (current && ledger.revision !== current.revision + 1) {
        throw new BarkosWorkLedgerStoreError(
          'snapshot-conflict',
          `BarkOS work ledger revision ${ledger.revision} does not follow stored revision ${current.revision}`
        )
      }
    }
    writeSecureJsonFileWithinLimit(snapshotPath, ledger, BARKOS_WORK_LEDGER_SNAPSHOT_MAX_BYTES, {
      durable: true
    })
    return ledger
  }
}
