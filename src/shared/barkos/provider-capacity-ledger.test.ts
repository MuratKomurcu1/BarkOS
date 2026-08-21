import { describe, expect, it } from 'vitest'
import { createBarkosCompany } from './company'
import {
  createEmptyBarkosProviderCapacityLedger,
  recoverInterruptedBarkosProviderFailovers,
  upsertBarkosProviderFailoverAudit
} from './provider-capacity-ledger'
import {
  appendBarkosProviderFailoverSelection,
  createBarkosProviderFailoverAudit
} from './provider-failover-policy'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship dependable work.',
  leadName: 'Ada',
  now: 1
})

function interruptedAudit() {
  return appendBarkosProviderFailoverSelection({
    audit: createBarkosProviderFailoverAudit({
      id: 'failover-build',
      taskId: 'build-release',
      assignmentId: 'assignment-build',
      dispatchId: 'dispatch-build',
      workerId: company.leadWorkerId,
      provider: 'codex',
      executionHostId: 'local',
      runtimeLane: { kind: 'host' },
      now: 3
    }),
    account: {
      provider: 'codex',
      accountId: 'account-b',
      executionHostId: 'local',
      runtimeLane: { kind: 'host' }
    },
    conversationMode: 'unknown',
    now: 4
  })
}

describe('BarkOS provider capacity failover persistence', () => {
  it('inserts and replaces one audit with one ledger revision per barrier', () => {
    const empty = createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 2)
    const inserted = upsertBarkosProviderFailoverAudit({
      ledger: empty,
      company,
      audit: interruptedAudit(),
      now: 5
    })
    const replacement = {
      ...inserted.failovers[0],
      updatedAt: 6
    }
    const replaced = upsertBarkosProviderFailoverAudit({
      ledger: inserted,
      company,
      audit: replacement,
      now: 6
    })

    expect(inserted).toMatchObject({ revision: 1, failovers: [{ id: 'failover-build' }] })
    expect(replaced).toMatchObject({ revision: 2, failovers: [{ updatedAt: 6 }] })
    expect(replaced.failovers).toHaveLength(1)
  })

  it('freezes every interrupted selected attempt once after restart', () => {
    const ledger = upsertBarkosProviderFailoverAudit({
      ledger: createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 2),
      company,
      audit: interruptedAudit(),
      now: 5
    })
    const recovered = recoverInterruptedBarkosProviderFailovers({ ledger, company, now: 10 })
    const repeated = recoverInterruptedBarkosProviderFailovers({
      ledger: recovered.ledger,
      company,
      now: 11
    })

    expect(recovered.changed).toBe(true)
    expect(recovered.ledger).toMatchObject({
      revision: 2,
      failovers: [
        {
          state: 'uncertain',
          stopReason: 'ambiguous-side-effect',
          attempts: [{ outcome: 'uncertain', settledAt: 10 }]
        }
      ]
    })
    expect(repeated).toEqual({ ledger: recovered.ledger, changed: false })
  })
})
