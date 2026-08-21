import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { BarkosCompanyStore } from '../barkos/company-store'
import { BarkosControlPolicyStore } from '../barkos/control-policy-store'
import { isTrustedUIRenderer } from './ui'

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedUIRenderer(event.sender)) {
    throw new Error('unauthorized_barkos_control_policy_sender')
  }
}

export function registerBarkosControlPolicyHandlers(): void {
  const userDataPath = app.getPath('userData')
  const companyStore = new BarkosCompanyStore(userDataPath)
  const policyStore = new BarkosControlPolicyStore(userDataPath)

  ipcMain.handle('barkosControlPolicy:load', (event) => {
    assertTrustedSender(event)
    const company = companyStore.load()
    return company ? policyStore.load(company) : null
  })

  ipcMain.handle('barkosControlPolicy:save', (event, value: unknown) => {
    assertTrustedSender(event)
    const company = companyStore.load()
    if (!company) {
      throw new Error('barkos_company_not_found')
    }
    return policyStore.save(value, company)
  })
}
