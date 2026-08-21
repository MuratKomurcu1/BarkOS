import { create } from 'zustand'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBarkosBackupBundle } from '../../../../shared/barkos/backup-bundle'
import { createBarkosCompany } from '../../../../shared/barkos/company'
import { createEmptyBarkosMemoryVault } from '../../../../shared/barkos/memory-vault'
import { createEmptyBarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import type { AppState } from '../types'
import { createBarkosCompanySlice } from './barkos-company'

const load = vi.fn()
const save = vi.fn()
const archive = vi.fn()
const exportCurrent = vi.fn()
const pickImport = vi.fn()
const applyImport = vi.fn()
const loadWorkerSessions = vi.fn()
const recordWorkerSession = vi.fn()

function createTestStore() {
  return create<AppState>()(
    (...args) => ({ ...createBarkosCompanySlice(...args) }) as unknown as AppState
  )
}

beforeEach(() => {
  load.mockReset()
  save.mockReset()
  archive.mockReset()
  exportCurrent.mockReset()
  pickImport.mockReset()
  applyImport.mockReset()
  loadWorkerSessions.mockReset()
  recordWorkerSession.mockReset()
  vi.stubGlobal('window', {
    api: {
      barkosCompany: { load, save, archive, exportCurrent, pickImport, applyImport },
      barkosWorkerSessions: { load: loadWorkerSessions, record: recordWorkerSession }
    }
  })
})

describe('BarkOS company slice', () => {
  it('loads the saved company into renderer state', async () => {
    const company = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship reliable work.',
      leadName: 'Ada',
      now: 1
    })
    load.mockResolvedValue(company)
    const store = createTestStore()

    await store.getState().loadBarkosCompany()

    expect(store.getState()).toMatchObject({
      barkosCompany: company,
      barkosCompanyLoadState: 'ready',
      barkosCompanyError: null
    })
  })

  it('keeps a failed load as visible error state', async () => {
    load.mockRejectedValue(new Error('snapshot-invalid'))
    const store = createTestStore()

    await store.getState().loadBarkosCompany()

    expect(store.getState()).toMatchObject({
      barkosCompany: null,
      barkosCompanyLoadState: 'error',
      barkosCompanyError: 'snapshot-invalid'
    })
  })

  it('publishes the validated value returned by save', async () => {
    const company = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship reliable work.',
      leadName: 'Ada',
      now: 1
    })
    save.mockResolvedValue(company)
    const store = createTestStore()

    await expect(store.getState().saveBarkosCompany(company)).resolves.toEqual(company)
    expect(store.getState()).toMatchObject({
      barkosCompany: company,
      barkosCompanyLoadState: 'ready',
      barkosCompanyError: null
    })
  })

  it('keeps the active work ledger while updating the same company', async () => {
    const company = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship reliable work.',
      leadName: 'Ada',
      now: 1
    })
    const ledger = createEmptyBarkosWorkLedger(company.id, 2)
    save.mockResolvedValue(company)
    const store = createTestStore()
    store.setState({
      barkosCompany: company,
      barkosCompanyLoadState: 'ready',
      barkosWorkLedger: ledger,
      barkosWorkLedgerLoadState: 'ready',
      barkosWorkLedgerRequestedCompanyId: company.id
    })

    await store.getState().saveBarkosCompany(company)

    expect(store.getState()).toMatchObject({
      barkosWorkLedger: ledger,
      barkosWorkLedgerLoadState: 'ready',
      barkosWorkLedgerRequestedCompanyId: company.id
    })
  })

  it('archives the current company and returns to an empty ready state', async () => {
    const company = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship reliable work.',
      leadName: 'Ada',
      now: 1
    })
    archive.mockResolvedValue(company)
    const store = createTestStore()
    store.setState({ barkosCompany: company, barkosCompanyLoadState: 'ready' })

    await expect(store.getState().archiveBarkosCompany()).resolves.toEqual(company)
    expect(store.getState()).toMatchObject({
      barkosCompany: null,
      barkosCompanyLoadState: 'ready',
      barkosCompanyFileAction: 'idle',
      barkosCompanyError: null
    })
  })

  it('exports without mutating the active company', async () => {
    const company = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship reliable work.',
      leadName: 'Ada',
      now: 1
    })
    exportCurrent.mockResolvedValue({ status: 'exported' })
    const store = createTestStore()
    store.setState({ barkosCompany: company })

    await expect(store.getState().exportBarkosCompany()).resolves.toBe('exported')
    expect(store.getState()).toMatchObject({
      barkosCompany: company,
      barkosCompanyFileAction: 'idle'
    })
  })

  it('returns an imported backup candidate without applying it', async () => {
    const imported = createBarkosCompany({
      name: 'Imported',
      mission: 'Review before replacing.',
      leadName: 'Grace',
      now: 2
    })
    const backup = createBarkosBackupBundle({
      company: imported,
      memoryVault: createEmptyBarkosMemoryVault(imported.id, imported.createdAt, 2),
      now: 3
    })
    pickImport.mockResolvedValue({ status: 'selected', backup })
    const store = createTestStore()

    await expect(store.getState().pickBarkosCompanyImport()).resolves.toEqual(backup)
    expect(applyImport).not.toHaveBeenCalled()
    expect(store.getState()).toMatchObject({
      barkosCompany: null,
      barkosCompanyFileAction: 'idle'
    })
  })

  it('applies a backup and publishes its memory vault as ready', async () => {
    const imported = createBarkosCompany({
      name: 'Imported',
      mission: 'Restore company memory.',
      leadName: 'Grace',
      now: 2
    })
    const backup = createBarkosBackupBundle({
      company: imported,
      memoryVault: createEmptyBarkosMemoryVault(imported.id, imported.createdAt, 3),
      now: 4
    })
    applyImport.mockResolvedValue(backup)
    const store = createTestStore()

    await expect(store.getState().importBarkosCompanyBackup(backup)).resolves.toEqual(backup)
    expect(store.getState()).toMatchObject({
      barkosCompany: imported,
      barkosCompanyLoadState: 'ready',
      barkosCompanyFileAction: 'idle',
      barkosMemoryVault: backup.memoryVault,
      barkosMemoryVaultLoadState: 'ready',
      barkosMemoryVaultRequestedCompanyId: imported.id,
      barkosDecisionInbox: null,
      barkosWorkLedger: null,
      barkosWorkerSessions: {}
    })
  })

  it('loads durable worker session bindings for the active company', async () => {
    const company = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Ship reliable work.',
      leadName: 'Ada',
      now: 1
    })
    loadWorkerSessions.mockResolvedValue({
      schemaVersion: 1,
      companyId: company.id,
      companyCreatedAt: company.createdAt,
      revision: 1,
      bindings: [
        {
          workerId: company.leadWorkerId,
          agent: 'codex',
          targetId: '5:localmain',
          workspaceId: 'main',
          workspaceKind: 'worktree',
          executionHostId: 'local',
          tabId: 'tab-1',
          state: 'created',
          launchedAt: 1
        }
      ],
      updatedAt: 1
    })
    const store = createTestStore()
    store.setState({ barkosCompany: company })

    await store.getState().loadBarkosWorkerSessions(company.id)

    expect(store.getState()).toMatchObject({
      barkosWorkerSessionLoadState: 'ready',
      barkosWorkerSessionRequestedCompanyId: company.id,
      barkosWorkerSessions: { [company.leadWorkerId]: { tabId: 'tab-1' } }
    })
  })

  it('persists only the latest session binding for each worker', async () => {
    const store = createTestStore()
    recordWorkerSession
      .mockResolvedValueOnce({
        schemaVersion: 1,
        companyId: 'barkos-labs',
        companyCreatedAt: 1,
        revision: 1,
        bindings: [
          {
            workerId: 'ada',
            agent: 'codex',
            targetId: '5:localmain',
            workspaceId: 'main',
            workspaceKind: 'worktree',
            executionHostId: 'local',
            tabId: 'tab-1',
            state: 'created',
            launchedAt: 1
          }
        ],
        updatedAt: 1
      })
      .mockResolvedValueOnce({
        schemaVersion: 1,
        companyId: 'barkos-labs',
        companyCreatedAt: 1,
        revision: 2,
        bindings: [
          {
            workerId: 'ada',
            agent: 'codex',
            targetId: '5:localfeature',
            workspaceId: 'feature',
            workspaceKind: 'worktree',
            executionHostId: 'local',
            tabId: 'tab-2',
            state: 'created',
            launchedAt: 2
          }
        ],
        updatedAt: 2
      })

    await store.getState().recordBarkosWorkerSession({
      workerId: 'ada',
      agent: 'codex',
      targetId: '5:localmain',
      workspaceId: 'main',
      workspaceKind: 'worktree',
      executionHostId: 'local',
      tabId: 'tab-1',
      state: 'created',
      launchedAt: 1
    })
    await store.getState().recordBarkosWorkerSession({
      workerId: 'ada',
      agent: 'codex',
      targetId: '5:localfeature',
      workspaceId: 'feature',
      workspaceKind: 'worktree',
      executionHostId: 'local',
      tabId: 'tab-2',
      state: 'created',
      launchedAt: 2
    })

    expect(store.getState().barkosWorkerSessions.ada).toMatchObject({
      workspaceId: 'feature',
      tabId: 'tab-2',
      launchedAt: 2
    })
  })
})
