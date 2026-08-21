import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBarkosBackupBundle } from '../../shared/barkos/backup-bundle'
import { createBarkosCompany } from '../../shared/barkos/company'
import { createEmptyBarkosMemoryVault } from '../../shared/barkos/memory-vault'
import { BarkosMemoryVaultStore } from '../barkos/memory-vault-store'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  getPath: vi.fn(),
  fromWebContents: vi.fn(),
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
  isTrustedUIRenderer: vi.fn(() => true)
}))

vi.mock('electron', () => ({
  app: { getPath: mocks.getPath },
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  dialog: {
    showSaveDialog: mocks.showSaveDialog,
    showOpenDialog: mocks.showOpenDialog
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => {
      mocks.handlers.set(channel, handler)
    })
  }
}))

vi.mock('./ui', () => ({ isTrustedUIRenderer: mocks.isTrustedUIRenderer }))

import { registerBarkosCompanyHandlers } from './barkos-company'

let userDataPath: string
const sender = { id: 1 }
const event = { sender }

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'barkos-company-ipc-'))
  mocks.handlers.clear()
  mocks.getPath.mockReturnValue(userDataPath)
  mocks.fromWebContents.mockReset()
  mocks.fromWebContents.mockReturnValue(null)
  mocks.showSaveDialog.mockReset()
  mocks.showSaveDialog.mockResolvedValue({ canceled: true })
  mocks.showOpenDialog.mockReset()
  mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
  mocks.isTrustedUIRenderer.mockReturnValue(true)
  registerBarkosCompanyHandlers()
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

describe('BarkOS company IPC', () => {
  it('loads and saves through the validated local store', () => {
    const load = mocks.handlers.get('barkosCompany:load')
    const save = mocks.handlers.get('barkosCompany:save')
    const company = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Build dependable agent teams.',
      leadName: 'Ada',
      now: 1
    })

    expect(load?.(event)).toBeNull()
    expect(save?.(event, company)).toEqual(company)
    expect(load?.(event)).toEqual(company)
  })

  it('rejects invalid snapshots without replacing the valid company', () => {
    const load = mocks.handlers.get('barkosCompany:load')
    const save = mocks.handlers.get('barkosCompany:save')
    const company = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Build dependable agent teams.',
      leadName: 'Ada',
      now: 1
    })

    save?.(event, company)
    expect(() => save?.(event, { ...company, leadWorkerId: 'missing' })).toThrow()
    expect(load?.(event)).toEqual(company)
  })

  it('archives the active company and clears the current snapshot', () => {
    const load = mocks.handlers.get('barkosCompany:load')
    const save = mocks.handlers.get('barkosCompany:save')
    const archive = mocks.handlers.get('barkosCompany:archive')
    const company = createBarkosCompany({
      name: 'BarkOS Labs',
      mission: 'Build dependable agent teams.',
      leadName: 'Ada',
      now: 1
    })
    save?.(event, company)

    expect(archive?.(event)).toEqual(company)
    expect(load?.(event)).toBeNull()
  })

  it('exports the validated company and memory vault after the user selects a path', async () => {
    const save = mocks.handlers.get('barkosCompany:save')
    const exportCurrent = mocks.handlers.get('barkosCompany:exportCurrent')
    const company = createBarkosCompany({
      name: 'BarkOS / Labs',
      mission: 'Build dependable agent teams.',
      leadName: 'Ada',
      now: 1
    })
    const exportPath = join(userDataPath, 'export.json')
    save?.(event, company)
    mocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: exportPath })

    await expect(exportCurrent?.(event)).resolves.toEqual({ status: 'exported' })
    expect(JSON.parse(readFileSync(exportPath, 'utf8'))).toMatchObject({
      kind: 'barkos-backup',
      schemaVersion: 1,
      company,
      memoryVault: {
        companyId: company.id,
        companyCreatedAt: company.createdAt,
        entries: [],
        candidates: []
      }
    })
    expect(mocks.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'BarkOS - Labs.barkos.backup.json' })
    )
  })

  it('validates an imported snapshot without replacing the active company', async () => {
    const load = mocks.handlers.get('barkosCompany:load')
    const save = mocks.handlers.get('barkosCompany:save')
    const pickImport = mocks.handlers.get('barkosCompany:pickImport')
    const current = createBarkosCompany({
      name: 'Current',
      mission: 'Keep the current company.',
      leadName: 'Ada',
      now: 1
    })
    const imported = createBarkosCompany({
      name: 'Imported',
      mission: 'Review before replacing.',
      leadName: 'Grace',
      now: 2
    })
    const importPath = join(userDataPath, 'import.json')
    save?.(event, current)
    writeFileSync(importPath, JSON.stringify(imported))
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [importPath] })

    await expect(pickImport?.(event)).resolves.toMatchObject({
      status: 'selected',
      backup: {
        kind: 'barkos-backup',
        company: imported,
        memoryVault: {
          companyId: imported.id,
          companyCreatedAt: imported.createdAt,
          entries: [],
          candidates: []
        }
      }
    })
    expect(load?.(event)).toEqual(current)
  })

  it('applies a selected backup only after explicit confirmation', () => {
    const load = mocks.handlers.get('barkosCompany:load')
    const save = mocks.handlers.get('barkosCompany:save')
    const applyImport = mocks.handlers.get('barkosCompany:applyImport')
    const current = createBarkosCompany({
      name: 'Current',
      mission: 'Keep until confirmation.',
      leadName: 'Ada',
      now: 1
    })
    const imported = createBarkosCompany({
      name: 'Imported',
      mission: 'Restore the selected backup.',
      leadName: 'Grace',
      now: 2
    })
    const memoryVault = createEmptyBarkosMemoryVault(imported.id, imported.createdAt, 3)
    const backup = createBarkosBackupBundle({ company: imported, memoryVault, now: 4 })
    save?.(event, current)

    expect(applyImport?.(event, backup)).toEqual(backup)
    expect(load?.(event)).toEqual(imported)
    expect(new BarkosMemoryVaultStore(userDataPath).load(imported)).toEqual(memoryVault)
  })

  it('rejects an invalid imported snapshot', async () => {
    const pickImport = mocks.handlers.get('barkosCompany:pickImport')
    const importPath = join(userDataPath, 'invalid.json')
    writeFileSync(importPath, '{"schemaVersion":1}')
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [importPath] })

    await expect(pickImport?.(event)).rejects.toThrow('BarkOS backup failed contract validation')
  })

  it('rejects every operation from an untrusted renderer', async () => {
    mocks.isTrustedUIRenderer.mockReturnValue(false)

    expect(() => mocks.handlers.get('barkosCompany:load')?.(event)).toThrow(
      'unauthorized_barkos_company_sender'
    )
    expect(() => mocks.handlers.get('barkosCompany:save')?.(event, {})).toThrow(
      'unauthorized_barkos_company_sender'
    )
    expect(() => mocks.handlers.get('barkosCompany:archive')?.(event)).toThrow(
      'unauthorized_barkos_company_sender'
    )
    await expect(mocks.handlers.get('barkosCompany:exportCurrent')?.(event)).rejects.toThrow(
      'unauthorized_barkos_company_sender'
    )
    await expect(mocks.handlers.get('barkosCompany:pickImport')?.(event)).rejects.toThrow(
      'unauthorized_barkos_company_sender'
    )
    expect(() => mocks.handlers.get('barkosCompany:applyImport')?.(event, {})).toThrow(
      'unauthorized_barkos_company_sender'
    )
    expect(mocks.isTrustedUIRenderer).toHaveBeenCalledWith(sender)
  })
})
