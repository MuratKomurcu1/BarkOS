import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { writeSecureJsonFileWithinLimit } from '../../shared/bounded-secure-json-file'
import type { BarkosCompany } from '../../shared/barkos/company'
import {
  BARKOS_CONTROL_POLICY_SCHEMA_VERSION,
  createDefaultBarkosControlPolicy,
  parseBarkosControlPolicyForCompany,
  type BarkosControlPolicy
} from '../../shared/barkos/control-policy'

export const BARKOS_CONTROL_POLICY_SNAPSHOT_MAX_BYTES = 64 * 1024
const BARKOS_CONTROL_POLICY_PATH = join('barkos', 'control-policies')

export type BarkosControlPolicyStoreErrorCode =
  | 'snapshot-too-large'
  | 'snapshot-unreadable'
  | 'snapshot-invalid'
  | 'snapshot-conflict'
  | 'snapshot-version-unsupported'

export class BarkosControlPolicyStoreError extends Error {
  constructor(
    readonly code: BarkosControlPolicyStoreErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'BarkosControlPolicyStoreError'
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

export class BarkosControlPolicyStore {
  private readonly policyDirectory: string

  constructor(userDataPath: string) {
    this.policyDirectory = join(userDataPath, BARKOS_CONTROL_POLICY_PATH)
  }

  private snapshotPath(companyId: string): string {
    return join(this.policyDirectory, `${companyId}.json`)
  }

  load(company: BarkosCompany): BarkosControlPolicy | null {
    const snapshotPath = this.snapshotPath(company.id)
    if (!existsSync(snapshotPath)) {
      return null
    }
    let serialized: string
    try {
      if (statSync(snapshotPath).size > BARKOS_CONTROL_POLICY_SNAPSHOT_MAX_BYTES) {
        throw new BarkosControlPolicyStoreError(
          'snapshot-too-large',
          'BarkOS control policy exceeds the storage limit'
        )
      }
      serialized = readFileSync(snapshotPath, 'utf8')
    } catch (error) {
      if (error instanceof BarkosControlPolicyStoreError) {
        throw error
      }
      throw new BarkosControlPolicyStoreError(
        'snapshot-unreadable',
        'BarkOS control policy could not be read',
        { cause: error }
      )
    }

    let value: unknown
    try {
      value = JSON.parse(serialized)
    } catch (error) {
      throw new BarkosControlPolicyStoreError(
        'snapshot-invalid',
        'BarkOS control policy is not valid JSON',
        { cause: error }
      )
    }
    const version = snapshotNumber(value, 'schemaVersion')
    if (version !== null && version > BARKOS_CONTROL_POLICY_SCHEMA_VERSION) {
      throw new BarkosControlPolicyStoreError(
        'snapshot-version-unsupported',
        `BarkOS control policy version ${version} is newer than supported version ${BARKOS_CONTROL_POLICY_SCHEMA_VERSION}`
      )
    }
    const generation = snapshotNumber(value, 'companyCreatedAt')
    if (generation !== null && generation !== company.createdAt) {
      const initial = createDefaultBarkosControlPolicy(company.id, company.createdAt)
      this.write(company.id, initial)
      return initial
    }
    try {
      return parseBarkosControlPolicyForCompany(value, company)
    } catch (error) {
      throw new BarkosControlPolicyStoreError(
        'snapshot-invalid',
        'BarkOS control policy failed contract validation',
        { cause: error }
      )
    }
  }

  save(value: unknown, company: BarkosCompany): BarkosControlPolicy {
    let policy: BarkosControlPolicy
    try {
      policy = parseBarkosControlPolicyForCompany(value, company)
    } catch (error) {
      throw new BarkosControlPolicyStoreError(
        'snapshot-invalid',
        'BarkOS control policy failed contract validation',
        { cause: error }
      )
    }
    if (existsSync(this.snapshotPath(company.id))) {
      const current = this.load(company)
      if (current && policy.revision !== current.revision + 1) {
        throw new BarkosControlPolicyStoreError(
          'snapshot-conflict',
          `BarkOS control policy revision ${policy.revision} does not follow stored revision ${current.revision}`
        )
      }
    }
    this.write(company.id, policy)
    return policy
  }

  private write(companyId: string, policy: BarkosControlPolicy): void {
    writeSecureJsonFileWithinLimit(
      this.snapshotPath(companyId),
      policy,
      BARKOS_CONTROL_POLICY_SNAPSHOT_MAX_BYTES,
      { durable: true }
    )
  }
}
