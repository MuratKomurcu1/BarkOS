import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  createEmptyBarkosUsageCostLedger,
  parseBarkosUsageCostSyncRequest
} from '../../shared/barkos/usage-cost-ledger'
import { BarkosCompanyStore } from '../barkos/company-store'
import { collectBarkosPairedRemoteUsageCosts } from '../barkos/remote-usage-cost-client'
import { collectBarkosUsageCosts } from '../barkos/usage-cost-collector'
import { BarkosUsageCostStore } from '../barkos/usage-cost-store'
import { BarkosWorkLedgerStore } from '../barkos/work-ledger-store'
import type { ClaudeUsageStore } from '../claude-usage/store'
import type { CodexUsageStore } from '../codex-usage/store'
import { isTrustedUIRenderer } from './ui'

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedUIRenderer(event.sender)) {
    throw new Error('unauthorized_barkos_usage_cost_sender')
  }
}

export function registerBarkosUsageCostHandlers(stores: {
  claudeUsage: ClaudeUsageStore
  codexUsage: CodexUsageStore
}): void {
  const userDataPath = app.getPath('userData')
  const companyStore = new BarkosCompanyStore(userDataPath)
  const workLedgerStore = new BarkosWorkLedgerStore(userDataPath)
  const costStore = new BarkosUsageCostStore(userDataPath)

  ipcMain.handle('barkosUsageCost:load', (event) => {
    assertTrustedSender(event)
    const company = companyStore.load()
    return company ? costStore.load(company) : null
  })

  ipcMain.handle('barkosUsageCost:sync', async (event, value: unknown) => {
    assertTrustedSender(event)
    const request = parseBarkosUsageCostSyncRequest(value)
    const company = companyStore.load()
    if (!company) {
      throw new Error('barkos_company_not_found')
    }
    const workLedger = workLedgerStore.load(company)
    if (!workLedger) {
      throw new Error('barkos_work_ledger_not_found')
    }
    const current =
      costStore.load(company) ?? createEmptyBarkosUsageCostLedger(company.id, company.createdAt)
    const remoteRecords = await collectBarkosPairedRemoteUsageCosts({
      userDataPath,
      company,
      workLedger,
      candidates: request.candidates
    })
    const collected = await collectBarkosUsageCosts({
      company,
      workLedger,
      costLedger: current,
      candidates: request.candidates,
      claudeUsage: stores.claudeUsage,
      codexUsage: stores.codexUsage,
      remoteRecords
    })
    return costStore.save(collected, company)
  })
}
