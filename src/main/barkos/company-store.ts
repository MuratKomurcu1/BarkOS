import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { writeSecureJsonFileWithinLimit } from '../../shared/bounded-secure-json-file'
import { parseBarkosCompany, type BarkosCompany } from '../../shared/barkos/company'
import {
  BarkosCompanyMigrationError,
  migrateBarkosCompanySnapshot
} from '../../shared/barkos/company-migrations'

export const BARKOS_COMPANY_SNAPSHOT_MAX_BYTES = 512 * 1024
const BARKOS_COMPANY_SNAPSHOT_PATH = join('barkos', 'company.json')
const BARKOS_COMPANY_ARCHIVE_PATH = join('barkos', 'archive')
const BARKOS_COMPANY_MIGRATION_BACKUP_PATH = join('barkos', 'migration-backups')

export type BarkosCompanyStoreErrorCode =
  | 'snapshot-too-large'
  | 'snapshot-unreadable'
  | 'snapshot-invalid'
  | 'snapshot-migration-failed'
  | 'snapshot-version-unsupported'

export class BarkosCompanyStoreError extends Error {
  constructor(
    readonly code: BarkosCompanyStoreErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'BarkosCompanyStoreError'
  }
}

type ReadBarkosCompanySnapshotResult = {
  company: BarkosCompany
  migratedFromVersion: number | null
  sourceValue: unknown
}

function readBarkosCompanySnapshot(snapshotPath: string): ReadBarkosCompanySnapshotResult {
  let serialized: string
  try {
    if (statSync(snapshotPath).size > BARKOS_COMPANY_SNAPSHOT_MAX_BYTES) {
      throw new BarkosCompanyStoreError(
        'snapshot-too-large',
        'BarkOS company snapshot exceeds the storage limit'
      )
    }
    serialized = readFileSync(snapshotPath, 'utf8')
  } catch (error) {
    if (error instanceof BarkosCompanyStoreError) {
      throw error
    }
    throw new BarkosCompanyStoreError(
      'snapshot-unreadable',
      'BarkOS company snapshot could not be read',
      { cause: error }
    )
  }

  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch (error) {
    throw new BarkosCompanyStoreError(
      'snapshot-invalid',
      'BarkOS company snapshot is not valid JSON',
      { cause: error }
    )
  }

  try {
    const result = migrateBarkosCompanySnapshot(value)
    return { ...result, sourceValue: value }
  } catch (error) {
    if (error instanceof BarkosCompanyMigrationError && error.code === 'unsupported-version') {
      throw new BarkosCompanyStoreError('snapshot-version-unsupported', error.message, {
        cause: error
      })
    }
    throw new BarkosCompanyStoreError(
      'snapshot-invalid',
      'BarkOS company snapshot failed contract validation',
      { cause: error }
    )
  }
}

export function readBarkosCompanySnapshotFile(snapshotPath: string): BarkosCompany {
  return readBarkosCompanySnapshot(snapshotPath).company
}

export class BarkosCompanyStore {
  private readonly snapshotPath: string
  private readonly archivePath: string
  private readonly migrationBackupPath: string

  constructor(userDataPath: string) {
    this.snapshotPath = join(userDataPath, BARKOS_COMPANY_SNAPSHOT_PATH)
    this.archivePath = join(userDataPath, BARKOS_COMPANY_ARCHIVE_PATH)
    this.migrationBackupPath = join(userDataPath, BARKOS_COMPANY_MIGRATION_BACKUP_PATH)
  }

  load(): BarkosCompany | null {
    if (!existsSync(this.snapshotPath)) {
      return null
    }

    const result = readBarkosCompanySnapshot(this.snapshotPath)
    if (result.migratedFromVersion !== null) {
      const backupPath = join(
        this.migrationBackupPath,
        `company-v${result.migratedFromVersion}-before-v${result.company.schemaVersion}.json`
      )
      try {
        writeSecureJsonFileWithinLimit(
          backupPath,
          result.sourceValue,
          BARKOS_COMPANY_SNAPSHOT_MAX_BYTES,
          { durable: true }
        )
        writeSecureJsonFileWithinLimit(
          this.snapshotPath,
          result.company,
          BARKOS_COMPANY_SNAPSHOT_MAX_BYTES,
          { durable: true }
        )
      } catch (error) {
        throw new BarkosCompanyStoreError(
          'snapshot-migration-failed',
          'BarkOS company snapshot migration could not be persisted',
          { cause: error }
        )
      }
    }
    return result.company
  }

  save(value: unknown): BarkosCompany {
    const company = parseBarkosCompany(value)
    writeSecureJsonFileWithinLimit(this.snapshotPath, company, BARKOS_COMPANY_SNAPSHOT_MAX_BYTES, {
      durable: true
    })
    return company
  }

  archive(now = Date.now()): BarkosCompany | null {
    const company = this.load()
    if (!company) {
      return null
    }

    mkdirSync(this.archivePath, { recursive: true, mode: 0o700 })
    let suffix = 0
    let archiveFile: string
    do {
      const collisionSuffix = suffix === 0 ? '' : `-${suffix}`
      archiveFile = join(this.archivePath, `company-${now}${collisionSuffix}.json`)
      suffix += 1
    } while (existsSync(archiveFile))

    renameSync(this.snapshotPath, archiveFile)
    return company
  }
}
