import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { writeSecureJsonFileWithinLimit } from '../../shared/bounded-secure-json-file'
import type { BarkosCompany } from '../../shared/barkos/company'
import {
  BARKOS_WORKER_SESSION_SCHEMA_VERSION,
  parseBarkosWorkerSessionBinding,
  reconcileBarkosWorkerSessionSnapshot,
  upsertBarkosWorkerSessionBinding,
  type BarkosWorkerSessionSnapshot
} from '../../shared/barkos/worker-session'

export const BARKOS_WORKER_SESSION_SNAPSHOT_MAX_BYTES = 256 * 1024
const BARKOS_WORKER_SESSION_PATH = join('barkos', 'worker-sessions')

export type BarkosWorkerSessionStoreErrorCode =
  | 'snapshot-too-large'
  | 'snapshot-unreadable'
  | 'snapshot-invalid'
  | 'snapshot-version-unsupported'

export class BarkosWorkerSessionStoreError extends Error {
  constructor(
    readonly code: BarkosWorkerSessionStoreErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'BarkosWorkerSessionStoreError'
  }
}

function snapshotVersion(value: unknown): number | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('schemaVersion' in value) ||
    typeof value.schemaVersion !== 'number' ||
    !Number.isInteger(value.schemaVersion)
  ) {
    return null
  }
  return value.schemaVersion
}

export class BarkosWorkerSessionStore {
  private readonly workerSessionPath: string

  constructor(userDataPath: string) {
    this.workerSessionPath = join(userDataPath, BARKOS_WORKER_SESSION_PATH)
  }

  private snapshotPath(companyId: string): string {
    return join(this.workerSessionPath, `${companyId}.json`)
  }

  load(company: BarkosCompany): BarkosWorkerSessionSnapshot | null {
    const snapshotPath = this.snapshotPath(company.id)
    if (!existsSync(snapshotPath)) {
      return null
    }
    let serialized: string
    try {
      if (statSync(snapshotPath).size > BARKOS_WORKER_SESSION_SNAPSHOT_MAX_BYTES) {
        throw new BarkosWorkerSessionStoreError(
          'snapshot-too-large',
          'BarkOS worker session snapshot exceeds the storage limit'
        )
      }
      serialized = readFileSync(snapshotPath, 'utf8')
    } catch (error) {
      if (error instanceof BarkosWorkerSessionStoreError) {
        throw error
      }
      throw new BarkosWorkerSessionStoreError(
        'snapshot-unreadable',
        'BarkOS worker session snapshot could not be read',
        { cause: error }
      )
    }

    let value: unknown
    try {
      value = JSON.parse(serialized)
    } catch (error) {
      throw new BarkosWorkerSessionStoreError(
        'snapshot-invalid',
        'BarkOS worker session snapshot is not valid JSON',
        { cause: error }
      )
    }
    const version = snapshotVersion(value)
    if (version !== null && version > BARKOS_WORKER_SESSION_SCHEMA_VERSION) {
      throw new BarkosWorkerSessionStoreError(
        'snapshot-version-unsupported',
        `BarkOS worker session snapshot version ${version} is newer than supported version ${BARKOS_WORKER_SESSION_SCHEMA_VERSION}`
      )
    }

    try {
      const reconciled = reconcileBarkosWorkerSessionSnapshot(value, company)
      if (reconciled.changed) {
        this.write(company.id, reconciled.snapshot)
      }
      return reconciled.snapshot
    } catch (error) {
      throw new BarkosWorkerSessionStoreError(
        'snapshot-invalid',
        'BarkOS worker session snapshot failed contract validation',
        { cause: error }
      )
    }
  }

  record(company: BarkosCompany, value: unknown, now = Date.now()): BarkosWorkerSessionSnapshot {
    const binding = parseBarkosWorkerSessionBinding(value)
    const snapshot = upsertBarkosWorkerSessionBinding({
      snapshot: this.load(company),
      company,
      binding,
      now
    })
    this.write(company.id, snapshot)
    return snapshot
  }

  private write(companyId: string, snapshot: BarkosWorkerSessionSnapshot): void {
    writeSecureJsonFileWithinLimit(
      this.snapshotPath(companyId),
      snapshot,
      BARKOS_WORKER_SESSION_SNAPSHOT_MAX_BYTES,
      { durable: true }
    )
  }
}
