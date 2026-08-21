import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBarkosCompany } from '../../shared/barkos/company'
import {
  createEmptyBarkosProviderCapacityLedger,
  replaceBarkosProviderCapacityObservations,
  upsertBarkosProviderFailoverAudit
} from '../../shared/barkos/provider-capacity-ledger'
import {
  appendBarkosProviderFailoverSelection,
  createBarkosProviderFailoverAudit
} from '../../shared/barkos/provider-failover-policy'
import {
  BARKOS_PROVIDER_CAPACITY_SNAPSHOT_MAX_BYTES,
  BarkosProviderCapacityStore,
  BarkosProviderCapacityStoreError
} from './provider-capacity-store'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship reliable work.',
  leadName: 'Ada',
  now: 1
})

let userDataPath: string

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'barkos-provider-capacity-'))
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

function nextLedger() {
  const empty = createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 1)
  return replaceBarkosProviderCapacityObservations({
    ledger: empty,
    company,
    accounts: [],
    now: 2
  })
}

describe('BarkOS provider capacity store', () => {
  it('stores private durable snapshots and enforces revisions', () => {
    const store = new BarkosProviderCapacityStore(userDataPath)
    expect(store.load(company)).toBeNull()
    const saved = store.save(nextLedger(), company)
    expect(store.load(company)).toEqual(saved)

    const snapshotPath = join(
      userDataPath,
      'barkos',
      'provider-capacity-ledgers',
      `${company.id}.json`
    )
    if (process.platform !== 'win32') {
      expect(statSync(snapshotPath).mode & 0o777).toBe(0o600)
    }
    expect(captureStoreError(() => store.save(saved, company)).code).toBe('snapshot-conflict')
  })

  it('resets capacity state for a new company generation', () => {
    const store = new BarkosProviderCapacityStore(userDataPath)
    store.save(nextLedger(), company)
    const recreated = { ...company, createdAt: 10, updatedAt: 10 }

    expect(store.load(recreated)).toMatchObject({
      companyCreatedAt: 10,
      revision: 0,
      accounts: [],
      failovers: []
    })
  })

  it('recovers an interrupted failover selection once on process restart', () => {
    const writer = new BarkosProviderCapacityStore(userDataPath)
    const selected = appendBarkosProviderFailoverSelection({
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
    const persisted = upsertBarkosProviderFailoverAudit({
      ledger: createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 1),
      company,
      audit: selected,
      now: 4
    })
    writer.save(persisted, company)

    const reader = new BarkosProviderCapacityStore(userDataPath)
    const recovered = reader.load(company)

    expect(recovered).toMatchObject({
      revision: persisted.revision + 1,
      failovers: [{ state: 'uncertain', stopReason: 'ambiguous-side-effect' }]
    })
    expect(reader.load(company)).toEqual(recovered)
  })

  it('rejects future, malformed, and oversized snapshots', () => {
    const store = new BarkosProviderCapacityStore(userDataPath)
    store.save(nextLedger(), company)
    const snapshotPath = join(
      userDataPath,
      'barkos',
      'provider-capacity-ledgers',
      `${company.id}.json`
    )
    const current = JSON.parse(readFileSync(snapshotPath, 'utf8'))
    writeFileSync(snapshotPath, JSON.stringify({ ...current, schemaVersion: 999 }))
    expect(captureStoreError(() => store.load(company)).code).toBe('snapshot-version-unsupported')

    writeFileSync(snapshotPath, '{invalid')
    expect(captureStoreError(() => store.load(company)).code).toBe('snapshot-invalid')

    writeFileSync(snapshotPath, 'x'.repeat(BARKOS_PROVIDER_CAPACITY_SNAPSHOT_MAX_BYTES + 1))
    expect(captureStoreError(() => store.load(company)).code).toBe('snapshot-too-large')
  })
})

function captureStoreError(action: () => unknown): BarkosProviderCapacityStoreError {
  try {
    action()
  } catch (error) {
    if (error instanceof BarkosProviderCapacityStoreError) {
      return error
    }
    throw error
  }
  throw new Error('Expected BarkosProviderCapacityStoreError')
}
