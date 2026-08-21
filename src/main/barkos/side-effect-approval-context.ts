import { createHash } from 'node:crypto'
import type { AgentHookToolUseRequest } from '../agent-hooks/server'
import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { isEquivalentPaneKey } from '../runtime/orchestration/db/pane-key-match'
import type { BarkosCompany } from '../../shared/barkos/company'
import type {
  BarkosAssignment,
  BarkosDispatch,
  BarkosTask,
  BarkosWorkLedger
} from '../../shared/barkos/work-ledger'
import { toSshExecutionHostId } from '../../shared/execution-host'
import {
  isWslHookRelayConnectionId,
  wslHookRelayConnectionId
} from '../../shared/wsl-hook-relay-contract'

export type BarkosSideEffectContext = {
  company: BarkosCompany
  task: BarkosTask
  assignment: BarkosAssignment
  dispatch: BarkosDispatch
  identityVerified: boolean
}

function matchesRemoteTransport(
  request: AgentHookToolUseRequest,
  terminalHandle: string,
  dispatch: BarkosDispatch,
  runtime: OrcaRuntimeService
): boolean {
  if (!request.connectionId) {
    return true
  }
  const terminalContext = runtime.resolveTerminalContext(terminalHandle)
  if (!terminalContext) {
    return false
  }
  if (!isWslHookRelayConnectionId(request.connectionId)) {
    return (
      terminalContext.connectionId === request.connectionId &&
      dispatch.executionHostId === toSshExecutionHostId(request.connectionId)
    )
  }
  if (terminalContext.connectionId !== null || dispatch.executionHostId !== 'local') {
    return false
  }
  const resolution = runtime.resolveProjectRuntimeForWorktree(terminalContext.worktreeId)
  return (
    resolution?.status === 'resolved' &&
    resolution.runtime.kind === 'wsl' &&
    wslHookRelayConnectionId(resolution.runtime.distro).toLowerCase() ===
      request.connectionId.toLowerCase()
  )
}

export function resolveBarkosSideEffectContext(args: {
  request: AgentHookToolUseRequest
  company: BarkosCompany
  ledger: BarkosWorkLedger
  runtime: OrcaRuntimeService
}): BarkosSideEffectContext | null {
  const { request, company, ledger, runtime } = args
  const terminalHandle = runtime.getAgentStatusTerminalHandleForPaneKey(request.paneKey)
  if (!terminalHandle) {
    return null
  }
  const runtimeDispatch = runtime
    .getOrchestrationDb()
    .getActiveDispatchForIdentity(terminalHandle, request.paneKey)
  if (!runtimeDispatch) {
    return null
  }
  const dispatch = ledger.dispatches.find(
    (entry) =>
      entry.orchestrationDispatchId === runtimeDispatch.id &&
      (entry.state === 'requested' || entry.state === 'running')
  )
  if (!dispatch || !matchesRemoteTransport(request, terminalHandle, dispatch, runtime)) {
    return null
  }
  const assignment = ledger.assignments.find((entry) => entry.id === dispatch.assignmentId)
  const worker = company.workers.find((entry) => entry.id === dispatch.workerId)
  const task = ledger.plans
    .flatMap((plan) => plan.tasks)
    .find((entry) => entry.id === dispatch.taskId)
  if (
    !assignment ||
    !worker ||
    !task ||
    task.orchestrationTaskId !== runtimeDispatch.task_id ||
    dispatch.orchestrationRunId !== runtimeDispatch.run_id ||
    dispatch.workerId !== assignment.workerId ||
    worker.agentId !== request.source
  ) {
    return null
  }
  const launchTokenHash = request.launchToken
    ? createHash('sha256').update(request.launchToken).digest('hex')
    : null
  return {
    company,
    task,
    assignment,
    dispatch,
    identityVerified:
      runtimeDispatch.assignee_pane_key !== null &&
      isEquivalentPaneKey(runtimeDispatch.assignee_pane_key, request.paneKey) &&
      runtimeDispatch.launch_token_hash !== null &&
      launchTokenHash === runtimeDispatch.launch_token_hash
  }
}
