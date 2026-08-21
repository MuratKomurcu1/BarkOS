import { z } from 'zod'
import type { ExecutionHostId } from '../execution-host'
import { parseExecutionHostId } from '../execution-host'
import { barkosEntityIdSchema } from './company'
import { containsBarkosCredentialLikeContent } from './memory-content-policy'

export const BARKOS_PROVIDER_CAPACITY_SCHEMA_VERSION = 1 as const
export const BARKOS_MAX_PROVIDER_ACCOUNTS = 256
export const BARKOS_MAX_FAILOVER_AUDITS = 512
export const BARKOS_MAX_FAILOVER_ATTEMPTS = 3

const timestampSchema = z.number().int().nonnegative()
const opaqueIdSchema = z.string().trim().min(1).max(512)
const executionHostIdSchema = z
  .string()
  .trim()
  .max(512)
  .refine((value): value is ExecutionHostId => parseExecutionHostId(value) !== null, {
    message: 'Invalid execution host ID'
  })

export const barkosProviderSchema = z.enum([
  'claude',
  'codex',
  'gemini',
  'opencode-go',
  'kimi',
  'minimax',
  'grok',
  'antigravity'
])

export const barkosProviderRuntimeLaneSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('host') }).strict(),
  z.object({ kind: z.literal('wsl'), distro: opaqueIdSchema }).strict()
])

export const barkosProviderAccountRefSchema = z
  .object({
    provider: barkosProviderSchema,
    accountId: opaqueIdSchema.nullable(),
    executionHostId: executionHostIdSchema,
    runtimeLane: barkosProviderRuntimeLaneSchema
  })
  .strict()
  .superRefine((account, context) => {
    if (account.accountId && containsBarkosCredentialLikeContent(account.accountId)) {
      context.addIssue({ code: 'custom', message: 'Provider account ID resembles a credential' })
    }
  })

export const barkosProviderCapacityObservationSchema = z
  .object({
    account: barkosProviderAccountRefSchema,
    active: z.boolean(),
    status: z.enum(['available', 'limited', 'cooldown', 'unavailable', 'unknown']),
    reason: z.enum([
      'within-limits',
      'usage-exhausted',
      'provider-retry-after',
      'missing-credentials',
      'stale-credentials',
      'provider-error',
      'usage-unavailable',
      'missing-snapshot',
      'refreshing',
      'stale-snapshot',
      'usage-unknown'
    ]),
    usedPercent: z.number().min(0).max(100).nullable(),
    resetsAt: timestampSchema.nullable(),
    retryAt: timestampSchema.nullable(),
    sourceUpdatedAt: timestampSchema.nullable(),
    observedAt: timestampSchema
  })
  .strict()
  .superRefine((observation, context) => {
    const allowedReasons = {
      available: ['within-limits'],
      limited: ['usage-exhausted', 'provider-retry-after'],
      cooldown: ['provider-retry-after'],
      unavailable: [
        'missing-credentials',
        'stale-credentials',
        'provider-error',
        'usage-unavailable'
      ],
      unknown: ['missing-snapshot', 'refreshing', 'stale-snapshot', 'usage-unknown']
    } as const
    if (!(allowedReasons[observation.status] as readonly string[]).includes(observation.reason)) {
      context.addIssue({ code: 'custom', message: 'Capacity status and reason do not match' })
    }
  })

export const barkosProviderFailoverAttemptSchema = z
  .object({
    sequence: z.number().int().min(1).max(BARKOS_MAX_FAILOVER_ATTEMPTS),
    account: barkosProviderAccountRefSchema,
    outcome: z.enum(['selected', 'limited', 'unavailable', 'failed', 'succeeded', 'uncertain']),
    conversationMode: z.enum(['same-conversation', 'new-session', 'unsupported', 'unknown']),
    reason: z.enum([
      'selected-by-policy',
      'usage-exhausted',
      'provider-retry-after',
      'provider-unavailable',
      'execution-failed',
      'completed',
      'ambiguous-side-effect'
    ]),
    sourceOrchestrationDispatchId: opaqueIdSchema.optional(),
    replacementOrchestrationDispatchId: opaqueIdSchema.optional(),
    startedAt: timestampSchema,
    settledAt: timestampSchema.nullable()
  })
  .strict()
  .superRefine((attempt, context) => {
    if ((attempt.outcome === 'selected') !== (attempt.settledAt === null)) {
      context.addIssue({ code: 'custom', message: 'Only selected attempts remain unsettled' })
    }
    if (attempt.settledAt !== null && attempt.settledAt < attempt.startedAt) {
      context.addIssue({ code: 'custom', message: 'Attempt cannot settle before it starts' })
    }
    const allowedReasons = {
      selected: ['selected-by-policy'],
      limited: ['usage-exhausted', 'provider-retry-after'],
      unavailable: ['provider-unavailable'],
      failed: ['execution-failed'],
      succeeded: ['completed'],
      uncertain: ['ambiguous-side-effect']
    } as const
    if (!(allowedReasons[attempt.outcome] as readonly string[]).includes(attempt.reason)) {
      context.addIssue({ code: 'custom', message: 'Attempt outcome and reason do not match' })
    }
    if (attempt.replacementOrchestrationDispatchId && !attempt.sourceOrchestrationDispatchId) {
      context.addIssue({
        code: 'custom',
        message: 'Replacement Dispatch identity requires its source identity'
      })
    }
  })

