import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { agentHookServer } from '../agent-hooks/server'
import { BarkosCompanyStore } from '../barkos/company-store'
import { BarkosDecisionInboxStore } from '../barkos/decision-inbox-store'
import { BarkosSideEffectApprovalController } from '../barkos/side-effect-approval-controller'
import { BarkosPairedSideEffectApprovalClient } from '../barkos/paired-side-effect-approval-client'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { isTrustedUIRenderer } from './ui'

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedUIRenderer(event.sender)) {
    throw new Error('unauthorized_barkos_decision_inbox_sender')
  }
}

const sideEffectResolutionSchema = z
  .object({
    requestId: z.string().trim().min(1).max(1_100),
    decision: z.enum(['approved', 'rejected'])
  })
  .strict()

const pairedApprovalEnvironmentSchema = z
  .object({
    environmentId: z.string().trim().min(1).max(160),
    agent: z.enum(['claude', 'codex', 'droid', 'gemini', 'opencode'])
  })
  .strict()

export function registerBarkosDecisionInboxHandlers(runtime: OrcaRuntimeService): void {
  const userDataPath = app.getPath('userData')
  const companyStore = new BarkosCompanyStore(userDataPath)
  const decisionInboxStore = new BarkosDecisionInboxStore(userDataPath)
  const sideEffectApprovals = new BarkosSideEffectApprovalController(userDataPath, runtime)
  const pairedApprovalClient = new BarkosPairedSideEffectApprovalClient(
    userDataPath,
    sideEffectApprovals
  )
  agentHookServer.setToolUseDecisionEvaluator(sideEffectApprovals.evaluate)
  agentHookServer.setRemoteToolUseDecisionEvaluator(sideEffectApprovals.evaluateRemote)

  ipcMain.handle('barkosDecisionInbox:load', (event) => {
    assertTrustedSender(event)
    const company = companyStore.load()
    return company ? decisionInboxStore.load(company) : null
  })

  ipcMain.handle('barkosDecisionInbox:save', (event, value: unknown) => {
    assertTrustedSender(event)
    const company = companyStore.load()
    if (!company) {
      throw new Error('barkos_company_not_found')
    }
    return decisionInboxStore.save(value, company)
  })

  ipcMain.handle('barkosDecisionInbox:resolveSideEffect', (event, value: unknown) => {
    assertTrustedSender(event)
    const resolution = sideEffectResolutionSchema.parse(value)
    return sideEffectApprovals.resolve(resolution.requestId, resolution.decision)
  })

  ipcMain.handle('barkosDecisionInbox:preparePairedSideEffectApproval', (event, value: unknown) => {
    assertTrustedSender(event)
    const { environmentId, agent } = pairedApprovalEnvironmentSchema.parse(value)
    return pairedApprovalClient.prepare(environmentId, agent)
  })
}
