import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { BarkosCompany } from '../../../shared/barkos/company'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import type { BarkosWorkLedger } from '../../../shared/barkos/work-ledger'
import { resolveBarkosWorkerTerminalStatus } from './barkos-orchestration-target'

export type BarkosCodexRecoveryCheck = {
  id: string
  taskTitle: string
  workerName: string
}

export function findBarkosCodexRecoveryChecks(args: {
  company: BarkosCompany | null
  workLedger: BarkosWorkLedger | null
  workerSessions: Readonly<Record<string, BarkosWorkerSessionBinding>>
  statuses: Readonly<Record<string, AgentStatusEntry>>
}): BarkosCodexRecoveryCheck[] {
  const { company, workLedger, workerSessions, statuses } = args
  if (!company || !workLedger || workLedger.companyId !== company.id) {
    return []
  }
  const tasks = new Map(
    workLedger.plans.flatMap((plan) => plan.tasks.map((task) => [task.id, task]))
  )
  const assignments = new Map(
    workLedger.assignments.map((assignment) => [assignment.id, assignment])
  )
  const workers = new Map(company.workers.map((worker) => [worker.id, worker]))
  return workLedger.dispatches.flatMap((dispatch) => {
    const task = tasks.get(dispatch.taskId)
    const assignment = assignments.get(dispatch.assignmentId)
    const worker = workers.get(dispatch.workerId)
    const binding = workerSessions[dispatch.workerId]
    if (
      dispatch.state !== 'running' ||
      dispatch.executionHostId !== 'local' ||
      !dispatch.orchestrationRunId ||
      !dispatch.orchestrationTaskId ||
      !dispatch.orchestrationDispatchId ||
      task?.status !== 'running' ||
      task.orchestrationTaskId !== dispatch.orchestrationTaskId ||
      assignment?.status !== 'dispatched' ||
      assignment.taskId !== dispatch.taskId ||
      assignment.workerId !== dispatch.workerId ||
      worker?.agentId !== 'codex' ||
      binding?.state !== 'created' ||
      binding.agent !== 'codex' ||
      binding.executionHostId !== 'local' ||
      binding.workspaceId !== dispatch.workspaceId
    ) {
      return []
    }
    const status = resolveBarkosWorkerTerminalStatus(binding, statuses)
    if (
      status?.state !== 'done' ||
      status.sessionBoundary === true ||
      status.providerFailure?.kind !== 'usage-limit-exceeded' ||
      status.orchestration?.taskId !== dispatch.orchestrationTaskId ||
      status.orchestration.dispatchId !== dispatch.orchestrationDispatchId ||
      status.orchestration.dispatchStatus !== 'dispatched'
    ) {
      return []
    }
    return [{ id: dispatch.id, taskTitle: task.title, workerName: worker.name }]
  })
}
