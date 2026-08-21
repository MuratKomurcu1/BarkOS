import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBarkosCompany, type BarkosCompany } from '../../shared/barkos/company'
import type { BarkosWorkerSessionBinding } from '../../shared/barkos/worker-session'
import {
  BARKOS_WORKER_SESSION_SNAPSHOT_MAX_BYTES,
  BarkosWorkerSessionStore,
  BarkosWorkerSessionStoreError
} from './worker-session-store'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship reliable work.',
  leadName: 'Ada',
  now: 1
})

function binding(overrides: Partial<BarkosWorkerSessionBinding> = {}): BarkosWorkerSessionBinding {
  return {
    workerId: company.leadWorkerId,
    agent: 'codex',
    targetId: '5:localworkspace-main',
    workspaceId: 'workspace-main',
    workspaceKind: 'worktree',
    executionHostId: 'local',
    tabId: 'tab-1',
    state: 'created',
    launchedAt: 2,
    ...overrides
  }
}

let userDataPath: string

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'barkos-worker-sessions-'))
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

describe('BarkOS worker session store', () => {
  it('returns null before the first binding and stores private strict snapshots', () => {
    const store = new BarkosWorkerSessionStore(userDataPath)

    expect(store.load(company)).toBeNull()
    const snapshot = store.record(company, binding(), 2)
    expect(store.load(company)).toEqual(snapshot)

    const snapshotPath = join(userDataPath, 'barkos', 'worker-sessions', `${company.id}.json`)
    if (process.platform !== 'win32') {
      expect(statSync(snapshotPath).mode & 0o777).toBe(0o600)
    }
    expect(readFileSync(snapshotPath, 'utf8')).not.toContain('providerToken')
  })

  it('keeps only the latest binding for a worker', () => {
    const store = new BarkosWorkerSessionStore(userDataPath)
    store.record(company, binding(), 2)

    const updated = store.record(company, binding({ tabId: 'tab-2', launchedAt: 3 }), 3)

    expect(updated.revision).toBe(2)
    expect(updated.bindings).toEqual([expect.objectContaining({ tabId: 'tab-2' })])
  })

  it('reconciles sessions after a worker changes agents', () => {
    const store = new BarkosWorkerSessionStore(userDataPath)
    store.record(company, binding(), 2)
    const changedCompany = {
      ...company,
      workers: company.workers.map((worker) => ({ ...worker, agentId: 'claude' }))
    } as BarkosCompany

    const reconciled = store.load(changedCompany)

    expect(reconciled?.bindings).toEqual([])
    expect(reconciled?.revision).toBe(2)
  })

  it('rejects future, malformed, and oversized snapshots', () => {
    const store = new BarkosWorkerSessionStore(userDataPath)
    store.record(company, binding(), 2)
    const snapshotPath = join(userDataPath, 'barkos', 'worker-sessions', `${company.id}.json`)
    const current = JSON.parse(readFileSync(snapshotPath, 'utf8'))
    writeFileSync(snapshotPath, JSON.stringify({ ...current, schemaVersion: 999 }))
    expect(captureStoreError(() => store.load(company)).code).toBe('snapshot-version-unsupported')

    writeFileSync(snapshotPath, '{invalid')
    expect(captureStoreError(() => store.load(company)).code).toBe('snapshot-invalid')

    writeFileSync(snapshotPath, 'x'.repeat(BARKOS_WORKER_SESSION_SNAPSHOT_MAX_BYTES + 1))
    expect(captureStoreError(() => store.load(company)).code).toBe('snapshot-too-large')
  })
})

function captureStoreError(action: () => unknown): BarkosWorkerSessionStoreError {
  try {
    action()
  } catch (error) {
    if (error instanceof BarkosWorkerSessionStoreError) {
      return error
    }
    throw error
  }
  throw new Error('Expected BarkosWorkerSessionStoreError')
}
