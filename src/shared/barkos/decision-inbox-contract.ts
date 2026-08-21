import { z } from 'zod'
import type { BarkosCompany } from './company'
import { barkosEntityIdSchema } from './company'

export const BARKOS_DECISION_INBOX_SCHEMA_VERSION = 2 as const
export const BARKOS_MAX_DECISION_REQUESTS = 500

const timestampSchema = z.number().int().nonnegative()
const externalIdSchema = z.string().trim().min(1).max(512)
const requestIdSchema = z.string().trim().min(1).max(1_100)
export const barkosDecisionResponseSchema = z.string().trim().min(1).max(8_000)
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)

export const barkosSideEffectCategorySchema = z.enum(['destructive', 'external', 'budgeted'])

export const barkosSideEffectDecisionBindingSchema = z
  .object({
    categories: z.array(barkosSideEffectCategorySchema).min(1).max(3),
    toolName: z.string().trim().min(1).max(256),
    toolInputSha256: sha256Schema,
    summary: z.string().trim().min(1).max(2_000),
    paneKey: externalIdSchema,
    expiresAt: timestampSchema,
    consumedAt: timestampSchema.nullable()
  })
  .strict()

export const barkosDecisionRequestSchema = z
  .object({
    id: requestIdSchema,
    sourceKind: z.enum(['gate', 'question', 'decision_gate', 'escalation', 'side-effect']),
    status: z.enum(['pending', 'resolving', 'resolved', 'resolution-uncertain', 'expired']),
    resolutionKind: z.enum(['approved', 'rejected', 'answered']).nullable(),
    taskId: barkosEntityIdSchema,
    assignmentId: barkosEntityIdSchema.nullable(),
    dispatchId: barkosEntityIdSchema.nullable(),
    requestedByWorkerId: barkosEntityIdSchema.nullable(),
    risk: z.enum(['low', 'medium', 'high', 'critical']),
    executionHostId: externalIdSchema.nullable(),
    orchestrationRunId: externalIdSchema,
    orchestrationTaskId: externalIdSchema,
    orchestrationDispatchId: externalIdSchema.nullable(),
    orchestrationMessageId: externalIdSchema.nullable(),
    orchestrationGateId: externalIdSchema.nullable(),
    question: z.string().trim().min(1).max(12_000),
    details: z.string().trim().min(1).max(12_000).nullable(),
    options: z.array(z.string().trim().min(1).max(500)).max(30),
    priority: z.enum(['normal', 'high', 'urgent']),
    sideEffect: barkosSideEffectDecisionBindingSchema.nullable().optional(),
    proposedResolution: barkosDecisionResponseSchema.nullable(),
    resolution: barkosDecisionResponseSchema.nullable(),
    createdAt: timestampSchema,
    lastSeenAt: timestampSchema,
    resolvedAt: timestampSchema.nullable()
  })
  .strict()
  .superRefine((request, context) => {
    const isGate = request.sourceKind === 'gate'
    const isSideEffect = request.sourceKind === 'side-effect'
    const isMessage = !isGate && !isSideEffect
    if (isGate !== Boolean(request.orchestrationGateId)) {
      context.addIssue({
        code: 'custom',
        message: 'Gate requests require exactly one gate identifier',
        path: ['orchestrationGateId']
      })
    }
    if (isMessage !== Boolean(request.orchestrationMessageId)) {
      context.addIssue({
        code: 'custom',
        message: 'Message requests require exactly one message identifier',
        path: ['orchestrationMessageId']
      })
    }
    if (isSideEffect !== Boolean(request.sideEffect)) {
      context.addIssue({
        code: 'custom',
        message: 'Side-effect requests require exactly one action binding',
        path: ['sideEffect']
      })
    }
    if ((request.assignmentId === null) !== (request.dispatchId === null)) {
      context.addIssue({
        code: 'custom',
        message: 'Assignment and dispatch identities must be recorded together',
        path: ['dispatchId']
      })
    }
    if ((request.dispatchId === null) !== (request.orchestrationDispatchId === null)) {
      context.addIssue({
        code: 'custom',
        message: 'Local and orchestration dispatch identities must be recorded together',
        path: ['orchestrationDispatchId']
      })
    }
    if (request.lastSeenAt < request.createdAt) {
      context.addIssue({
        code: 'custom',
        message: 'Decision request cannot be seen before it was created',
        path: ['lastSeenAt']
      })
    }

    if (request.sideEffect) {
      if (request.sideEffect.expiresAt <= request.createdAt) {
        context.addIssue({
          code: 'custom',
          message: 'Side-effect approval must expire after it is created',
          path: ['sideEffect', 'expiresAt']
        })
      }
      if (
        request.sideEffect.consumedAt !== null &&
        (request.status !== 'resolved' ||
          request.resolutionKind !== 'approved' ||
          request.resolvedAt === null ||
          request.sideEffect.consumedAt < request.resolvedAt)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Only a resolved approval can be consumed',
          path: ['sideEffect', 'consumedAt']
        })
      }
    }

    const hasProposed = request.proposedResolution !== null
    const hasResolution = request.resolution !== null
    const hasResolutionKind = request.resolutionKind !== null
    const hasResolvedAt = request.resolvedAt !== null
    if (request.status === 'pending') {
      if (hasProposed || hasResolution || hasResolutionKind || hasResolvedAt) {
        context.addIssue({ code: 'custom', message: 'Open requests cannot contain a resolution' })
      }
    } else if (request.status === 'expired') {
      if (hasProposed || hasResolution || hasResolutionKind || !hasResolvedAt) {
        context.addIssue({ code: 'custom', message: 'Expired requests require a closing time' })
      }
    } else if (request.status === 'resolving' || request.status === 'resolution-uncertain') {
      if (!hasProposed || hasResolution || !hasResolutionKind || hasResolvedAt) {
        context.addIssue({
          code: 'custom',
          message: 'In-flight requests require only a proposed resolution'
        })
      }
    } else if (!hasProposed || !hasResolution || !hasResolutionKind || !hasResolvedAt) {
      context.addIssue({ code: 'custom', message: 'Resolved requests require complete audit data' })
    }
  })

