import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type OpenDialogOptions
} from 'electron'
import { BarkosCompanyStore } from '../barkos/company-store'
import { BarkosEvidenceAssetStore } from '../barkos/evidence-asset-store'
import { runBarkosPairedTestEvidence } from '../barkos/paired-test-evidence-client'
import { runBarkosTestEvidence } from '../barkos/test-evidence-runner'
import { BarkosWorkLedgerStore } from '../barkos/work-ledger-store'
import { BarkosWorkerSessionStore } from '../barkos/worker-session-store'
import { barkosEntityIdSchema } from '../../shared/barkos/company'
import { parseBarkosTestEvidenceRunRequest } from '../../shared/barkos/test-evidence-run'
import type { Store } from '../persistence'
import { isTrustedUIRenderer } from './ui'

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedUIRenderer(event.sender)) {
    throw new Error('unauthorized_barkos_work_ledger_sender')
  }
}

export function registerBarkosWorkLedgerHandlers(workspaceStore?: Store): void {
  const userDataPath = app.getPath('userData')
  const companyStore = new BarkosCompanyStore(userDataPath)
  const evidenceAssetStore = new BarkosEvidenceAssetStore(userDataPath)
  const ledgerStore = new BarkosWorkLedgerStore(userDataPath)
  const workerSessionStore = new BarkosWorkerSessionStore(userDataPath)
  const activeTestRuns = new Map<string, AbortController>()

  ipcMain.handle('barkosWorkLedger:load', (event) => {
    assertTrustedSender(event)
    const company = companyStore.load()
    return company ? ledgerStore.load(company) : null
  })

  ipcMain.handle('barkosWorkLedger:save', (event, value: unknown) => {
    assertTrustedSender(event)
    const company = companyStore.load()
    if (!company) {
      throw new Error('barkos_company_not_found')
    }
    return ledgerStore.save(value, company)
  })

  ipcMain.handle('barkosWorkLedger:pickScreenshot', async (event) => {
    assertTrustedSender(event)
    if (!companyStore.load()) {
      throw new Error('barkos_company_not_found')
    }
    const options: OpenDialogOptions = {
      properties: ['openFile'],
      filters: [
        { name: 'BarkOS evidence screenshot', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }
      ]
    }
    const parentWindow = BrowserWindow.fromWebContents(event.sender)
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, options)
      : await dialog.showOpenDialog(options)
    const screenshotPath = result.filePaths[0]
    return result.canceled || !screenshotPath
      ? null
      : evidenceAssetStore.importScreenshot(screenshotPath)
  })

  ipcMain.handle('barkosWorkLedger:runTest', async (event, value: unknown) => {
    assertTrustedSender(event)
    if (!workspaceStore) {
      throw new Error('barkos_test_runner_unavailable')
    }
    const request = parseBarkosTestEvidenceRunRequest(value)
    const key = `${event.sender.id}:${request.dispatchId}`
    activeTestRuns.get(key)?.abort()
    const controller = new AbortController()
    activeTestRuns.set(key, controller)
    const onDestroyed = (): void => controller.abort()
    event.sender.once('destroyed', onDestroyed)
    try {
      return await runBarkosTestEvidence(
        {
          companyStore,
          ledgerStore,
          workerSessionStore,
          workspaceStore,
          runRuntime: (environmentId, request, signal) =>
            runBarkosPairedTestEvidence({ userDataPath, environmentId, request, signal })
        },
        request,
        controller.signal
      )
    } finally {
      event.sender.removeListener('destroyed', onDestroyed)
      if (activeTestRuns.get(key) === controller) {
        activeTestRuns.delete(key)
      }
    }
  })

  ipcMain.handle('barkosWorkLedger:cancelTest', (event, dispatchId: unknown) => {
    assertTrustedSender(event)
    const parsedDispatchId = barkosEntityIdSchema.safeParse(dispatchId)
    if (!parsedDispatchId.success) {
      return false
    }
    const controller = activeTestRuns.get(`${event.sender.id}:${parsedDispatchId.data}`)
    controller?.abort()
    return Boolean(controller)
  })
}
