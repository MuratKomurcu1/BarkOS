import { z } from 'zod'

export { BARKOS_REMOTE_USAGE_COST_RUNTIME_CAPABILITY } from '../protocol-version'

export const BARKOS_REMOTE_USAGE_COST_VERSION = 1 as const
export const BARKOS_REMOTE_USAGE_COST_METHOD = 'barkos.usageCost.collect' as const
export const BARKOS_REMOTE_USAGE_COST_MAX_DISPATCHES = 1_000

const boundedIdSchema = z.string().trim().min(1).max(512)
const timestampSchema = z.number().int().nonnegative()
const tokenCountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const nullableTokenCountSchema = tokenCountSchema.nullable()

export const barkosRemoteUsageCostUnavailableReasonSchema = z.enum([
  'dispatch-not-found',
  'dispatch-not-finished',
  'execution-owner-mismatch',
  'execution-not-local-to-host',
  'terminal-identity-missing',
  'provider-unsupported',
  'provider-session-missing',
  'usage-not-enabled',
  'scan-failed',
  'session-not-found',
  'shared-provider-session',
  'workspace-mismatch',
  'session-outside-dispatch-window'
])

export const barkosRemoteUsageCostRequestSchema = z
  .object({
    version: z.literal(BARKOS_REMOTE_USAGE_COST_VERSION),
    orchestrationDispatchIds: z.array(boundedIdSchema).max(BARKOS_REMOTE_USAGE_COST_MAX_DISPATCHES)
  })
  .strict()
  .superRefine((request, context) => {
    const seen = new Set<string>()
    request.orchestrationDispatchIds.forEach((dispatchId, index) => {
      if (seen.has(dispatchId)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate remote usage dispatch: ${dispatchId}`,
          path: ['orchestrationDispatchIds', index]
        })
      }
      seen.add(dispatchId)
    })
  })

const knownRecordSchema = z
  .object({
    status: z.literal('known'),
    orchestrationDispatchId: boundedIdSchema,
    workspaceId: boundedIdSchema,
    provider: z.enum(['claude', 'codex']),
    providerSessionId: boundedIdSchema,
    model: z.string().trim().min(1).max(160).nullable(),
    inputTokens: tokenCountSchema,
    outputTokens: tokenCountSchema,
    cacheReadTokens: nullableTokenCountSchema,
    cacheWriteTokens: nullableTokenCountSchema,
    reasoningOutputTokens: nullableTokenCountSchema,
    totalTokens: tokenCountSchema,
    estimatedCostMicrousd: nullableTokenCountSchema,
    estimatedCostSource: z.literal('api-equivalent').nullable(),
    attribution: z.literal('exclusive-provider-session'),
    periodStartedAt: timestampSchema,
    periodEndedAt: timestampSchema,
    collectedAt: timestampSchema
  })
  .strict()
  .superRefine((record, context) => {
    if ((record.estimatedCostMicrousd === null) !== (record.estimatedCostSource === null)) {
      context.addIssue({ code: 'custom', message: 'Cost estimate and source must be paired' })
    }
    if (record.periodEndedAt < record.periodStartedAt) {
      context.addIssue({ code: 'custom', message: 'Usage period cannot end before it starts' })
    }
  })

const unavailableRecordSchema = z
  .object({
    status: z.literal('unavailable'),
    orchestrationDispatchId: boundedIdSchema,
    reason: barkosRemoteUsageCostUnavailableReasonSchema,
    detail: z.string().trim().min(1).max(500).nullable(),
    collectedAt: timestampSchema
  })
  .strict()

export const barkosRemoteUsageCostRecordSchema = z.discriminatedUnion('status', [
  knownRecordSchema,
  unavailableRecordSchema
])

export const barkosRemoteUsageCostResponseSchema = z
  .object({
    version: z.literal(BARKOS_REMOTE_USAGE_COST_VERSION),
    runtimeId: boundedIdSchema,
    records: z.array(barkosRemoteUsageCostRecordSchema).max(BARKOS_REMOTE_USAGE_COST_MAX_DISPATCHES)
  })
  .strict()
  .superRefine((response, context) => {
    const seen = new Set<string>()
    response.records.forEach((record, index) => {
      if (seen.has(record.orchestrationDispatchId)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate remote usage record: ${record.orchestrationDispatchId}`,
          path: ['records', index, 'orchestrationDispatchId']
        })
      }
      seen.add(record.orchestrationDispatchId)
    })
  })

export type BarkosRemoteUsageCostRequest = z.infer<typeof barkosRemoteUsageCostRequestSchema>
export type BarkosRemoteUsageCostRecord = z.infer<typeof barkosRemoteUsageCostRecordSchema>
export type BarkosRemoteUsageCostResponse = z.infer<typeof barkosRemoteUsageCostResponseSchema>
export type BarkosRemoteUsageCostUnavailableReason = z.infer<
  typeof barkosRemoteUsageCostUnavailableReasonSchema
>

export function parseBarkosRemoteUsageCostRequest(value: unknown): BarkosRemoteUsageCostRequest {
  return barkosRemoteUsageCostRequestSchema.parse(value)
}

export function parseBarkosRemoteUsageCostResponse(value: unknown): BarkosRemoteUsageCostResponse {
  return barkosRemoteUsageCostResponseSchema.parse(value)
}
