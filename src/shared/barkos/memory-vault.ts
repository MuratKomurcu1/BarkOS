import { z } from 'zod'
import type { BarkosCompany } from './company'
import { barkosEntityIdSchema, barkosLabelSchema } from './company'

export const BARKOS_MEMORY_VAULT_SCHEMA_VERSION = 1 as const
export const BARKOS_MAX_MEMORY_ENTRIES = 2_000
export const BARKOS_MAX_MEMORY_CANDIDATES = 2_000

const timestampSchema = z.number().int().nonnegative()
const externalIdSchema = z.string().trim().min(1).max(512)
const memoryContentSchema = z.string().trim().min(1).max(8_000)

export const barkosMemoryScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('company'), targetId: z.null() }).strict(),
  z.object({ kind: z.literal('role'), targetId: barkosEntityIdSchema }).strict(),
  z.object({ kind: z.literal('worker'), targetId: barkosEntityIdSchema }).strict(),
  z.object({ kind: z.literal('project'), targetId: externalIdSchema }).strict(),
  z.object({ kind: z.literal('task'), targetId: barkosEntityIdSchema }).strict()
])

const barkosMemorySourceSchema = z
  .object({
    kind: z.literal('accepted-evidence'),
    evidenceId: barkosEntityIdSchema,
    taskId: barkosEntityIdSchema,
    assignmentId: barkosEntityIdSchema,
    dispatchId: barkosEntityIdSchema,
    workerId: barkosEntityIdSchema,
    roleId: barkosEntityIdSchema,
    workspaceId: externalIdSchema,
    capturedAt: timestampSchema
  })
  .strict()

export const barkosMemoryCandidateSchema = z
  .object({
    id: barkosEntityIdSchema,
    status: z.enum(['pending', 'promoted', 'rejected']),
    scope: barkosMemoryScopeSchema,
    title: barkosLabelSchema,
    content: memoryContentSchema,
    source: barkosMemorySourceSchema,
    confidence: z.number().int().min(0).max(100),
    expiresAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    lastSeenAt: timestampSchema,
    resolvedAt: timestampSchema.nullable(),
    promotedMemoryId: barkosEntityIdSchema.nullable()
  })
  .strict()
  .superRefine((candidate, context) => {
    const resolved = candidate.status !== 'pending'
    if (resolved !== (candidate.resolvedAt !== null)) {
      context.addIssue({ code: 'custom', message: 'Resolved candidates require a resolution time' })
    }
    if ((candidate.status === 'promoted') !== (candidate.promotedMemoryId !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Only promoted candidates reference a memory entry',
        path: ['promotedMemoryId']
      })
    }
    if (candidate.lastSeenAt < candidate.createdAt) {
      context.addIssue({ code: 'custom', message: 'Candidate cannot be seen before creation' })
    }
    if (candidate.expiresAt !== null && candidate.expiresAt <= candidate.createdAt) {
      context.addIssue({ code: 'custom', message: 'Candidate expiry must follow creation' })
    }
  })

export const barkosMemoryEntrySchema = z
  .object({
    id: barkosEntityIdSchema,
    status: z.enum(['active', 'superseded', 'revoked']),
    scope: barkosMemoryScopeSchema,
    title: barkosLabelSchema,
    content: memoryContentSchema,
    source: barkosMemorySourceSchema,
    confidence: z.number().int().min(0).max(100),
    expiresAt: timestampSchema.nullable(),
    contradictsMemoryIds: z.array(barkosEntityIdSchema).max(50),
    supersededByMemoryId: barkosEntityIdSchema.nullable(),
    promotedBy: z.literal('user'),
    createdAt: timestampSchema,
    promotedAt: timestampSchema,
    revokedAt: timestampSchema.nullable()
  })
  .strict()
  .superRefine((entry, context) => {
    if ((entry.status === 'superseded') !== (entry.supersededByMemoryId !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Only superseded memory references its replacement',
        path: ['supersededByMemoryId']
      })
    }
    if ((entry.status === 'revoked') !== (entry.revokedAt !== null)) {
      context.addIssue({ code: 'custom', message: 'Revoked memory requires a revocation time' })
    }
    if (entry.contradictsMemoryIds.includes(entry.id)) {
      context.addIssue({ code: 'custom', message: 'Memory cannot contradict itself' })
    }
    if (entry.supersededByMemoryId === entry.id) {
      context.addIssue({ code: 'custom', message: 'Memory cannot supersede itself' })
    }
    if (entry.promotedAt < entry.createdAt) {
      context.addIssue({ code: 'custom', message: 'Memory cannot be promoted before creation' })
    }
    if (entry.expiresAt !== null && entry.expiresAt <= entry.promotedAt) {
      context.addIssue({ code: 'custom', message: 'Memory expiry must follow promotion' })
    }
  })

