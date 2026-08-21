import { describe, expect, it } from 'vitest'
import type { BarkosCompany } from './company'
import {
  barkosUsageCostLedgerSchema,
  createEmptyBarkosUsageCostLedger,
  parseBarkosUsageCostLedgerForCompany,
  replaceBarkosUsageCostRecords,
  summarizeBarkosUsageCosts,
  type BarkosUsageCostRecord
} from './usage-cost-ledger'

const company = {
  id: 'barkos-labs',
  createdAt: 10
} as BarkosCompany

function knownRecord(dispatchId = 'dispatch-one'): BarkosUsageCostRecord {
  return {
    dispatchId,
    taskId: 'task-one',
    workerId: 'worker-one',
    provider: 'codex',
    status: 'known',
    providerSessionId: 'session-one',
    model: 'gpt-5.6-terra',
    inputTokens: 1_000,
    outputTokens: 200,
    cacheReadTokens: 500,
    cacheWriteTokens: null,
    reasoningOutputTokens: 50,
    totalTokens: 1_250,
    estimatedCostMicrousd: 5_000,
    estimatedCostSource: 'api-equivalent',
    attribution: 'exclusive-provider-session',
    unavailableReason: null,
    detail: null,
    periodStartedAt: 20,
    periodEndedAt: 30,
    collectedAt: 40
  }
}

describe('BarkOS usage-cost ledger', () => {
  it('keeps provider totals separate from an explicitly sourced cost estimate', () => {
    const ledger = replaceBarkosUsageCostRecords({
      ledger: createEmptyBarkosUsageCostLedger(company.id, company.createdAt, 10),
      records: [knownRecord()],
      now: 40
    })

    expect(summarizeBarkosUsageCosts(ledger)).toEqual({
      knownDispatches: 1,
      unavailableDispatches: 0,
      totalTokens: 1_250,
      estimatedCostMicrousd: 5_000,
      estimatedDispatches: 1
    })
    expect('executionUnits' in ledger.records[0]).toBe(false)
  })

  it('rejects unavailable records that smuggle totals or estimates', () => {
    const record = {
      ...knownRecord(),
      status: 'unavailable',
      unavailableReason: 'shared-provider-session'
    }
    const result = barkosUsageCostLedgerSchema.safeParse({
      ...createEmptyBarkosUsageCostLedger(company.id, company.createdAt),
      records: [record]
    })

    expect(result.success).toBe(false)
  })

  it('rejects duplicate Dispatch records and a different company generation', () => {
    const ledger = {
      ...createEmptyBarkosUsageCostLedger(company.id, company.createdAt),
      records: [knownRecord(), knownRecord()]
    }
    expect(barkosUsageCostLedgerSchema.safeParse(ledger).success).toBe(false)
    expect(() =>
      parseBarkosUsageCostLedgerForCompany(
        createEmptyBarkosUsageCostLedger(company.id, 11),
        company
      )
    ).toThrow('generation')
  })
})
