import { z } from 'zod'
import { barkosCompanySchema, parseBarkosCompany } from './company'
import { containsBarkosCredentialLikeContent } from './memory-content-policy'
import {
  barkosMemoryVaultSchema,
  createEmptyBarkosMemoryVault,
  type BarkosMemoryVault
} from './memory-vault'

export const BARKOS_BACKUP_BUNDLE_SCHEMA_VERSION = 1 as const
export const BARKOS_BACKUP_BUNDLE_MAX_BYTES = 5 * 1024 * 1024

export const barkosBackupBundleSchema = z
  .object({
    kind: z.literal('barkos-backup'),
    schemaVersion: z.literal(BARKOS_BACKUP_BUNDLE_SCHEMA_VERSION),
    exportedAt: z.number().int().nonnegative(),
    company: barkosCompanySchema,
    memoryVault: barkosMemoryVaultSchema
  })
  .strict()
  .superRefine((bundle, context) => {
    if (
      bundle.memoryVault.companyId !== bundle.company.id ||
      bundle.memoryVault.companyCreatedAt !== bundle.company.createdAt
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Backup memory vault does not match its company generation',
        path: ['memoryVault']
      })
    }
    if (
      containsBarkosCredentialLikeContent(
        JSON.stringify({ company: bundle.company, memoryVault: bundle.memoryVault })
      )
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Backup contains credential-like content'
      })
    }
  })

export type BarkosBackupBundle = z.infer<typeof barkosBackupBundleSchema>

export function createBarkosBackupBundle(args: {
  company: BarkosBackupBundle['company']
  memoryVault: BarkosMemoryVault
  now?: number
}): BarkosBackupBundle {
  return barkosBackupBundleSchema.parse({
    kind: 'barkos-backup',
    schemaVersion: BARKOS_BACKUP_BUNDLE_SCHEMA_VERSION,
    exportedAt: args.now ?? Date.now(),
    company: args.company,
    memoryVault: args.memoryVault
  })
}

export function parseBarkosBackupImport(value: unknown, now = Date.now()): BarkosBackupBundle {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    'kind' in value &&
    value.kind === 'barkos-backup'
  ) {
    return barkosBackupBundleSchema.parse(value)
  }
  const company = parseBarkosCompany(value)
  return createBarkosBackupBundle({
    company,
    memoryVault: createEmptyBarkosMemoryVault(company.id, company.createdAt, now),
    now
  })
}
