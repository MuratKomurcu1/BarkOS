import type { BarkosStaffingProposal } from '../../../shared/barkos/staffing-proposal'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import type { BarkosWorkLedger } from '../../../shared/barkos/work-ledger'
import { reconcileBarkosWorkerReport } from '../../../shared/barkos/worker-report-reconciliation'
import { callRuntimeRpc } from '../runtime/runtime-rpc-client'
import { runtimeTargetForBarkosExecutionHost } from './barkos-orchestration-target'

type RuntimeTask = {
  id: string
  status: string
  result: string | null
}

type RuntimeTaskList = {
  tasks: RuntimeTask[]
}

export type BarkosStaffingProposalEvent = {
  taskId: string
  objectiveId: string
  proposal: BarkosStaffingProposal
}

export type BarkosWorkerReportSyncResult = {
  ledger: BarkosWorkLedger
  changed: boolean
  acceptedTaskIds: string[]
  staffingProposals: BarkosStaffingProposalEvent[]
}

function objectiveRunId(ledger: BarkosWorkLedger, taskId: string): string | null {
  const task = ledger.plans.flatMap((plan) => plan.tasks).find((entry) => entry.id === taskId)
  return (
    ledger.objectives.find((objective) => objective.id === task?.objectiveId)?.orchestrationBinding
      ?.runId ?? null
  )
}

export async function syncBarkosWorkerReports(args: {
  ledger: BarkosWorkLedger
  workerSessions: Readonly<Record<string, BarkosWorkerSessionBinding>>
}): Promise<BarkosWorkerReportSyncResult> {
  let ledger = args.ledger
  let changed = false
  const acceptedTaskIds: string[] = []
  const staffingProposals: BarkosStaffingProposalEvent[] = []
  const taskListRequests = new Map<string, Promise<RuntimeTaskList>>()

  for (const dispatch of args.ledger.dispatches.filter((entry) => entry.state === 'running')) {
    const binding = args.workerSessions[dispatch.workerId]
    const target = binding ? runtimeTargetForBarkosExecutionHost(binding.executionHostId) : null
    const runId = objectiveRunId(args.ledger, dispatch.taskId)
    if (!target || !runId || !dispatch.orchestrationTaskId) {
      continue
    }
    const requestKey = `${target.kind}:${target.kind === 'environment' ? target.environmentId : ''}:${runId}`
    let request = taskListRequests.get(requestKey)
    if (!request) {
      request = callRuntimeRpc<RuntimeTaskList>(target, 'orchestration.taskList', { run: runId })
      taskListRequests.set(requestKey, request)
    }
    const runtimeTask = (await request).tasks.find(
      (task) => task.id === dispatch.orchestrationTaskId
    )
    if (
      !runtimeTask ||
      !['completed', 'failed'].includes(runtimeTask.status) ||
      !runtimeTask.result
    ) {
      continue
    }
    const reconciled = reconcileBarkosWorkerReport({
      ledger,
      orchestrationTaskId: dispatch.orchestrationTaskId,
      result: runtimeTask.result
    })
    if (!reconciled.changed) {
      continue
    }
    ledger = await window.api.barkosWorkLedger.save(reconciled.ledger)
    changed = true
    if (reconciled.accepted) {
      acceptedTaskIds.push(dispatch.taskId)
    }
    const task = ledger.plans
      .flatMap((plan) => plan.tasks)
      .find((entry) => entry.id === dispatch.taskId)
    if (reconciled.staffingProposal && task) {
      staffingProposals.push({
        taskId: task.id,
        objectiveId: task.objectiveId,
        proposal: reconciled.staffingProposal
      })
    }
  }

  return { ledger, changed, acceptedTaskIds, staffingProposals }
}
