import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBarkosCompany } from '../../shared/barkos/company'
import {
  createDefaultBarkosControlPolicy,
  updateBarkosControlPolicy
} from '../../shared/barkos/control-policy'
import {
  BARKOS_CONTROL_POLICY_SNAPSHOT_MAX_BYTES,
  BarkosControlPolicyStore,
  BarkosControlPolicyStoreError
} from './control-policy-store'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship reliable work.',
  leadName: 'Ada',
  now: 1
})

let userDataPath: string

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'barkos-control-policy-'))
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

describe('BarkOS control policy store', () => {
  it('stores private snapshots and enforces optimistic revisions', () => {
    const store = new BarkosControlPolicyStore(userDataPath)
    const initial = createDefaultBarkosControlPolicy(company.id, company.createdAt, 1)
    expect(store.load(company)).toBeNull()
    expect(store.save(initial, company)).toEqual(initial)
    const updated = updateBarkosControlPolicy({
      policy: initial,
      updates: {
        executionState: 'paused',
        maxConcurrentDispatches: 3,
        maxActiveAssignmentsPerWorker: 1,
        maxDispatchesPerObjective: 50
      },
      now: 2
    })
    expect(store.save(updated, company)).toEqual(updated)
    expect(store.load(company)).toEqual(updated)

    const snapshotPath = join(userDataPath, 'barkos', 'control-policies', `${company.id}.json`)
    if (process.platform !== 'win32') {
      expect(statSync(snapshotPath).mode & 0o777).toBe(0o600)
    }
    expect(captureStoreError(() => store.save(updated, company)).code).toBe('snapshot-conflict')
  })

  it('resets policy for a recreated company generation', () => {
    const store = new BarkosControlPolicyStore(userDataPath)
    store.save(createDefaultBarkosControlPolicy(company.id, company.createdAt, 1), company)
    const recreated = { ...company, createdAt: 10, updatedAt: 10 }
    expect(store.load(recreated)).toMatchObject({
      companyCreatedAt: 10,
      executionState: 'running',
      revision: 0
    })
  })

  it('rejects future, malformed, and oversized snapshots', () => {
    const store = new BarkosControlPolicyStore(userDataPath)
    store.save(createDefaultBarkosControlPolicy(company.id, company.createdAt, 1), company)
    const snapshotPath = join(userDataPath, 'barkos', 'control-policies', `${company.id}.json`)
    const current = JSON.parse(readFileSync(snapshotPath, 'utf8'))
    writeFileSync(snapshotPath, JSON.stringify({ ...current, schemaVersion: 999 }))
    expect(captureStoreError(() => store.load(company)).code).toBe('snapshot-version-unsupported')

    writeFileSync(snapshotPath, '{invalid')
    expect(captureStoreError(() => store.load(company)).code).toBe('snapshot-invalid')

    writeFileSync(snapshotPath, 'x'.repeat(BARKOS_CONTROL_POLICY_SNAPSHOT_MAX_BYTES + 1))
    expect(captureStoreError(() => store.load(company)).code).toBe('snapshot-too-large')
  })
})

function captureStoreError(action: () => unknown): BarkosControlPolicyStoreError {
  try {
    action()
  } catch (error) {
    if (error instanceof BarkosControlPolicyStoreError) {
      return error
    }
    throw error
  }
  throw new Error('Expected BarkosControlPolicyStoreError')
}