export const barkosDecisionInboxSchema = z
  .object({
    schemaVersion: z.literal(BARKOS_DECISION_INBOX_SCHEMA_VERSION),
    companyId: barkosEntityIdSchema,
    companyCreatedAt: timestampSchema,
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    requests: z.array(barkosDecisionRequestSchema).max(BARKOS_MAX_DECISION_REQUESTS),
    createdAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .strict()
  .superRefine((snapshot, context) => {
    const ids = new Set<string>()
    snapshot.requests.forEach((request, index) => {
      if (ids.has(request.id)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate decision request: ${request.id}`,
          path: ['requests', index, 'id']
        })
      }
      ids.add(request.id)
    })
  })

export type BarkosDecisionRequest = z.infer<typeof barkosDecisionRequestSchema>
export type BarkosDecisionInbox = z.infer<typeof barkosDecisionInboxSchema>
export type BarkosDecisionResolutionKind = NonNullable<BarkosDecisionRequest['resolutionKind']>
export type BarkosSideEffectCategory = z.infer<typeof barkosSideEffectCategorySchema>

function migrateBarkosDecisionInbox(value: unknown): unknown {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 1
  ) {
    return value
  }
  return { ...(value as Record<string, unknown>), schemaVersion: 2 }
}

export function parseBarkosDecisionRequest(value: unknown): BarkosDecisionRequest {
  return barkosDecisionRequestSchema.parse(value)
}

export function parseBarkosDecisionInbox(value: unknown): BarkosDecisionInbox {
  return barkosDecisionInboxSchema.parse(migrateBarkosDecisionInbox(value))
}

export function createEmptyBarkosDecisionInbox(
  companyId: string,
  companyCreatedAt: number,
  now = Date.now()
): BarkosDecisionInbox {
  return parseBarkosDecisionInbox({
    schemaVersion: BARKOS_DECISION_INBOX_SCHEMA_VERSION,
    companyId,
    companyCreatedAt,
    revision: 0,
    requests: [],
    createdAt: now,
    updatedAt: now
  })
}

export function parseBarkosDecisionInboxForCompany(
  value: unknown,
  company: BarkosCompany
): BarkosDecisionInbox {
  const inbox = parseBarkosDecisionInbox(value)
  if (inbox.companyId !== company.id) {
    throw new Error('BarkOS decision inbox does not match the active company')
  }
  if (inbox.companyCreatedAt !== company.createdAt) {
    throw new Error('BarkOS decision inbox does not match the active company generation')
  }
  return inbox
}
