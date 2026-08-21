import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import type { BarkosCompany } from '../../shared/barkos/company'
import type { BarkosDecisionRequest } from '../../shared/barkos/decision-inbox'
import { parseExecutionHostId } from '../../shared/execution-host'
import type { BarkosWorkLedgerStore } from './work-ledger-store'

export function barkosApprovalStillOwnsActiveDispatch(args: {
  company: BarkosCompany
  request: BarkosDecisionRequest
  ledgerStore: BarkosWorkLedgerStore
  runtime: OrcaRuntimeService
}): boolean {
  const { company, request, ledgerStore, runtime } = args
  const ledger = ledgerStore.load(company)
  const dispatch = ledger?.dispatches.find(
    (entry) =>
      entry.id === request.dispatchId &&
      entry.orchestrationDispatchId === request.orchestrationDispatchId &&
      (entry.state === 'requested' || entry.state === 'running')
  )
  if (!dispatch || !request.sideEffect) {
    return false
  }
  if (parseExecutionHostId(dispatch.executionHostId)?.kind === 'runtime') {
    // The paired host revalidates live pane, launch token, and Dispatch before consumption.
    return true
  }
  const handle = runtime.getAgentStatusTerminalHandleForPaneKey(request.sideEffect.paneKey)
  if (!handle) {
    return false
  }
  const active = runtime
    .getOrchestrationDb()
    .getActiveDispatchForIdentity(handle, request.sideEffect.paneKey)
  return active?.id === dispatch.orchestrationDispatchId
}
