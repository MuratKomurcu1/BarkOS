import {
  BARKOS_MAX_FAILOVER_ATTEMPTS,
  barkosProviderAccountKey,
  barkosProviderFailoverAuditSchema,
  barkosProviderRuntimeLanesEqual,
  type BarkosProvider,
  type BarkosProviderAccountRef,
  type BarkosProviderCapacityObservation,
  type BarkosProviderFailoverAudit,
  type BarkosProviderFailoverAttempt,
  type BarkosProviderRuntimeLane
} from './provider-capacity'
import type { ExecutionHostId } from '../execution-host'

export type BarkosFailoverSelection =
  | { status: 'selected'; account: BarkosProviderAccountRef }
  | {
      status: 'stopped'
      reason: 'attempt-ceiling' | 'all-cooling-down' | 'no-eligible-account'
      retryAt: number | null
    }

function observationWakeAt(
  observation: BarkosProviderCapacityObservation,
  now: number
): number | null {
  const candidates = [observation.retryAt, observation.resetsAt].filter(
    (value): value is number => value !== null && value > now
  )
  return candidates.length > 0 ? Math.min(...candidates) : null
}

function accountMatchesScope(
  observation: BarkosProviderCapacityObservation,
  provider: BarkosProvider,
  executionHostId: ExecutionHostId,
  runtimeLane: BarkosProviderRuntimeLane
): boolean {
  return (
    observation.account.provider === provider &&
    observation.account.executionHostId === executionHostId &&
    barkosProviderRuntimeLanesEqual(observation.account.runtimeLane, runtimeLane)
  )
}

export function selectBarkosFailoverAccount(args: {
  accounts: readonly BarkosProviderCapacityObservation[]
  provider: BarkosProvider
  executionHostId: ExecutionHostId
  runtimeLane: BarkosProviderRuntimeLane
  triedAccountKeys: ReadonlySet<string>
  attemptCount: number
  attemptCeiling: number
  now?: number
}): BarkosFailoverSelection {
  if (
    args.attemptCount >= Math.min(Math.max(args.attemptCeiling, 1), BARKOS_MAX_FAILOVER_ATTEMPTS)
  ) {
    return { status: 'stopped', reason: 'attempt-ceiling', retryAt: null }
  }
  const now = args.now ?? Date.now()
  const scoped = args.accounts.filter(
    (observation) =>
      accountMatchesScope(observation, args.provider, args.executionHostId, args.runtimeLane) &&
      !args.triedAccountKeys.has(barkosProviderAccountKey(observation.account))
  )
  const eligible = scoped
    .filter((observation) => observation.status === 'available')
    .toSorted((left, right) => {
      if (left.active !== right.active) {
        return left.active ? -1 : 1
      }
      const usageDifference = (left.usedPercent ?? 101) - (right.usedPercent ?? 101)
      return (
        usageDifference ||
        barkosProviderAccountKey(left.account).localeCompare(
          barkosProviderAccountKey(right.account)
        )
      )
    })
  const selected = eligible[0]
  if (selected) {
    return { status: 'selected', account: selected.account }
  }

  const cooling = scoped.map((observation) => observationWakeAt(observation, now))
  if (scoped.length > 0 && cooling.every((wakeAt) => wakeAt !== null)) {
    return {
      status: 'stopped',
      reason: 'all-cooling-down',
      retryAt: Math.min(...cooling.filter((wakeAt): wakeAt is number => wakeAt !== null))
    }
  }
  return { status: 'stopped', reason: 'no-eligible-account', retryAt: null }
}

export function createBarkosProviderFailoverAudit(args: {
  id: string
  taskId: string
  assignmentId: string
  dispatchId: string
  workerId: string
  provider: BarkosProvider
  executionHostId: ExecutionHostId
  runtimeLane: BarkosProviderRuntimeLane
  attemptCeiling?: number
  now?: number
}): BarkosProviderFailoverAudit {
  const now = args.now ?? Date.now()
  const { now: _now, ...identity } = args
  return barkosProviderFailoverAuditSchema.parse({
    ...identity,
    attemptCeiling: args.attemptCeiling ?? BARKOS_MAX_FAILOVER_ATTEMPTS,
    attempts: [],
    state: 'active',
    stopReason: null,
    createdAt: now,
    updatedAt: now
  })
}

