import { describe, expect, it } from 'vitest'
import type { BarkosProviderCapacityObservation } from './provider-capacity'
import { barkosProviderAccountKey } from './provider-capacity'
import {
  appendBarkosProviderFailoverSelection,
  createBarkosProviderFailoverAudit,
  selectBarkosFailoverAccount,
  settleBarkosProviderFailoverAttempt,
  stopBarkosProviderFailoverAudit
} from './provider-failover-policy'

function observation(args: {
  accountId: string
  status?: BarkosProviderCapacityObservation['status']
  usedPercent?: number | null
  active?: boolean
  executionHostId?: 'local' | `runtime:${string}`
  lane?: { kind: 'host' } | { kind: 'wsl'; distro: string }
  resetsAt?: number | null
}): BarkosProviderCapacityObservation {
  return {
    account: {
      provider: 'codex',
      accountId: args.accountId,
      executionHostId: args.executionHostId ?? 'local',
      runtimeLane: args.lane ?? { kind: 'host' }
    },
    active: args.active ?? false,
    status: args.status ?? 'available',
    reason: args.status === 'limited' ? 'usage-exhausted' : 'within-limits',
    usedPercent: args.usedPercent ?? 10,
    resetsAt: args.resetsAt ?? null,
    retryAt: null,
    sourceUpdatedAt: 10,
    observedAt: 10
  }
}

describe('BarkOS provider failover policy', () => {
  it('selects only within the exact provider host and runtime lane', () => {
    const local = observation({ accountId: 'local', usedPercent: 40 })
    const remote = observation({
      accountId: 'remote',
      usedPercent: 1,
      executionHostId: 'runtime:server-one'
    })
    const wsl = observation({
      accountId: 'wsl',
      usedPercent: 2,
      lane: { kind: 'wsl', distro: 'Ubuntu' }
    })
    expect(
      selectBarkosFailoverAccount({
        accounts: [remote, wsl, local],
        provider: 'codex',
        executionHostId: 'local',
        runtimeLane: { kind: 'host' },
        triedAccountKeys: new Set(),
        attemptCount: 0,
        attemptCeiling: 3,
        now: 10
      })
    ).toEqual({ status: 'selected', account: local.account })
  })

  it('never retries an account and stops at the attempt ceiling', () => {
    const first = observation({ accountId: 'first', usedPercent: 20 })
    const second = observation({ accountId: 'second', usedPercent: 30 })
    expect(
      selectBarkosFailoverAccount({
        accounts: [first, second],
        provider: 'codex',
        executionHostId: 'local',
        runtimeLane: { kind: 'host' },
        triedAccountKeys: new Set([barkosProviderAccountKey(first.account)]),
        attemptCount: 1,
        attemptCeiling: 3
      })
    ).toEqual({ status: 'selected', account: second.account })
    expect(
      selectBarkosFailoverAccount({
        accounts: [first, second],
        provider: 'codex',
        executionHostId: 'local',
        runtimeLane: { kind: 'host' },
        triedAccountKeys: new Set(),
        attemptCount: 3,
        attemptCeiling: 3
      })
    ).toEqual({ status: 'stopped', reason: 'attempt-ceiling', retryAt: null })
  })

  it('reports the earliest retry only when every remaining account is cooling down', () => {
    const now = 100
    const first = observation({ accountId: 'first', status: 'limited', resetsAt: 300 })
    const second = observation({ accountId: 'second', status: 'limited', resetsAt: 200 })
    expect(
      selectBarkosFailoverAccount({
        accounts: [first, second],
        provider: 'codex',
        executionHostId: 'local',
        runtimeLane: { kind: 'host' },
        triedAccountKeys: new Set(),
        attemptCount: 0,
        attemptCeiling: 3,
        now
      })
    ).toEqual({ status: 'stopped', reason: 'all-cooling-down', retryAt: 200 })
  })

  it('audits success and freezes an ambiguous side effect', () => {
    const selectedAccount = observation({ accountId: 'first' }).account
    const initial = createBarkosProviderFailoverAudit({
      id: 'failover-one',
      taskId: 'task-one',
      assignmentId: 'assignment-one',
      dispatchId: 'dispatch-one',
      workerId: 'ada',
      provider: 'codex',
      executionHostId: 'local',
      runtimeLane: { kind: 'host' },
      now: 1
    })
    const selected = appendBarkosProviderFailoverSelection({
      audit: initial,
      account: selectedAccount,
      conversationMode: 'same-conversation',
      now: 2
    })
    const uncertain = settleBarkosProviderFailoverAttempt({
      audit: selected,
      outcome: 'uncertain',
      reason: 'ambiguous-side-effect',
      now: 3
    })

    expect(uncertain).toMatchObject({
      state: 'uncertain',
      stopReason: 'ambiguous-side-effect',
      attempts: [{ sequence: 1, outcome: 'uncertain', settledAt: 3 }]
    })
    expect(() =>
      appendBarkosProviderFailoverSelection({
        audit: uncertain,
        account: observation({ accountId: 'second' }).account,
        conversationMode: 'new-session',
        now: 4
      })
    ).toThrow('not ready')
  })

  it('requires an explicit stop when no account can be selected', () => {
    const audit = createBarkosProviderFailoverAudit({
      id: 'failover-two',
      taskId: 'task-one',
      assignmentId: 'assignment-one',
      dispatchId: 'dispatch-one',
      workerId: 'ada',
      provider: 'codex',
      executionHostId: 'local',
      runtimeLane: { kind: 'host' },
      now: 1
    })
    expect(
      stopBarkosProviderFailoverAudit({
        audit,
        reason: 'no-eligible-account',
        now: 2
      })
    ).toMatchObject({ state: 'stopped', stopReason: 'no-eligible-account' })
  })
})
