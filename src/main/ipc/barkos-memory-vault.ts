import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { BarkosCompanyStore } from '../barkos/company-store'
import { BarkosMemoryVaultStore } from '../barkos/memory-vault-store'
import { isTrustedUIRenderer } from './ui'

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedUIRenderer(event.sender)) {
    throw new Error('unauthorized_barkos_memory_vault_sender')
  }
}

export function registerBarkosMemoryVaultHandlers(): void {
  const userDataPath = app.getPath('userData')
  const companyStore = new BarkosCompanyStore(userDataPath)
  const memoryVaultStore = new BarkosMemoryVaultStore(userDataPath)

  ipcMain.handle('barkosMemoryVault:load', (event) => {
    assertTrustedSender(event)
    const company = companyStore.load()
    return company ? memoryVaultStore.load(company) : null
  })

  ipcMain.handle('barkosMemoryVault:save', (event, value: unknown) => {
    assertTrustedSender(event)
    const company = companyStore.load()
    if (!company) {
      throw new Error('barkos_company_not_found')
    }
    return memoryVaultStore.save(value, company)
  })
}