export const barkosProviderFailoverAuditSchema = z
  .object({
    id: barkosEntityIdSchema,
    taskId: barkosEntityIdSchema,
    assignmentId: barkosEntityIdSchema,
    dispatchId: barkosEntityIdSchema,
    workerId: barkosEntityIdSchema,
    provider: barkosProviderSchema,
    executionHostId: executionHostIdSchema,
    runtimeLane: barkosProviderRuntimeLaneSchema,
    attemptCeiling: z.number().int().min(1).max(BARKOS_MAX_FAILOVER_ATTEMPTS),
    attempts: z.array(barkosProviderFailoverAttemptSchema).max(BARKOS_MAX_FAILOVER_ATTEMPTS),
    state: z.enum(['active', 'succeeded', 'stopped', 'uncertain']),
    stopReason: z
      .enum([
        'attempt-ceiling',
        'all-cooling-down',
        'no-eligible-account',
        'ambiguous-side-effect',
        'completed'
      ])
      .nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .strict()
  .superRefine((audit, context) => {
    if (audit.attempts.length > audit.attemptCeiling) {
      context.addIssue({ code: 'custom', message: 'Failover attempts exceed the ceiling' })
    }
    const accountKeys = new Set<string>()
    audit.attempts.forEach((attempt, index) => {
      if (attempt.sequence !== index + 1) {
        context.addIssue({ code: 'custom', message: 'Failover attempt sequence is not contiguous' })
      }
      const key = barkosProviderAccountKey(attempt.account)
      if (accountKeys.has(key)) {
        context.addIssue({ code: 'custom', message: 'Failover cannot retry the same account' })
      }
      accountKeys.add(key)
      if (
        attempt.account.provider !== audit.provider ||
        attempt.account.executionHostId !== audit.executionHostId ||
        !barkosProviderRuntimeLanesEqual(attempt.account.runtimeLane, audit.runtimeLane)
      ) {
        context.addIssue({ code: 'custom', message: 'Failover attempt crosses its provider scope' })
      }
    })
    validateFailoverTerminalState(audit, context)
    if (audit.updatedAt < audit.createdAt) {
      context.addIssue({ code: 'custom', message: 'Failover audit cannot update before creation' })
    }
  })

export const barkosProviderCapacityLedgerSchema = z
  .object({
    schemaVersion: z.literal(BARKOS_PROVIDER_CAPACITY_SCHEMA_VERSION),
    companyId: barkosEntityIdSchema,
    companyCreatedAt: timestampSchema,
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    accounts: z.array(barkosProviderCapacityObservationSchema).max(BARKOS_MAX_PROVIDER_ACCOUNTS),
    failovers: z.array(barkosProviderFailoverAuditSchema).max(BARKOS_MAX_FAILOVER_AUDITS),
    createdAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .strict()
  .superRefine((ledger, context) => {
    const accountKeys = new Set<string>()
    ledger.accounts.forEach((observation) => {
      const key = barkosProviderAccountKey(observation.account)
      if (accountKeys.has(key)) {
        context.addIssue({ code: 'custom', message: `Duplicate provider account: ${key}` })
      }
      accountKeys.add(key)
    })
    const auditIds = new Set<string>()
    ledger.failovers.forEach((audit) => {
      if (auditIds.has(audit.id)) {
        context.addIssue({ code: 'custom', message: `Duplicate failover audit: ${audit.id}` })
      }
      auditIds.add(audit.id)
    })
  })

export type BarkosProvider = z.infer<typeof barkosProviderSchema>
export type BarkosProviderRuntimeLane = z.infer<typeof barkosProviderRuntimeLaneSchema>
export type BarkosProviderAccountRef = z.infer<typeof barkosProviderAccountRefSchema>
export type BarkosProviderCapacityObservation = z.infer<
  typeof barkosProviderCapacityObservationSchema
>
export type BarkosProviderFailoverAttempt = z.infer<typeof barkosProviderFailoverAttemptSchema>
export type BarkosProviderFailoverAudit = z.infer<typeof barkosProviderFailoverAuditSchema>
export type BarkosProviderCapacityLedger = z.infer<typeof barkosProviderCapacityLedgerSchema>

function validateFailoverTerminalState(
  audit: {
    state: 'active' | 'succeeded' | 'stopped' | 'uncertain'
    stopReason:
      | 'attempt-ceiling'
      | 'all-cooling-down'
      | 'no-eligible-account'
      | 'ambiguous-side-effect'
      | 'completed'
      | null
    attempts: { outcome: string }[]
  },
  context: z.RefinementCtx
): void {
  const latest = audit.attempts.at(-1)
  if (audit.state === 'active' && audit.stopReason !== null) {
    context.addIssue({ code: 'custom', message: 'Active failover cannot have a stop reason' })
  }
  if (
    audit.state === 'succeeded' &&
    (audit.stopReason !== 'completed' || latest?.outcome !== 'succeeded')
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Successful failover requires a completed attempt'
    })
  }
  if (
    audit.state === 'uncertain' &&
    (audit.stopReason !== 'ambiguous-side-effect' || latest?.outcome !== 'uncertain')
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Uncertain failover requires an uncertain attempt'
    })
  }
  if (
    audit.state === 'stopped' &&
    (audit.stopReason === null ||
      audit.stopReason === 'completed' ||
      audit.stopReason === 'ambiguous-side-effect')
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Stopped failover requires a terminal stop reason'
    })
  }
}

export function barkosProviderRuntimeLanesEqual(
  left: BarkosProviderRuntimeLane,
  right: BarkosProviderRuntimeLane
): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === 'host' || (right.kind === 'wsl' && left.distro === right.distro))
  )
}

export function barkosProviderAccountKey(account: BarkosProviderAccountRef): string {
  const lane = account.runtimeLane.kind === 'host' ? 'host' : `wsl:${account.runtimeLane.distro}`
  return [account.provider, account.executionHostId, lane, account.accountId ?? 'system-default']
    .map(encodeURIComponent)
    .join(':')
}