export function appendBarkosProviderFailoverSelection(args: {
  audit: BarkosProviderFailoverAudit
  account: BarkosProviderAccountRef
  conversationMode: BarkosProviderFailoverAttempt['conversationMode']
  sourceOrchestrationDispatchId?: string
  now?: number
}): BarkosProviderFailoverAudit {
  const audit = barkosProviderFailoverAuditSchema.parse(args.audit)
  if (audit.state !== 'active' || audit.attempts.at(-1)?.outcome === 'selected') {
    throw new Error('BarkOS failover audit is not ready for another selection')
  }
  if (audit.attempts.length >= audit.attemptCeiling) {
    throw new Error('BarkOS failover attempt ceiling reached')
  }
  const key = barkosProviderAccountKey(args.account)
  if (audit.attempts.some((attempt) => barkosProviderAccountKey(attempt.account) === key)) {
    throw new Error('BarkOS failover cannot retry the same account')
  }
  const now = args.now ?? Date.now()
  return barkosProviderFailoverAuditSchema.parse({
    ...audit,
    attempts: [
      ...audit.attempts,
      {
        sequence: audit.attempts.length + 1,
        account: args.account,
        outcome: 'selected',
        conversationMode: args.conversationMode,
        reason: 'selected-by-policy',
        ...(args.sourceOrchestrationDispatchId
          ? { sourceOrchestrationDispatchId: args.sourceOrchestrationDispatchId }
          : {}),
        startedAt: now,
        settledAt: null
      }
    ],
    updatedAt: Math.max(now, audit.updatedAt + 1)
  })
}

type SettledAttemptOutcome = Exclude<BarkosProviderFailoverAttempt['outcome'], 'selected'>
type SettledAttemptReason = Exclude<BarkosProviderFailoverAttempt['reason'], 'selected-by-policy'>

export function settleBarkosProviderFailoverAttempt(args: {
  audit: BarkosProviderFailoverAudit
  outcome: SettledAttemptOutcome
  reason: SettledAttemptReason
  conversationMode?: BarkosProviderFailoverAttempt['conversationMode']
  replacementOrchestrationDispatchId?: string
  now?: number
}): BarkosProviderFailoverAudit {
  const audit = barkosProviderFailoverAuditSchema.parse(args.audit)
  const latest = audit.attempts.at(-1)
  if (audit.state !== 'active' || !latest || latest.outcome !== 'selected') {
    throw new Error('BarkOS failover has no selected attempt to settle')
  }
  const now = args.now ?? Date.now()
  const attempts = [
    ...audit.attempts.slice(0, -1),
    {
      ...latest,
      outcome: args.outcome,
      reason: args.reason,
      ...(args.conversationMode ? { conversationMode: args.conversationMode } : {}),
      ...(args.replacementOrchestrationDispatchId
        ? { replacementOrchestrationDispatchId: args.replacementOrchestrationDispatchId }
        : {}),
      settledAt: now
    }
  ]
  const terminal = terminalStateForOutcome(args.outcome, attempts.length, audit.attemptCeiling)
  return barkosProviderFailoverAuditSchema.parse({
    ...audit,
    attempts,
    ...terminal,
    updatedAt: Math.max(now, audit.updatedAt + 1)
  })
}

function terminalStateForOutcome(
  outcome: SettledAttemptOutcome,
  attemptCount: number,
  attemptCeiling: number
): Pick<BarkosProviderFailoverAudit, 'state' | 'stopReason'> {
  if (outcome === 'succeeded') {
    return { state: 'succeeded', stopReason: 'completed' }
  }
  if (outcome === 'uncertain') {
    return { state: 'uncertain', stopReason: 'ambiguous-side-effect' }
  }
  return attemptCount >= attemptCeiling
    ? { state: 'stopped', stopReason: 'attempt-ceiling' }
    : { state: 'active', stopReason: null }
}

export function stopBarkosProviderFailoverAudit(args: {
  audit: BarkosProviderFailoverAudit
  reason: 'attempt-ceiling' | 'all-cooling-down' | 'no-eligible-account'
  now?: number
}): BarkosProviderFailoverAudit {
  const audit = barkosProviderFailoverAuditSchema.parse(args.audit)
  if (audit.state !== 'active' || audit.attempts.at(-1)?.outcome === 'selected') {
    throw new Error('BarkOS failover audit cannot stop with an unsettled attempt')
  }
  const now = args.now ?? Date.now()
  return barkosProviderFailoverAuditSchema.parse({
    ...audit,
    state: 'stopped',
    stopReason: args.reason,
    updatedAt: Math.max(now, audit.updatedAt + 1)
  })
}
