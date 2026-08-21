import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { BarkosCompanyStore } from '../barkos/company-store'
import { BarkosProviderCapacityStore } from '../barkos/provider-capacity-store'
import { isTrustedUIRenderer } from './ui'

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedUIRenderer(event.sender)) {
    throw new Error('unauthorized_barkos_provider_capacity_sender')
  }
}

export function registerBarkosProviderCapacityHandlers(): void {
  const userDataPath = app.getPath('userData')
  const companyStore = new BarkosCompanyStore(userDataPath)
  const capacityStore = new BarkosProviderCapacityStore(userDataPath)

  ipcMain.handle('barkosProviderCapacity:load', (event) => {
    assertTrustedSender(event)
    const company = companyStore.load()
    return company ? capacityStore.load(company) : null
  })

  ipcMain.handle('barkosProviderCapacity:save', (event, value: unknown) => {
    assertTrustedSender(event)
    const company = companyStore.load()
    if (!company) {
      throw new Error('barkos_company_not_found')
    }
    return capacityStore.save(value, company)
  })
}
