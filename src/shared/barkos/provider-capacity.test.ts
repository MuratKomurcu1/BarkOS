import { describe, expect, it } from 'vitest'
import { createBarkosCompany } from './company'
import {
  createEmptyBarkosProviderCapacityLedger,
  parseBarkosProviderCapacityLedgerForCompany,
  replaceBarkosProviderCapacityObservations
} from './provider-capacity-ledger'
import { barkosProviderCapacityLedgerSchema } from './provider-capacity'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Route work through bounded provider capacity.',
  leadName: 'Ada',
  now: 1
})

describe('BarkOS provider capacity ledger', () => {
  it('creates a company-generation-scoped empty ledger', () => {
    expect(createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 2)).toEqual({
      schemaVersion: 1,
      companyId: company.id,
      companyCreatedAt: company.createdAt,
      revision: 0,
      accounts: [],
      failovers: [],
      createdAt: 2,
      updatedAt: 2
    })
  })

  it('replaces observations through one optimistic revision', () => {
    const current = createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 2)
    const updated = replaceBarkosProviderCapacityObservations({
      ledger: current,
      company,
      accounts: [
        {
          account: {
            provider: 'codex',
            accountId: 'account-a',
            executionHostId: 'local',
            runtimeLane: { kind: 'host' }
          },
          active: true,
          status: 'available',
          reason: 'within-limits',
          usedPercent: 12,
          resetsAt: 100,
          retryAt: null,
          sourceUpdatedAt: 3,
          observedAt: 3
        }
      ],
      now: 3
    })

    expect(updated).toMatchObject({ revision: 1, updatedAt: 3 })
    expect(updated.accounts).toHaveLength(1)
  })

  it('rejects duplicate account scopes and unknown workers', () => {
    const current = createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 2)
    const observation = {
      account: {
        provider: 'codex' as const,
        accountId: null,
        executionHostId: 'local' as const,
        runtimeLane: { kind: 'host' as const }
      },
      active: true,
      status: 'unknown' as const,
      reason: 'missing-snapshot' as const,
      usedPercent: null,
      resetsAt: null,
      retryAt: null,
      sourceUpdatedAt: null,
      observedAt: 2
    }
    expect(() =>
      barkosProviderCapacityLedgerSchema.parse({
        ...current,
        accounts: [observation, observation]
      })
    ).toThrow('Duplicate provider account')

    expect(() =>
      parseBarkosProviderCapacityLedgerForCompany(
        {
          ...current,
          failovers: [
            {
              id: 'failover-one',
              taskId: 'task-one',
              assignmentId: 'assignment-one',
              dispatchId: 'dispatch-one',
              workerId: 'missing-worker',
              provider: 'codex',
              executionHostId: 'local',
              runtimeLane: { kind: 'host' },
              attemptCeiling: 3,
              attempts: [],
              state: 'active',
              stopReason: null,
              createdAt: 2,
              updatedAt: 2
            }
          ]
        },
        company
      )
    ).toThrow('unknown worker')
  })

  it('rejects credential-like account identifiers', () => {
    const current = createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 2)
    expect(() =>
      barkosProviderCapacityLedgerSchema.parse({
        ...current,
        accounts: [
          {
            account: {
              provider: 'codex',
              accountId: 'api_key=super-secret-value',
              executionHostId: 'local',
              runtimeLane: { kind: 'host' }
            },
            active: true,
            status: 'unknown',
            reason: 'missing-snapshot',
            usedPercent: null,
            resetsAt: null,
            retryAt: null,
            sourceUpdatedAt: null,
            observedAt: 2
          }
        ]
      })
    ).toThrow('resembles a credential')
  })
})
