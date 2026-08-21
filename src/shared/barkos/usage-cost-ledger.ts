import { z } from 'zod'
import { barkosEntityIdSchema, type BarkosCompany } from './company'

export const BARKOS_USAGE_COST_LEDGER_SCHEMA_VERSION = 1 as const
export const BARKOS_MAX_USAGE_COST_RECORDS = 6_000

const timestampSchema = z.number().int().nonnegative()
const tokenCountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const boundedIdSchema = z.string().trim().min(1).max(512)
const nullableTokenCountSchema = tokenCountSchema.nullable()

export const barkosUsageCostUnavailableReasonSchema = z.enum([
  'provider-unsupported',
  'remote-usage-unavailable',
  'provider-session-missing',
  'usage-not-enabled',
  'scan-failed',
  'session-not-found',
  'shared-provider-session',
  'workspace-mismatch',
  'session-outside-dispatch-window'
])

export const barkosUsageCostRecordSchema = z
  .object({
    dispatchId: barkosEntityIdSchema,
    taskId: barkosEntityIdSchema,
    workerId: barkosEntityIdSchema,
    provider: z.enum(['claude', 'codex']).nullable(),
    status: z.enum(['known', 'unavailable']),
    providerSessionId: boundedIdSchema.nullable(),
    model: z.string().trim().min(1).max(160).nullable(),
    inputTokens: nullableTokenCountSchema,
    outputTokens: nullableTokenCountSchema,
    cacheReadTokens: nullableTokenCountSchema,
    cacheWriteTokens: nullableTokenCountSchema,
    reasoningOutputTokens: nullableTokenCountSchema,
    totalTokens: nullableTokenCountSchema,
    estimatedCostMicrousd: nullableTokenCountSchema,
    estimatedCostSource: z.literal('api-equivalent').nullable(),
    attribution: z.literal('exclusive-provider-session').nullable(),
    unavailableReason: barkosUsageCostUnavailableReasonSchema.nullable(),
    detail: z.string().trim().min(1).max(500).nullable(),
    periodStartedAt: timestampSchema.nullable(),
    periodEndedAt: timestampSchema.nullable(),
    collectedAt: timestampSchema
  })
  .strict()
  .superRefine((record, context) => {
    const requiredKnownValues = [
      record.provider,
      record.providerSessionId,
      record.inputTokens,
      record.outputTokens,
      record.totalTokens,
      record.attribution,
      record.periodStartedAt,
      record.periodEndedAt
    ]
    if (record.status === 'known' && requiredKnownValues.some((value) => value === null)) {
      context.addIssue({ code: 'custom', message: 'Known usage requires complete attribution' })
    }
    if (record.status === 'known' && record.unavailableReason !== null) {
      context.addIssue({ code: 'custom', message: 'Known usage cannot have an unavailable reason' })
    }
    if (record.status === 'unavailable') {
      const forbiddenValues = [
        record.model,
        record.inputTokens,
        record.outputTokens,
        record.cacheReadTokens,
        record.cacheWriteTokens,
        record.reasoningOutputTokens,
        record.totalTokens,
        record.estimatedCostMicrousd,
        record.estimatedCostSource,
        record.attribution,
        record.periodStartedAt,
        record.periodEndedAt
      ]
      if (record.unavailableReason === null || forbiddenValues.some((value) => value !== null)) {
        context.addIssue({ code: 'custom', message: 'Unavailable usage must not contain totals' })
      }
    }
    if ((record.estimatedCostMicrousd === null) !== (record.estimatedCostSource === null)) {
      context.addIssue({ code: 'custom', message: 'Cost estimate and source must be paired' })
    }
    if (
      record.periodStartedAt !== null &&
      record.periodEndedAt !== null &&
      record.periodEndedAt < record.periodStartedAt
    ) {
      context.addIssue({ code: 'custom', message: 'Usage period cannot end before it starts' })
    }
  })

