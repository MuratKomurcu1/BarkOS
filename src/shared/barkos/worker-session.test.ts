import { describe, expect, it } from 'vitest'
import { createBarkosCompany } from './company'
import {
  BARKOS_WORKER_SESSION_SCHEMA_VERSION,
  createEmptyBarkosWorkerSessionSnapshot,
  parseBarkosWorkerSessionBinding,
  parseBarkosWorkerSessionSnapshot,
  parseBarkosWorkerSessionSnapshotForCompany,
  reconcileBarkosWorkerSessionSnapshot,
  upsertBarkosWorkerSessionBinding,
  type BarkosWorkerSessionBinding
} from './worker-session'

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

describe('BarkOS worker session contract', () => {
  it('creates a strict versioned snapshot and keeps only the newest worker binding', () => {
    const empty = createEmptyBarkosWorkerSessionSnapshot(company.id, company.createdAt, 1)
    const first = upsertBarkosWorkerSessionBinding({
      snapshot: empty,
      company,
      binding: binding(),
      now: 2
    })
    const second = upsertBarkosWorkerSessionBinding({
      snapshot: first,
      company,
      binding: binding({ tabId: 'tab-2', launchedAt: 3 }),
      now: 3
    })

    expect(second).toMatchObject({
      schemaVersion: BARKOS_WORKER_SESSION_SCHEMA_VERSION,
      companyId: company.id,
      companyCreatedAt: company.createdAt,
      revision: 2,
      bindings: [{ workerId: company.leadWorkerId, tabId: 'tab-2' }]
    })
  })

  it('rejects malformed host, agent, state, and secret fields', () => {
    expect(() =>
      parseBarkosWorkerSessionBinding(binding({ executionHostId: 'unknown' as never }))
    ).toThrow()
    expect(() => parseBarkosWorkerSessionBinding(binding({ agent: 'unknown' as never }))).toThrow()
    expect(() =>
      parseBarkosWorkerSessionBinding(binding({ state: 'created', tabId: null }))
    ).toThrow()
    expect(() =>
      parseBarkosWorkerSessionBinding({ ...binding(), providerToken: 'secret' })
    ).toThrow()
  })

  it('rejects cross-company and worker-agent mismatches', () => {
    const snapshot = upsertBarkosWorkerSessionBinding({
      snapshot: null,
      company,
      binding: binding(),
      now: 2
    })
    const otherCompany = createBarkosCompany({
      name: 'Other',
      mission: 'Keep sessions isolated.',
      leadName: 'Grace',
      now: 1
    })

    expect(() => parseBarkosWorkerSessionSnapshotForCompany(snapshot, otherCompany)).toThrow(
      'does not match'
    )
    expect(() =>
      parseBarkosWorkerSessionSnapshotForCompany(
        { ...snapshot, bindings: [binding({ agent: 'claude' })] },
        company
      )
    ).toThrow('does not match worker')
  })

  it('prunes bindings whose worker was removed or changed agents', () => {
    const snapshot = parseBarkosWorkerSessionSnapshot({
      schemaVersion: BARKOS_WORKER_SESSION_SCHEMA_VERSION,
      companyId: company.id,
      companyCreatedAt: company.createdAt,
      revision: 1,
      bindings: [binding()],
      updatedAt: 2
    })
    const changedCompany = {
      ...company,
      workers: company.workers.map((worker) => ({ ...worker, agentId: 'claude' }))
    }
    const result = reconcileBarkosWorkerSessionSnapshot(snapshot, changedCompany, 3)

    expect(result.changed).toBe(true)
    expect(result.snapshot.bindings).toEqual([])
    expect(result.snapshot.revision).toBe(2)
  })
})
