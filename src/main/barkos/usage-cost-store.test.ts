import { mkdtempSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createBarkosCompany } from '../../shared/barkos/company'
import {
  createEmptyBarkosUsageCostLedger,
  replaceBarkosUsageCostRecords
} from '../../shared/barkos/usage-cost-ledger'
import { BarkosUsageCostStore, BarkosUsageCostStoreError } from './usage-cost-store'

const cleanupPaths: string[] = []

function tempPath(): string {
  const path = mkdtempSync(join(tmpdir(), 'barkos-usage-cost-'))
  cleanupPaths.push(path)
  return path
}

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Keep accounting durable.',
  leadName: 'Ada',
  now: 10
})

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  )
})

describe('BarkosUsageCostStore', () => {
  it('persists a company-generation ledger with monotonic revisions', () => {
    const store = new BarkosUsageCostStore(tempPath())
    const initial = createEmptyBarkosUsageCostLedger(company.id, company.createdAt, 20)
    expect(store.save(initial, company)).toEqual(initial)

    const next = replaceBarkosUsageCostRecords({ ledger: initial, records: [], now: 21 })
    store.save(next, company)
    expect(store.load(company)).toEqual(next)
  })

  it('rejects a stale revision without overwriting the durable ledger', () => {
    const store = new BarkosUsageCostStore(tempPath())
    const initial = createEmptyBarkosUsageCostLedger(company.id, company.createdAt, 20)
    store.save(initial, company)

    expect(() => store.save({ ...initial, updatedAt: 30 }, company)).toThrow(
      BarkosUsageCostStoreError
    )
    expect(store.load(company)).toEqual(initial)
  })

  it('resets records when a company id is reused by a new generation', () => {
    const store = new BarkosUsageCostStore(tempPath())
    store.save(createEmptyBarkosUsageCostLedger(company.id, company.createdAt, 20), company)
    const replacement = { ...company, createdAt: 100, updatedAt: 100 }

    expect(store.load(replacement)).toMatchObject({
      companyId: company.id,
      companyCreatedAt: 100,
      revision: 0,
      records: []
    })
  })
})
