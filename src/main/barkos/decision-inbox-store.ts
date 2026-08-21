import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { writeSecureJsonFileWithinLimit } from '../../shared/bounded-secure-json-file'
import type { BarkosCompany } from '../../shared/barkos/company'
import {
  BARKOS_DECISION_INBOX_SCHEMA_VERSION,
  createEmptyBarkosDecisionInbox,
  parseBarkosDecisionInboxForCompany,
  recoverInterruptedBarkosDecisionResolutions,
  type BarkosDecisionInbox
} from '../../shared/barkos/decision-inbox'

export const BARKOS_DECISION_INBOX_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024
const BARKOS_DECISION_INBOX_PATH = join('barkos', 'decision-inboxes')

export type BarkosDecisionInboxStoreErrorCode =
  | 'snapshot-too-large'
  | 'snapshot-unreadable'
  | 'snapshot-invalid'
  | 'snapshot-conflict'
  | 'snapshot-version-unsupported'

export class BarkosDecisionInboxStoreError extends Error {
  constructor(
    readonly code: BarkosDecisionInboxStoreErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'BarkosDecisionInboxStoreError'
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

function snapshotGeneration(value: unknown): number | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('companyCreatedAt' in value) ||
    typeof value.companyCreatedAt !== 'number' ||
    !Number.isInteger(value.companyCreatedAt)
  ) {
    return null
  }
  return value.companyCreatedAt
}

export class BarkosDecisionInboxStore {
  private readonly decisionInboxPath: string
  private readonly recoveredGenerations = new Set<string>()

  constructor(userDataPath: string) {
    this.decisionInboxPath = join(userDataPath, BARKOS_DECISION_INBOX_PATH)
  }

  private snapshotPath(companyId: string): string {
    return join(this.decisionInboxPath, `${companyId}.json`)
  }

  load(company: BarkosCompany): BarkosDecisionInbox | null {
    const inbox = this.read(company)
    if (!inbox) {
      return null
    }
    const generationKey = `${company.id}:${company.createdAt}`
    if (this.recoveredGenerations.has(generationKey)) {
      return inbox
    }
    const recovered = recoverInterruptedBarkosDecisionResolutions(inbox)
    if (recovered !== inbox) {
      this.write(company.id, recovered)
    }
    this.recoveredGenerations.add(generationKey)
    return recovered
  }

  private read(company: BarkosCompany): BarkosDecisionInbox | null {
    const snapshotPath = this.snapshotPath(company.id)
    if (!existsSync(snapshotPath)) {
      return null
    }
    let serialized: string
    try {
      if (statSync(snapshotPath).size > BARKOS_DECISION_INBOX_SNAPSHOT_MAX_BYTES) {
        throw new BarkosDecisionInboxStoreError(
          'snapshot-too-large',
          'BarkOS decision inbox exceeds the storage limit'
        )
      }
      serialized = readFileSync(snapshotPath, 'utf8')
    } catch (error) {
      if (error instanceof BarkosDecisionInboxStoreError) {
        throw error
      }
      throw new BarkosDecisionInboxStoreError(
        'snapshot-unreadable',
        'BarkOS decision inbox could not be read',
        { cause: error }
      )
    }

    let value: unknown
    try {
      value = JSON.parse(serialized)
    } catch (error) {
      throw new BarkosDecisionInboxStoreError(
        'snapshot-invalid',
        'BarkOS decision inbox is not valid JSON',
        { cause: error }
      )
    }
    const version = snapshotVersion(value)
    if (version !== null && version > BARKOS_DECISION_INBOX_SCHEMA_VERSION) {
      throw new BarkosDecisionInboxStoreError(
        'snapshot-version-unsupported',
        `BarkOS decision inbox version ${version} is newer than supported version ${BARKOS_DECISION_INBOX_SCHEMA_VERSION}`
      )
    }
    if (snapshotGeneration(value) !== null && snapshotGeneration(value) !== company.createdAt) {
      const empty = createEmptyBarkosDecisionInbox(company.id, company.createdAt)
      this.write(company.id, empty)
      return empty
    }
    try {
      return parseBarkosDecisionInboxForCompany(value, company)
    } catch (error) {
      throw new BarkosDecisionInboxStoreError(
        'snapshot-invalid',
        'BarkOS decision inbox failed contract validation',
        { cause: error }
      )
    }
  }

  save(value: unknown, company: BarkosCompany): BarkosDecisionInbox {
    let inbox: BarkosDecisionInbox
    try {
      inbox = parseBarkosDecisionInboxForCompany(value, company)
    } catch (error) {
      throw new BarkosDecisionInboxStoreError(
        'snapshot-invalid',
        'BarkOS decision inbox failed contract validation',
        { cause: error }
      )
    }
    const snapshotPath = this.snapshotPath(company.id)
    if (existsSync(snapshotPath)) {
      const current = this.read(company)
      if (current && inbox.revision !== current.revision + 1) {
        throw new BarkosDecisionInboxStoreError(
          'snapshot-conflict',
          `BarkOS decision inbox revision ${inbox.revision} does not follow stored revision ${current.revision}`
        )
      }
    }
    this.write(company.id, inbox)
    return inbox
  }

  mutate(
    company: BarkosCompany,
    update: (current: BarkosDecisionInbox) => BarkosDecisionInbox
  ): BarkosDecisionInbox {
    const current =
      this.load(company) ?? createEmptyBarkosDecisionInbox(company.id, company.createdAt)
    const candidate = update(current)
    if (candidate === current) {
      return current
    }
    let next: BarkosDecisionInbox
    try {
      next = parseBarkosDecisionInboxForCompany(candidate, company)
    } catch (error) {
      throw new BarkosDecisionInboxStoreError(
        'snapshot-invalid',
        'BarkOS decision inbox mutation failed contract validation',
        { cause: error }
      )
    }
    if (next.revision !== current.revision + 1) {
      throw new BarkosDecisionInboxStoreError(
        'snapshot-conflict',
        `BarkOS decision inbox revision ${next.revision} does not follow stored revision ${current.revision}`
      )
    }
    this.write(company.id, next)
    return next
  }

  private write(companyId: string, inbox: BarkosDecisionInbox): void {
    writeSecureJsonFileWithinLimit(
      this.snapshotPath(companyId),
      inbox,
      BARKOS_DECISION_INBOX_SNAPSHOT_MAX_BYTES,
      { durable: true }
    )
  }
}