export const barkosUsageCostLedgerSchema = z
  .object({
    schemaVersion: z.literal(BARKOS_USAGE_COST_LEDGER_SCHEMA_VERSION),
    companyId: barkosEntityIdSchema,
    companyCreatedAt: timestampSchema,
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    records: z.array(barkosUsageCostRecordSchema).max(BARKOS_MAX_USAGE_COST_RECORDS),
    createdAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .strict()
  .superRefine((ledger, context) => {
    const dispatchIds = new Set<string>()
    ledger.records.forEach((record, index) => {
      if (dispatchIds.has(record.dispatchId)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate usage-cost record: ${record.dispatchId}`,
          path: ['records', index, 'dispatchId']
        })
      }
      dispatchIds.add(record.dispatchId)
    })
    if (ledger.updatedAt < ledger.createdAt) {
      context.addIssue({ code: 'custom', message: 'updatedAt must not precede createdAt' })
    }
  })

export const barkosUsageCostCandidateSchema = z
  .object({
    dispatchId: barkosEntityIdSchema,
    orchestrationDispatchId: boundedIdSchema.nullable(),
    providerSessionId: boundedIdSchema.nullable()
  })
  .strict()

export const barkosUsageCostSyncRequestSchema = z
  .object({
    candidates: z.array(barkosUsageCostCandidateSchema).max(BARKOS_MAX_USAGE_COST_RECORDS)
  })
  .strict()
  .superRefine((request, context) => {
    const dispatchIds = new Set<string>()
    request.candidates.forEach((candidate, index) => {
      if (dispatchIds.has(candidate.dispatchId)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate usage-cost candidate: ${candidate.dispatchId}`,
          path: ['candidates', index, 'dispatchId']
        })
      }
      dispatchIds.add(candidate.dispatchId)
    })
  })

export type BarkosUsageCostUnavailableReason = z.infer<
  typeof barkosUsageCostUnavailableReasonSchema
>
export type BarkosUsageCostRecord = z.infer<typeof barkosUsageCostRecordSchema>
export type BarkosUsageCostLedger = z.infer<typeof barkosUsageCostLedgerSchema>
export type BarkosUsageCostCandidate = z.infer<typeof barkosUsageCostCandidateSchema>
export type BarkosUsageCostSyncRequest = z.infer<typeof barkosUsageCostSyncRequestSchema>

export function createEmptyBarkosUsageCostLedger(
  companyId: string,
  companyCreatedAt: number,
  now = Date.now()
): BarkosUsageCostLedger {
  return barkosUsageCostLedgerSchema.parse({
    schemaVersion: BARKOS_USAGE_COST_LEDGER_SCHEMA_VERSION,
    companyId,
    companyCreatedAt,
    revision: 0,
    records: [],
    createdAt: now,
    updatedAt: now
  })
}

export function parseBarkosUsageCostLedgerForCompany(
  value: unknown,
  company: BarkosCompany
): BarkosUsageCostLedger {
  const ledger = barkosUsageCostLedgerSchema.parse(value)
  if (ledger.companyId !== company.id || ledger.companyCreatedAt !== company.createdAt) {
    throw new Error('Usage-cost ledger does not match the active company generation')
  }
  return ledger
}

export function parseBarkosUsageCostSyncRequest(value: unknown): BarkosUsageCostSyncRequest {
  return barkosUsageCostSyncRequestSchema.parse(value)
}

export function replaceBarkosUsageCostRecords(args: {
  ledger: BarkosUsageCostLedger
  records: BarkosUsageCostRecord[]
  now?: number
}): BarkosUsageCostLedger {
  return barkosUsageCostLedgerSchema.parse({
    ...args.ledger,
    revision: args.ledger.revision + 1,
    records: args.records.toSorted((left, right) => right.collectedAt - left.collectedAt),
    updatedAt: Math.max(args.now ?? Date.now(), args.ledger.updatedAt + 1)
  })
}

export function summarizeBarkosUsageCosts(ledger: BarkosUsageCostLedger): {
  knownDispatches: number
  unavailableDispatches: number
  totalTokens: number
  estimatedCostMicrousd: number | null
  estimatedDispatches: number
} {
  let totalTokens = 0
  let estimatedCostMicrousd = 0
  let estimatedDispatches = 0
  for (const record of ledger.records) {
    if (record.status !== 'known') {
      continue
    }
    totalTokens += record.totalTokens ?? 0
    if (record.estimatedCostMicrousd !== null) {
      estimatedCostMicrousd += record.estimatedCostMicrousd
      estimatedDispatches += 1
    }
  }
  return {
    knownDispatches: ledger.records.filter((record) => record.status === 'known').length,
    unavailableDispatches: ledger.records.filter((record) => record.status === 'unavailable')
      .length,
    totalTokens,
    estimatedCostMicrousd: estimatedDispatches > 0 ? estimatedCostMicrousd : null,
    estimatedDispatches
  }
}
