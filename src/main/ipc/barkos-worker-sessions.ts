import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { BarkosCompanyStore } from '../barkos/company-store'
import { BarkosWorkerSessionStore } from '../barkos/worker-session-store'
import { isTrustedUIRenderer } from './ui'

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedUIRenderer(event.sender)) {
    throw new Error('unauthorized_barkos_worker_session_sender')
  }
}

export function registerBarkosWorkerSessionHandlers(): void {
  const userDataPath = app.getPath('userData')
  const companyStore = new BarkosCompanyStore(userDataPath)
  const workerSessionStore = new BarkosWorkerSessionStore(userDataPath)

  ipcMain.handle('barkosWorkerSessions:load', (event) => {
    assertTrustedSender(event)
    const company = companyStore.load()
    return company ? workerSessionStore.load(company) : null
  })

  ipcMain.handle('barkosWorkerSessions:record', (event, value: unknown) => {
    assertTrustedSender(event)
    const company = companyStore.load()
    if (!company) {
      throw new Error('barkos_company_not_found')
    }
    return workerSessionStore.record(company, value)
  })
}
