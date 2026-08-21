import type { AgentHookToolUseRequest } from '../agent-hooks/server'
import type { BarkosPairedSideEffectApprovalAuthority } from '../../shared/barkos/paired-side-effect-approval'
import type { BarkosCompany } from '../../shared/barkos/company'
import type { BarkosWorkLedger } from '../../shared/barkos/work-ledger'
import { toRuntimeExecutionHostId } from '../../shared/execution-host'
import type { BarkosSideEffectContext } from './side-effect-approval-context'

export function resolveBarkosPairedSideEffectContext(args: {
  request: AgentHookToolUseRequest
  authority: BarkosPairedSideEffectApprovalAuthority
  environmentId: string
  expectedRuntimeId: string
  company: BarkosCompany
  ledger: BarkosWorkLedger
}): BarkosSideEffectContext | null {
  const { request, authority, environmentId, expectedRuntimeId, company, ledger } = args
  if (authority.runtimeId !== expectedRuntimeId) {
    return null
  }
  const dispatch = ledger.dispatches.find(
    (entry) =>
      entry.orchestrationRunId === authority.orchestrationRunId &&
      entry.orchestrationTaskId === authority.orchestrationTaskId &&
      entry.orchestrationDispatchId === authority.orchestrationDispatchId &&
      entry.workspaceId === authority.worktreeId &&
      entry.executionHostId === toRuntimeExecutionHostId(environmentId) &&
      (entry.state === 'requested' || entry.state === 'running')
  )
  if (!dispatch) {
    return null
  }
  const assignment = ledger.assignments.find((entry) => entry.id === dispatch.assignmentId)
  const task = ledger.plans
    .flatMap((plan) => plan.tasks)
    .find((entry) => entry.id === dispatch.taskId)
  const worker = company.workers.find((entry) => entry.id === dispatch.workerId)
  if (
    !assignment ||
    !task ||
    !worker ||
    assignment.workerId !== dispatch.workerId ||
    task.orchestrationTaskId !== authority.orchestrationTaskId ||
    worker.agentId !== request.source
  ) {
    return null
  }
  return { company, task, assignment, dispatch, identityVerified: true }
}
