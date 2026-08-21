import { describe, expect, it, vi } from 'vitest'
import { createBarkosCompany } from './company'
import type { BarkosProviderCapacityLedger } from './provider-capacity'
import {
  createEmptyBarkosProviderCapacityLedger,
  recoverInterruptedBarkosProviderFailovers
} from './provider-capacity-ledger'
import { executeBarkosCodexLocalAccountMutation } from './provider-account-failover-executor'
import { createBarkosProviderFailoverAudit } from './provider-failover-policy'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship dependable work.',
  leadName: 'Ada',
  now: 1
})

const targetAccount = {
  provider: 'codex' as const,
  accountId: 'account-b',
  executionHostId: 'local' as const,
  runtimeLane: { kind: 'host' as const }
}

function capacityLedger(): BarkosProviderCapacityLedger {
  return {
    ...createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 1),
    accounts: [
      {
        account: {
          ...targetAccount,
          accountId: 'account-a'
        },
        active: true,
        status: 'limited',
        reason: 'usage-exhausted',
        usedPercent: 100,
        resetsAt: 100,
        retryAt: null,
        sourceUpdatedAt: 2,
        observedAt: 2
      },
      {
        account: targetAccount,
        active: false,
        status: 'available',
        reason: 'within-limits',
        usedPercent: 10,
        resetsAt: null,
        retryAt: null,
        sourceUpdatedAt: 2,
        observedAt: 2
      }
    ]
  }
}

function audit() {
  return createBarkosProviderFailoverAudit({
    id: 'failover-build',
    taskId: 'build-release',
    assignmentId: 'assignment-build',
    dispatchId: 'dispatch-build',
    workerId: company.leadWorkerId,
    provider: 'codex',
    executionHostId: 'local',
    runtimeLane: { kind: 'host' },
    now: 3
  })
}

function clock() {
  let value = 3
  return (): number => ++value
}

describe('BarkOS Codex local account mutation executor', () => {
  it('persists selection before applying an exact account mutation', async () => {
    const events: string[] = []
    const persisted: BarkosProviderCapacityLedger[] = []
    const result = await executeBarkosCodexLocalAccountMutation({
      company,
      ledger: capacityLedger(),
      audit: audit(),
      account: targetAccount,
      persist: async (ledger) => {
        events.push('persist')
        persisted.push(ledger)
        return ledger
      },
      mutate: async () => {
        events.push('mutate')
        return 'account-b'
      },
      readback: async () => {
        events.push('readback')
        return 'account-b'
      },
      now: clock()
    })

    expect(events).toEqual(['persist', 'mutate', 'readback'])
    expect(persisted[0].failovers[0].attempts[0]).toMatchObject({
      account: targetAccount,
      outcome: 'selected',
      conversationMode: 'unknown',
      settledAt: null
    })
    expect(result).toMatchObject({ status: 'applied', audit: { state: 'active' } })
  })

  it('freezes a successful mutation response when authoritative readback fails', async () => {
    const result = await executeBarkosCodexLocalAccountMutation({
      company,
      ledger: capacityLedger(),
      audit: audit(),
      account: targetAccount,
      persist: async (ledger) => ledger,
      mutate: async () => 'account-b',
      readback: async () => {
        throw new Error('readback-timeout')
      },
      now: clock()
    })

    expect(result).toMatchObject({
      status: 'uncertain',
      audit: {
        state: 'uncertain',
        stopReason: 'ambiguous-side-effect',
        attempts: [{ outcome: 'uncertain' }]
      }
    })
  })

  it('records a proven non-application and leaves the bounded chain retryable', async () => {
    const persisted: BarkosProviderCapacityLedger[] = []
    const result = await executeBarkosCodexLocalAccountMutation({
      company,
      ledger: capacityLedger(),
      audit: audit(),
      account: targetAccount,
      persist: async (ledger) => {
        persisted.push(ledger)
        return ledger
      },
      mutate: async () => {
        throw new Error('selection-failed')
      },
      readback: async () => 'account-a',
      now: clock()
    })

    expect(persisted).toHaveLength(2)
    expect(result).toMatchObject({
      status: 'not-applied',
      audit: {
        state: 'active',
        attempts: [{ outcome: 'failed', reason: 'execution-failed' }]
      }
    })
  })

  it('freezes the chain when neither the mutation nor readback is knowable', async () => {
    const result = await executeBarkosCodexLocalAccountMutation({
      company,
      ledger: capacityLedger(),
      audit: audit(),
      account: targetAccount,
      persist: async (ledger) => ledger,
      mutate: async () => {
        throw new Error('selection-timeout')
      },
      readback: async () => {
        throw new Error('readback-timeout')
      },
      now: clock()
    })

    expect(result).toMatchObject({
      status: 'uncertain',
      audit: {
        state: 'uncertain',
        stopReason: 'ambiguous-side-effect',
        attempts: [{ outcome: 'uncertain' }]
      }
    })
  })

  it('never mutates the account when the first durability barrier fails', async () => {
    const mutate = vi.fn()
    await expect(
      executeBarkosCodexLocalAccountMutation({
        company,
        ledger: capacityLedger(),
        audit: audit(),
        account: targetAccount,
        persist: async () => {
          throw new Error('disk-full')
        },
        mutate,
        readback: vi.fn(),
        now: clock()
      })
    ).rejects.toThrow('disk-full')
    expect(mutate).not.toHaveBeenCalled()
  })

  it('leaves a recoverable selected record if post-mutation settlement cannot persist', async () => {
    const persisted: BarkosProviderCapacityLedger[] = []
    await expect(
      executeBarkosCodexLocalAccountMutation({
        company,
        ledger: capacityLedger(),
        audit: audit(),
        account: targetAccount,
        persist: async (ledger) => {
          persisted.push(ledger)
          if (persisted.length === 2) {
            throw new Error('disk-full')
          }
          return ledger
        },
        mutate: async () => {
          throw new Error('selection-timeout')
        },
        readback: async () => {
          throw new Error('readback-timeout')
        },
        now: clock()
      })
    ).rejects.toThrow('disk-full')

    const recovery = recoverInterruptedBarkosProviderFailovers({
      ledger: persisted[0],
      company,
      now: 20
    })
    expect(recovery.ledger.failovers[0]).toMatchObject({ state: 'uncertain' })
  })
})
