import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type OpenDialogOptions
} from 'electron'
import { readFileSync, statSync } from 'node:fs'
import {
  BARKOS_BACKUP_BUNDLE_MAX_BYTES,
  createBarkosBackupBundle,
  parseBarkosBackupImport,
  type BarkosBackupBundle
} from '../../shared/barkos/backup-bundle'
import { writeSecureJsonFileWithinLimit } from '../../shared/bounded-secure-json-file'
import { createEmptyBarkosMemoryVault } from '../../shared/barkos/memory-vault'
import type {
  BarkosCompanyExportResult,
  BarkosCompanyImportResult
} from '../../preload/api/barkos-company-api'
import { BarkosCompanyStore } from '../barkos/company-store'
import { BarkosMemoryVaultStore } from '../barkos/memory-vault-store'
import { isTrustedUIRenderer } from './ui'

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedUIRenderer(event.sender)) {
    throw new Error('unauthorized_barkos_company_sender')
  }
}

function exportFileName(companyName: string): string {
  const safeName = companyName
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
  return `${safeName || 'company'}.barkos.backup.json`
}

function validateBackupValue(value: unknown): BarkosBackupBundle {
  try {
    return parseBarkosBackupImport(value)
  } catch (error) {
    throw new Error('BarkOS backup failed contract validation', { cause: error })
  }
}

function readBackupFile(snapshotPath: string): BarkosBackupBundle {
  if (statSync(snapshotPath).size > BARKOS_BACKUP_BUNDLE_MAX_BYTES) {
    throw new Error('BarkOS backup exceeds the import limit')
  }
  let value: unknown
  try {
    value = JSON.parse(readFileSync(snapshotPath, 'utf8'))
  } catch (error) {
    throw new Error('BarkOS backup is not valid JSON', { cause: error })
  }
  return validateBackupValue(value)
}

export function registerBarkosCompanyHandlers(): void {
  const store = new BarkosCompanyStore(app.getPath('userData'))
  const memoryStore = new BarkosMemoryVaultStore(app.getPath('userData'))

  ipcMain.handle('barkosCompany:load', (event) => {
    assertTrustedSender(event)
    return store.load()
  })

  ipcMain.handle('barkosCompany:save', (event, value: unknown) => {
    assertTrustedSender(event)
    return store.save(value)
  })

  ipcMain.handle('barkosCompany:archive', (event) => {
    assertTrustedSender(event)
    return store.archive()
  })

  ipcMain.handle(
    'barkosCompany:exportCurrent',
    async (event): Promise<BarkosCompanyExportResult> => {
      assertTrustedSender(event)
      const company = store.load()
      if (!company) {
        throw new Error('barkos_company_not_found')
      }

      const memoryVault =
        memoryStore.load(company) ??
        createEmptyBarkosMemoryVault(company.id, company.createdAt, Date.now())
      const backup = createBarkosBackupBundle({ company, memoryVault })
      const options = {
        defaultPath: exportFileName(company.name),
        filters: [{ name: 'BarkOS backup', extensions: ['json'] }]
      }
      const parentWindow = BrowserWindow.fromWebContents(event.sender)
      const result = parentWindow
        ? await dialog.showSaveDialog(parentWindow, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) {
        return { status: 'cancelled' }
      }

      writeSecureJsonFileWithinLimit(result.filePath, backup, BARKOS_BACKUP_BUNDLE_MAX_BYTES, {
        durable: true
      })
      return { status: 'exported' }
    }
  )

  ipcMain.handle('barkosCompany:pickImport', async (event): Promise<BarkosCompanyImportResult> => {
    assertTrustedSender(event)
    const options: OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'BarkOS backup', extensions: ['json'] }]
    }
    const parentWindow = BrowserWindow.fromWebContents(event.sender)
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options)
    const snapshotPath = result.filePaths[0]
    if (result.canceled || !snapshotPath) {
      return { status: 'cancelled' }
    }

    return { status: 'selected', backup: readBackupFile(snapshotPath) }
  })

  ipcMain.handle('barkosCompany:applyImport', (event, value: unknown) => {
    assertTrustedSender(event)
    const backup = validateBackupValue(value)
    store.save(backup.company)
    memoryStore.replaceForImport(backup.memoryVault, backup.company)
    return backup
  })
}
