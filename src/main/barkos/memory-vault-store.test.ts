import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBarkosCompany } from '../../shared/barkos/company'
import { createEmptyBarkosMemoryVault } from '../../shared/barkos/memory-vault'
import {
  BARKOS_MEMORY_VAULT_SNAPSHOT_MAX_BYTES,
  BarkosMemoryVaultStore,
  BarkosMemoryVaultStoreError
} from './memory-vault-store'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship reliable systems.',
  leadName: 'Ada',
  now: 1
})
let userDataPath: string

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'barkos-memory-vault-'))
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

function nextVault() {
  return {
    ...createEmptyBarkosMemoryVault(company.id, company.createdAt, 1),
    revision: 1,
    updatedAt: 2
  }
}

describe('BarkOS memory vault store', () => {
  it('stores private durable snapshots and enforces revisions', () => {
    const store = new BarkosMemoryVaultStore(userDataPath)
    expect(store.load(company)).toBeNull()
    const saved = store.save(nextVault(), company)
    expect(store.load(company)).toEqual(saved)
    const snapshotPath = join(userDataPath, 'barkos', 'memory-vaults', `${company.id}.json`)
    if (process.platform !== 'win32') {
      expect(statSync(snapshotPath).mode & 0o777).toBe(0o600)
    }
    expect(captureStoreError(() => store.save(saved, company)).code).toBe('snapshot-conflict')
  })

  it('resets memory for a new company generation', () => {
    const store = new BarkosMemoryVaultStore(userDataPath)
    store.save(nextVault(), company)
    const recreated = { ...company, createdAt: 10, updatedAt: 10 }
    expect(store.load(recreated)).toMatchObject({
      companyCreatedAt: 10,
      revision: 0,
      entries: [],
      candidates: []
    })
  })

  it('rejects future, malformed, and oversized snapshots', () => {
    const store = new BarkosMemoryVaultStore(userDataPath)
    store.save(nextVault(), company)
    const snapshotPath = join(userDataPath, 'barkos', 'memory-vaults', `${company.id}.json`)
    const current = JSON.parse(readFileSync(snapshotPath, 'utf8'))
    writeFileSync(snapshotPath, JSON.stringify({ ...current, schemaVersion: 999 }))
    expect(captureStoreError(() => store.load(company)).code).toBe('snapshot-version-unsupported')
    writeFileSync(snapshotPath, '{invalid')
    expect(captureStoreError(() => store.load(company)).code).toBe('snapshot-invalid')
    writeFileSync(snapshotPath, 'x'.repeat(BARKOS_MEMORY_VAULT_SNAPSHOT_MAX_BYTES + 1))
    expect(captureStoreError(() => store.load(company)).code).toBe('snapshot-too-large')
  })
})

function captureStoreError(action: () => unknown): BarkosMemoryVaultStoreError {
  try {
    action()
  } catch (error) {
    if (error instanceof BarkosMemoryVaultStoreError) {
      return error
    }
    throw error
  }
  throw new Error('Expected BarkosMemoryVaultStoreError')
}
