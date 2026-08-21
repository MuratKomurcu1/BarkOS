import { z } from 'zod'
import type { BarkosCompany } from './company'
import { barkosEntityIdSchema } from './company'
import type { BarkosAssignment, BarkosDispatch, BarkosWorkLedger } from './work-ledger'

export const BARKOS_CONTROL_POLICY_SCHEMA_VERSION = 1 as const
export const BARKOS_DEFAULT_MAX_CONCURRENT_DISPATCHES = 4
export const BARKOS_DEFAULT_MAX_ACTIVE_ASSIGNMENTS_PER_WORKER = 2
export const BARKOS_DEFAULT_MAX_DISPATCHES_PER_OBJECTIVE = 100

const timestampSchema = z.number().int().nonnegative()

export const barkosControlPolicySchema = z
  .object({
    schemaVersion: z.literal(BARKOS_CONTROL_POLICY_SCHEMA_VERSION),
    companyId: barkosEntityIdSchema,
    companyCreatedAt: timestampSchema,
    executionState: z.enum(['running', 'paused']),
    maxConcurrentDispatches: z.number().int().min(1).max(100),
    maxActiveAssignmentsPerWorker: z.number().int().min(1).max(100),
    maxDispatchesPerObjective: z.number().int().min(1).max(10_000),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    createdAt: timestampSchema,
    updatedAt: timestampSchema
  })
  .strict()
  .superRefine((policy, context) => {
    if (policy.updatedAt < policy.createdAt) {
      context.addIssue({
        code: 'custom',
        message: 'updatedAt must not be earlier than createdAt',
        path: ['updatedAt']
      })
    }
  })

export type BarkosControlPolicy = z.infer<typeof barkosControlPolicySchema>

export type BarkosControlPolicyUpdates = Pick<
  BarkosControlPolicy,
  | 'executionState'
  | 'maxConcurrentDispatches'
  | 'maxActiveAssignmentsPerWorker'
  | 'maxDispatchesPerObjective'
>

export type BarkosDispatchControlDecision =
  | {
      allowed: true
      activeDispatches: number
      objectiveDispatches: number
    }
  | {
      allowed: false
      reason: 'paused' | 'concurrency-limit' | 'objective-budget-exhausted' | 'scope-mismatch'
      activeDispatches: number
      objectiveDispatches: number
    }

const ACTIVE_ASSIGNMENT_STATUSES = new Set<BarkosAssignment['status']>([
  'proposed',
  'approved',
  'dispatched'
])
const ACTIVE_DISPATCH_STATES = new Set<BarkosDispatch['state']>([
  'prepared',
  'requested',
  'running'
])

export function createDefaultBarkosControlPolicy(
  companyId: string,
  companyCreatedAt: number,
  now = Date.now()
): BarkosControlPolicy {
  return barkosControlPolicySchema.parse({
    schemaVersion: BARKOS_CONTROL_POLICY_SCHEMA_VERSION,
    companyId,
    companyCreatedAt,
    executionState: 'running',
    maxConcurrentDispatches: BARKOS_DEFAULT_MAX_CONCURRENT_DISPATCHES,
    maxActiveAssignmentsPerWorker: BARKOS_DEFAULT_MAX_ACTIVE_ASSIGNMENTS_PER_WORKER,
    maxDispatchesPerObjective: BARKOS_DEFAULT_MAX_DISPATCHES_PER_OBJECTIVE,
    revision: 0,
    createdAt: now,
    updatedAt: now
  })
}

export function parseBarkosControlPolicy(value: unknown): BarkosControlPolicy {
  return barkosControlPolicySchema.parse(value)
}

export function parseBarkosControlPolicyForCompany(
  value: unknown,
  company: BarkosCompany
): BarkosControlPolicy {
  const policy = parseBarkosControlPolicy(value)
  if (policy.companyId !== company.id || policy.companyCreatedAt !== company.createdAt) {
    throw new Error('BarkOS control policy does not match the active company generation')
  }
  return policy
}

export function updateBarkosControlPolicy(args: {
  policy: BarkosControlPolicy
  updates: BarkosControlPolicyUpdates
  now?: number
}): BarkosControlPolicy {
  return parseBarkosControlPolicy({
    ...args.policy,
    ...args.updates,
    revision: args.policy.revision + 1,
    updatedAt: Math.max(args.now ?? Date.now(), args.policy.updatedAt + 1)
  })
}

export function countActiveBarkosAssignmentsForWorker(
  assignments: readonly BarkosAssignment[],
  workerId: string
): number {
  return assignments.filter(
    (assignment) =>
      assignment.workerId === workerId && ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)
  ).length
}

export function evaluateBarkosDispatchControl(args: {
  policy: BarkosControlPolicy
  ledger: BarkosWorkLedger
  taskId: string
}): BarkosDispatchControlDecision {
  const task = args.ledger.plans
    .flatMap((plan) => plan.tasks)
    .find((entry) => entry.id === args.taskId)
  const activeDispatches = args.ledger.dispatches.filter((dispatch) =>
    ACTIVE_DISPATCH_STATES.has(dispatch.state)
  ).length
  const objectiveTaskIds = new Set(
    args.ledger.plans
      .flatMap((plan) => plan.tasks)
      .filter((entry) => entry.objectiveId === task?.objectiveId)
      .map((entry) => entry.id)
  )
  const objectiveDispatches = args.ledger.dispatches.filter((dispatch) =>
    objectiveTaskIds.has(dispatch.taskId)
  ).length

  if (args.policy.companyId !== args.ledger.companyId || !task) {
    return { allowed: false, reason: 'scope-mismatch', activeDispatches, objectiveDispatches }
  }
  if (args.policy.executionState === 'paused') {
    return { allowed: false, reason: 'paused', activeDispatches, objectiveDispatches }
  }
  if (activeDispatches >= args.policy.maxConcurrentDispatches) {
    return {
      allowed: false,
      reason: 'concurrency-limit',
      activeDispatches,
      objectiveDispatches
    }
  }
  if (objectiveDispatches >= args.policy.maxDispatchesPerObjective) {
    return {
      allowed: false,
      reason: 'objective-budget-exhausted',
      activeDispatches,
      objectiveDispatches
    }
  }
  return { allowed: true, activeDispatches, objectiveDispatches }
}
