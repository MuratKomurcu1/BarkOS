import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBarkosCompany, type BarkosCompany } from '../../shared/barkos/company'
import { createEmptyBarkosWorkLedger } from '../../shared/barkos/work-ledger'
import {
  BARKOS_WORK_LEDGER_SNAPSHOT_MAX_BYTES,
  BarkosWorkLedgerStore,
  BarkosWorkLedgerStoreError
} from './work-ledger-store'

function company(): BarkosCompany {
  return createBarkosCompany({
    name: 'BarkOS Labs',
    mission: 'Ship dependable systems.',
    leadName: 'Ada',
    now: 1
  })
}

function snapshotPath(userDataPath: string): string {
  return join(userDataPath, 'barkos', 'work-ledgers', 'barkos-labs.json')
}

function captureStoreError(action: () => unknown): BarkosWorkLedgerStoreError {
  try {
    action()
  } catch (error) {
    if (error instanceof BarkosWorkLedgerStoreError) {
      return error
    }
    throw error
  }
  throw new Error('Expected BarkosWorkLedgerStoreError')
}

let userDataPath: string

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'barkos-work-ledger-store-'))
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

describe('BarkOS work-ledger store', () => {
  it('returns null before the company has a ledger', () => {
    expect(new BarkosWorkLedgerStore(userDataPath).load(company())).toBeNull()
  })

  it('round-trips a validated ledger through a company-scoped private file', () => {
    const store = new BarkosWorkLedgerStore(userDataPath)
    const ledger = createEmptyBarkosWorkLedger(company().id, 2)

    expect(store.save(ledger, company())).toEqual(ledger)
    expect(store.load(company())).toEqual(ledger)
    if (process.platform !== 'win32') {
      expect(statSync(snapshotPath(userDataPath)).mode & 0o777).toBe(0o600)
    }
  })

  it('migrates version zero and keeps a private pre-migration backup', () => {
    const store = new BarkosWorkLedgerStore(userDataPath)
    const current = createEmptyBarkosWorkLedger(company().id, 2)
    const { approvalGates: _approvalGates, revision: _revision, ...withoutGates } = current
    const legacy = { ...withoutGates, schemaVersion: 0 }
    store.save(current, company())
    writeFileSync(snapshotPath(userDataPath), JSON.stringify(legacy), 'utf8')

    expect(store.load(company())).toEqual(current)
    const backupPath = join(
      userDataPath,
      'barkos',
      'migration-backups',
      'barkos-labs-work-ledger-v0-before-v5.json'
    )
    expect(JSON.parse(readFileSync(backupPath, 'utf8'))).toEqual(legacy)
    if (process.platform !== 'win32') {
      expect(statSync(backupPath).mode & 0o777).toBe(0o600)
    }
  })

  it('rejects future versions without rewriting them', () => {
    const store = new BarkosWorkLedgerStore(userDataPath)
    const current = createEmptyBarkosWorkLedger(company().id, 2)
    const future = { ...current, schemaVersion: 99 }
    store.save(current, company())
    writeFileSync(snapshotPath(userDataPath), JSON.stringify(future), 'utf8')

    expect(captureStoreError(() => store.load(company())).code).toBe('snapshot-version-unsupported')
    expect(JSON.parse(readFileSync(snapshotPath(userDataPath), 'utf8'))).toEqual(future)
  })

  it('rejects invalid and foreign-company values without replacing valid state', () => {
    const store = new BarkosWorkLedgerStore(userDataPath)
    const current = createEmptyBarkosWorkLedger(company().id, 2)
    store.save(current, company())

    expect(() => store.save({ ...current, companyId: 'other-company' }, company())).toThrow()
    expect(() => store.save({ ...current, providerToken: 'secret' }, company())).toThrow()
    expect(store.load(company())).toEqual(current)
    expect(readFileSync(snapshotPath(userDataPath), 'utf8')).not.toContain('secret')
  })

  it('rejects stale concurrent writes with optimistic revisions', () => {
    const store = new BarkosWorkLedgerStore(userDataPath)
    const initial = createEmptyBarkosWorkLedger(company().id, 2)
    store.save(initial, company())
    const revisionOne = { ...initial, revision: 1, updatedAt: 3 }
    store.save(revisionOne, company())

    expect(captureStoreError(() => store.save(revisionOne, company())).code).toBe(
      'snapshot-conflict'
    )
    expect(store.load(company())).toEqual(revisionOne)
  })

  it('rejects oversized snapshots before reading them into memory', () => {
    const store = new BarkosWorkLedgerStore(userDataPath)
    store.save(createEmptyBarkosWorkLedger(company().id, 2), company())
    writeFileSync(
      snapshotPath(userDataPath),
      'x'.repeat(BARKOS_WORK_LEDGER_SNAPSHOT_MAX_BYTES + 1),
      'utf8'
    )

    expect(captureStoreError(() => store.load(company())).code).toBe('snapshot-too-large')
  })
})