export const barkosMemoryVaultSchema = z
  .object({
    schemaVersion: z.literal(BARKOS_MEMORY_VAULT_SCHEMA_VERSION),
    companyId: barkosEntityIdSchema,
    companyCreatedAt: timestampSchema,
    entries: z.array(barkosMemoryEntrySchema).max(BARKOS_MAX_MEMORY_ENTRIES),
    candidates: z.array(barkosMemoryCandidateSchema).max(BARKOS_MAX_MEMORY_CANDIDATES),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    createdAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .strict()
  .superRefine((vault, context) => {
    validateUniqueIds(vault.entries, 'entries', context)
    validateUniqueIds(vault.candidates, 'candidates', context)
    const entriesById = new Map(vault.entries.map((entry) => [entry.id, entry]))
    vault.entries.forEach((entry, index) => {
      for (const contradictedId of entry.contradictsMemoryIds) {
        const contradicted = entriesById.get(contradictedId)
        if (!contradicted) {
          context.addIssue({
            code: 'custom',
            message: `Unknown contradicted memory: ${contradictedId}`,
            path: ['entries', index, 'contradictsMemoryIds']
          })
        } else if (
          entry.scope.kind !== contradicted.scope.kind ||
          entry.scope.targetId !== contradicted.scope.targetId
        ) {
          context.addIssue({
            code: 'custom',
            message: `Contradicted memory uses another scope: ${contradictedId}`,
            path: ['entries', index, 'contradictsMemoryIds']
          })
        } else if (
          contradicted.status !== 'superseded' ||
          contradicted.supersededByMemoryId !== entry.id
        ) {
          context.addIssue({
            code: 'custom',
            message: `Contradicted memory does not reference its replacement: ${contradictedId}`,
            path: ['entries', index, 'contradictsMemoryIds']
          })
        }
      }
      if (entry.supersededByMemoryId && !entriesById.has(entry.supersededByMemoryId)) {
        context.addIssue({
          code: 'custom',
          message: `Unknown replacement memory: ${entry.supersededByMemoryId}`,
          path: ['entries', index, 'supersededByMemoryId']
        })
      }
    })
    vault.candidates.forEach((candidate, index) => {
      if (candidate.promotedMemoryId && !entriesById.has(candidate.promotedMemoryId)) {
        context.addIssue({
          code: 'custom',
          message: `Unknown promoted memory: ${candidate.promotedMemoryId}`,
          path: ['candidates', index, 'promotedMemoryId']
        })
      }
    })
  })

export type BarkosMemoryScope = z.infer<typeof barkosMemoryScopeSchema>
export type BarkosMemoryCandidate = z.infer<typeof barkosMemoryCandidateSchema>
export type BarkosMemoryEntry = z.infer<typeof barkosMemoryEntrySchema>
export type BarkosMemoryVault = z.infer<typeof barkosMemoryVaultSchema>

function validateUniqueIds(
  values: readonly { id: string }[],
  path: 'entries' | 'candidates',
  context: z.RefinementCtx
): void {
  const ids = new Set<string>()
  values.forEach((value, index) => {
    if (ids.has(value.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate ${path} id: ${value.id}`,
        path: [path, index]
      })
    }
    ids.add(value.id)
  })
}

export function parseBarkosMemoryVault(value: unknown): BarkosMemoryVault {
  return barkosMemoryVaultSchema.parse(value)
}

export function parseBarkosMemoryVaultForCompany(
  value: unknown,
  company: BarkosCompany
): BarkosMemoryVault {
  const vault = parseBarkosMemoryVault(value)
  if (vault.companyId !== company.id || vault.companyCreatedAt !== company.createdAt) {
    throw new Error('BarkOS memory vault does not match the active company generation')
  }
  return vault
}

export function createEmptyBarkosMemoryVault(
  companyId: string,
  companyCreatedAt: number,
  now = Date.now()
): BarkosMemoryVault {
  return parseBarkosMemoryVault({
    schemaVersion: BARKOS_MEMORY_VAULT_SCHEMA_VERSION,
    companyId,
    companyCreatedAt,
    entries: [],
    candidates: [],
    revision: 0,
    createdAt: now,
    updatedAt: now
  })
}

export function nextBarkosMemoryVaultRevision(
  vault: BarkosMemoryVault,
  changes: Pick<BarkosMemoryVault, 'entries' | 'candidates'>,
  now: number
): BarkosMemoryVault {
  return parseBarkosMemoryVault({
    ...vault,
    ...changes,
    revision: vault.revision + 1,
    updatedAt: Math.max(now, vault.updatedAt + 1)
  })
}
