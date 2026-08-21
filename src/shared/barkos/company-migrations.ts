import { z } from 'zod'
import {
  BARKOS_COMPANY_SCHEMA_VERSION,
  BARKOS_MAX_ROLES,
  BARKOS_MAX_WORKERS,
  barkosCompanySchema,
  barkosRoleSchema,
  barkosWorkerSchema,
  parseBarkosCompany,
  type BarkosCompany
} from './company'

type CompanyMigration = (value: unknown) => unknown

export type BarkosCompanyMigrationErrorCode =
  | 'invalid-snapshot'
  | 'invalid-version'
  | 'unsupported-version'

export class BarkosCompanyMigrationError extends Error {
  constructor(
    readonly code: BarkosCompanyMigrationErrorCode,
    message: string,
    readonly version: number | null,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'BarkosCompanyMigrationError'
  }
}

const barkosRoleV0Schema = barkosRoleSchema.omit({ instructions: true })
const barkosWorkerV0Schema = barkosWorkerSchema.omit({ preferredEnvironmentId: true, status: true })
const barkosCompanyV0Schema = z
  .object({
    schemaVersion: z.literal(0),
    id: barkosCompanySchema.shape.id,
    name: barkosCompanySchema.shape.name,
    mission: barkosCompanySchema.shape.mission,
    leadWorkerId: barkosCompanySchema.shape.leadWorkerId,
    roles: z.array(barkosRoleV0Schema).min(1).max(BARKOS_MAX_ROLES),
    workers: z.array(barkosWorkerV0Schema).min(1).max(BARKOS_MAX_WORKERS),
    createdAt: barkosCompanySchema.shape.createdAt,
    updatedAt: barkosCompanySchema.shape.updatedAt
  })
  .strict()

function migrateV0ToV1(value: unknown): unknown {
  const snapshot = barkosCompanyV0Schema.parse(value)
  return {
    ...snapshot,
    schemaVersion: 1,
    roles: snapshot.roles.map((role) => ({ ...role, instructions: null })),
    workers: snapshot.workers.map((worker) => ({
      ...worker,
      preferredEnvironmentId: null,
      status: 'available'
    }))
  }
}

const COMPANY_MIGRATIONS: Readonly<Partial<Record<number, CompanyMigration>>> = {
  0: migrateV0ToV1
}

function readSchemaVersion(value: unknown): number {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('schemaVersion' in value) ||
    !Number.isInteger(value.schemaVersion) ||
    typeof value.schemaVersion !== 'number' ||
    value.schemaVersion < 0
  ) {
    throw new BarkosCompanyMigrationError(
      'invalid-version',
      'BarkOS company snapshot has an invalid schema version',
      null
    )
  }
  return value.schemaVersion
}

export type BarkosCompanyMigrationResult = {
  company: BarkosCompany
  migratedFromVersion: number | null
}

export function migrateBarkosCompanySnapshot(value: unknown): BarkosCompanyMigrationResult {
  const initialVersion = readSchemaVersion(value)
  if (initialVersion > BARKOS_COMPANY_SCHEMA_VERSION) {
    throw new BarkosCompanyMigrationError(
      'unsupported-version',
      `BarkOS company snapshot version ${initialVersion} is newer than supported version ${BARKOS_COMPANY_SCHEMA_VERSION}`,
      initialVersion
    )
  }

  let currentValue = value
  let currentVersion = initialVersion
  while (currentVersion < BARKOS_COMPANY_SCHEMA_VERSION) {
    const migration = COMPANY_MIGRATIONS[currentVersion]
    if (!migration) {
      throw new BarkosCompanyMigrationError(
        'unsupported-version',
        `BarkOS company snapshot version ${currentVersion} has no migration path`,
        currentVersion
      )
    }
    try {
      currentValue = migration(currentValue)
    } catch (error) {
      throw new BarkosCompanyMigrationError(
        'invalid-snapshot',
        `BarkOS company snapshot version ${currentVersion} failed migration validation`,
        currentVersion,
        { cause: error }
      )
    }
    const nextVersion = readSchemaVersion(currentValue)
    if (nextVersion !== currentVersion + 1) {
      throw new BarkosCompanyMigrationError(
        'invalid-snapshot',
        `BarkOS company migration from version ${currentVersion} did not advance exactly one version`,
        currentVersion
      )
    }
    currentVersion = nextVersion
  }

  try {
    return {
      company: parseBarkosCompany(currentValue),
      migratedFromVersion: initialVersion === BARKOS_COMPANY_SCHEMA_VERSION ? null : initialVersion
    }
  } catch (error) {
    throw new BarkosCompanyMigrationError(
      'invalid-snapshot',
      'BarkOS company snapshot failed current contract validation',
      currentVersion,
      { cause: error }
    )
  }
}
