import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { writeSecureJsonFileWithinLimit } from '../../shared/bounded-secure-json-file'
import type { BarkosCompany } from '../../shared/barkos/company'
import {
  BARKOS_MEMORY_VAULT_SCHEMA_VERSION,
  createEmptyBarkosMemoryVault,
  parseBarkosMemoryVaultForCompany,
  type BarkosMemoryVault
} from '../../shared/barkos/memory-vault'

export const BARKOS_MEMORY_VAULT_SNAPSHOT_MAX_BYTES = 4 * 1024 * 1024
const BARKOS_MEMORY_VAULT_PATH = join('barkos', 'memory-vaults')

export type BarkosMemoryVaultStoreErrorCode =
  | 'snapshot-too-large'
  | 'snapshot-unreadable'
  | 'snapshot-invalid'
  | 'snapshot-conflict'
  | 'snapshot-version-unsupported'

export class BarkosMemoryVaultStoreError extends Error {
  constructor(
    readonly code: BarkosMemoryVaultStoreErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'BarkosMemoryVaultStoreError'
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

export class BarkosMemoryVaultStore {
  private readonly vaultPath: string

  constructor(userDataPath: string) {
    this.vaultPath = join(userDataPath, BARKOS_MEMORY_VAULT_PATH)
  }

  private snapshotPath(companyId: string): string {
    return join(this.vaultPath, `${companyId}.json`)
  }

  load(company: BarkosCompany): BarkosMemoryVault | null {
    const snapshotPath = this.snapshotPath(company.id)
    if (!existsSync(snapshotPath)) {
      return null
    }
    let serialized: string
    try {
      if (statSync(snapshotPath).size > BARKOS_MEMORY_VAULT_SNAPSHOT_MAX_BYTES) {
        throw new BarkosMemoryVaultStoreError(
          'snapshot-too-large',
          'BarkOS memory vault exceeds the storage limit'
        )
      }
      serialized = readFileSync(snapshotPath, 'utf8')
    } catch (error) {
      if (error instanceof BarkosMemoryVaultStoreError) {
        throw error
      }
      throw new BarkosMemoryVaultStoreError(
        'snapshot-unreadable',
        'BarkOS memory vault could not be read',
        { cause: error }
      )
    }

    let value: unknown
    try {
      value = JSON.parse(serialized)
    } catch (error) {
      throw new BarkosMemoryVaultStoreError(
        'snapshot-invalid',
        'BarkOS memory vault is not valid JSON',
        { cause: error }
      )
    }
    const version = snapshotNumber(value, 'schemaVersion')
    if (version !== null && version > BARKOS_MEMORY_VAULT_SCHEMA_VERSION) {
      throw new BarkosMemoryVaultStoreError(
        'snapshot-version-unsupported',
        `BarkOS memory vault version ${version} is newer than supported version ${BARKOS_MEMORY_VAULT_SCHEMA_VERSION}`
      )
    }
    const generation = snapshotNumber(value, 'companyCreatedAt')
    if (generation !== null && generation !== company.createdAt) {
      const empty = createEmptyBarkosMemoryVault(company.id, company.createdAt)
      this.write(company.id, empty)
      return empty
    }
    try {
      return parseBarkosMemoryVaultForCompany(value, company)
    } catch (error) {
      throw new BarkosMemoryVaultStoreError(
        'snapshot-invalid',
        'BarkOS memory vault failed contract validation',
        { cause: error }
      )
    }
  }

  save(value: unknown, company: BarkosCompany): BarkosMemoryVault {
    let vault: BarkosMemoryVault
    try {
      vault = parseBarkosMemoryVaultForCompany(value, company)
    } catch (error) {
      throw new BarkosMemoryVaultStoreError(
        'snapshot-invalid',
        'BarkOS memory vault failed contract validation',
        { cause: error }
      )
    }
    const snapshotPath = this.snapshotPath(company.id)
    if (existsSync(snapshotPath)) {
      const current = this.load(company)
      if (current && vault.revision !== current.revision + 1) {
        throw new BarkosMemoryVaultStoreError(
          'snapshot-conflict',
          `BarkOS memory vault revision ${vault.revision} does not follow stored revision ${current.revision}`
        )
      }
    }
    this.write(company.id, vault)
    return vault
  }

  replaceForImport(value: unknown, company: BarkosCompany): BarkosMemoryVault {
    let vault: BarkosMemoryVault
    try {
      vault = parseBarkosMemoryVaultForCompany(value, company)
    } catch (error) {
      throw new BarkosMemoryVaultStoreError(
        'snapshot-invalid',
        'Imported BarkOS memory vault failed contract validation',
        { cause: error }
      )
    }
    this.write(company.id, vault)
    return vault
  }

  private write(companyId: string, vault: BarkosMemoryVault): void {
    writeSecureJsonFileWithinLimit(
      this.snapshotPath(companyId),
      vault,
      BARKOS_MEMORY_VAULT_SNAPSHOT_MAX_BYTES,
      { durable: true }
    )
  }
}
