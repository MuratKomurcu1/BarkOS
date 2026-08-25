import type { BarkosCompany, BarkosWorker } from '../../../shared/barkos/company'
import {
  createBarkosProjectIntakePlan,
  ensureBarkosProjectAnalyst
} from '../../../shared/barkos/project-intake'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import type { BarkosWorkLedger } from '../../../shared/barkos/work-ledger'
import { useAppStore } from '@/store'
import {
  dispatchBarkosAssignmentOnRuntime,
  materializeBarkosPlanOnRuntime
} from './barkos-orchestration-runtime'
import type { BarkosWorkerLaunchTarget } from './barkos-worker-launch-targets'
import {
  availableBarkosAgentsOnTarget,
  describeBarkosWorkerTargetGap,
  ensureBarkosProjectWorkerTarget,
  resolveBarkosDefaultWorkerTarget,
  resolveBarkosWorkerTargetOnWorkspace
} from './barkos-project-worker-target'
import { launchBarkosWorkerSession } from './launch-barkos-worker-session'
import {
  resolveCurrentBarkosWorkerRuntime,
  waitForBarkosWorkerRuntime
} from './ensure-barkos-worker-session'
import { waitForBarkosCoordinatorReadiness } from './barkos-coordinator-readiness'

export type BarkosProjectIntakeResult =
  | {
      company: BarkosCompany
      analystWorkerId: string
      state: 'cancelled'
    }
  | {
      company: BarkosCompany
      objectiveId: string
      analystWorkerId: string
      state: 'planned' | 'started'
    }

function bindingMatchesTarget(
  binding: BarkosWorkerSessionBinding,
  target: BarkosWorkerLaunchTarget
): boolean {
  return (
    binding.targetId === target.id &&
    binding.workspaceId === target.workspaceId &&
    binding.executionHostId === target.executionHostId
  )
}

export async function ensureBarkosWorkerOnTarget(args: {
  company: BarkosCompany
  worker: BarkosWorker
  target: BarkosWorkerLaunchTarget
}) {
  const ready = resolveCurrentBarkosWorkerRuntime(args.worker.id)
  if (ready && bindingMatchesTarget(ready.binding, args.target)) {
    return ready
  }
  const result = await launchBarkosWorkerSession({
    company: args.company,
    workerId: args.worker.id,
    target: args.target
  })
  if (!result.ok) {
    throw new Error(`Çalışan ${args.worker.name} başlatılamadı: ${result.reason}`)
  }
  if (!result.binding.tabId) {
    throw new Error(`Çalışan ${args.worker.name} için terminal kimliği oluşturulamadı`)
  }
  return waitForBarkosWorkerRuntime({
    workerId: args.worker.id,
    fallbackBinding: result.binding,
    timeoutMs: 30_000,
    accept: (runtime) => bindingMatchesTarget(runtime.binding, args.target),
    timeoutMessage: `${args.worker.name} ajan oturumu 30 saniye içinde hazır olmadı`
  })
}

type BarkosObjectiveStartupResult = { started: number; awaitingApproval: number }

const barkosObjectiveStarts = new Map<string, Promise<BarkosObjectiveStartupResult>>()

export function startBarkosObjectiveTasks(args: {
  company: BarkosCompany
  ledger: BarkosWorkLedger
  objectiveId: string
  taskIds?: readonly string[]
}): Promise<BarkosObjectiveStartupResult> {
  const key = `${args.company.id}:${args.objectiveId}`
  const active = barkosObjectiveStarts.get(key)
  if (active) {
    return active
  }
  const start = startBarkosObjectiveTasksUnlocked(args).finally(() => {
    if (barkosObjectiveStarts.get(key) === start) {
      barkosObjectiveStarts.delete(key)
    }
  })
  barkosObjectiveStarts.set(key, start)
  return start
}

async function startBarkosObjectiveTasksUnlocked(args: {
  company: BarkosCompany
  ledger: BarkosWorkLedger
  objectiveId: string
  taskIds?: readonly string[]
}): Promise<BarkosObjectiveStartupResult> {
  const lead = args.company.workers.find((worker) => worker.id === args.company.leadWorkerId)
  if (!lead) {
    throw new Error('BarkOS baş ajanı bulunamadı')
  }
  const target = resolveBarkosDefaultWorkerTarget(lead)
  if (!target) {
    return { started: 0, awaitingApproval: 0 }
  }
  await Promise.all([
    useAppStore.getState().loadBarkosWorkerSessions(args.company.id),
    useAppStore.getState().loadBarkosControlPolicy(args.company.id)
  ])
  const coordinatorRuntime = await ensureBarkosWorkerOnTarget({
    company: args.company,
    worker: lead,
    target
  })
  await waitForBarkosCoordinatorReadiness({
    binding: coordinatorRuntime.binding,
    terminalHandle: coordinatorRuntime.terminalHandle
  })
  const materializedLedger = (
    await materializeBarkosPlanOnRuntime({
      ledger: args.ledger,
      objectiveId: args.objectiveId,
      coordinator: coordinatorRuntime.binding,
      coordinatorTerminalHandle: coordinatorRuntime.terminalHandle
    })
  ).ledger
  await useAppStore.getState().loadBarkosWorkLedger(args.company.id)

  const allowedTaskIds = args.taskIds ? new Set(args.taskIds) : null
  const readyTaskIds = materializedLedger.plans
    .filter((plan) => plan.objectiveId === args.objectiveId)
    .flatMap((plan) => plan.tasks)
    .filter((task) => task.status === 'ready' && (!allowedTaskIds || allowedTaskIds.has(task.id)))
    .map((task) => task.id)
  let started = 0
  let awaitingApproval = 0
  for (const taskId of readyTaskIds) {
    const currentLedger = useAppStore.getState().barkosWorkLedger ?? materializedLedger
    const existingAssignment = currentLedger.assignments.find(
      (entry) =>
        entry.taskId === taskId &&
        entry.status === 'approved' &&
        !currentLedger.dispatches.some((dispatch) => dispatch.assignmentId === entry.id)
    )
    const assignedLedger = existingAssignment
      ? currentLedger
      : await useAppStore.getState().assignBarkosReadyTask(taskId)
    const assignment =
      existingAssignment ??
      assignedLedger.assignments.find(
        (entry) => entry.taskId === taskId && entry.status === 'approved'
      )
    if (!assignment) {
      throw new Error(`BarkOS ${taskId} görevini atayamadı`)
    }
    const pendingGate = assignedLedger.approvalGates.some(
      (gate) =>
        gate.kind === 'dispatch' && gate.assignmentId === assignment.id && gate.status === 'pending'
    )
    if (pendingGate) {
      awaitingApproval += 1
      continue
    }
    const worker = args.company.workers.find((entry) => entry.id === assignment.workerId)
    if (!worker) {
      throw new Error(`Atanan BarkOS çalışanı bulunamadı: ${assignment.workerId}`)
    }
    const workerTarget =
      worker.id === lead.id ? target : resolveBarkosWorkerTargetOnWorkspace(worker, target)
    if (!workerTarget) {
      throw new Error(
        describeBarkosWorkerTargetGap(worker) ??
          `${worker.name} için seçili çalışma alanında kullanılabilir ajan bulunamadı`
      )
    }
    const workerRuntime =
      worker.id === lead.id
        ? coordinatorRuntime
        : await ensureBarkosWorkerOnTarget({
            company: args.company,
            worker,
            target: workerTarget
          })
    await dispatchBarkosAssignmentOnRuntime({
      ledger: assignedLedger,
      assignmentId: assignment.id,
      coordinator: coordinatorRuntime.binding,
      coordinatorTerminalHandle: coordinatorRuntime.terminalHandle,
      worker: workerRuntime.binding,
      workerTerminalHandle: workerRuntime.terminalHandle
    })
    started += 1
    await useAppStore.getState().loadBarkosWorkLedger(args.company.id)
  }
  return { started, awaitingApproval }
}

export async function startBarkosProjectIntake(args: {
  company: BarkosCompany
  request: string
}): Promise<BarkosProjectIntakeResult> {
  const prepared = ensureBarkosProjectAnalyst(args.company)
  const company = prepared.changed
    ? await useAppStore.getState().saveBarkosCompany(prepared.company)
    : args.company
  const analyst = company.workers.find((worker) => worker.id === prepared.analyst.id)
  if (!analyst) {
    throw new Error('BarkOS proje ekibini hazırlayamadı')
  }
  // Why: fail before the folder picker when the analyst's agent cannot launch
  // anywhere, so the user fixes the real cause instead of picking a folder and
  // landing in a plain shell.
  const preflightGap = describeBarkosWorkerTargetGap(analyst)
  if (preflightGap) {
    throw new Error(preflightGap)
  }
  let target: BarkosWorkerLaunchTarget | null
  try {
    target = await ensureBarkosProjectWorkerTarget(analyst)
  } catch (error) {
    // The folder was added but the agent still cannot launch: report the precise gap.
    const gap = describeBarkosWorkerTargetGap(analyst)
    throw gap ? new Error(gap) : error
  }
  if (!target) {
    return {
      company,
      analystWorkerId: analyst.id,
      state: 'cancelled'
    }
  }

  await Promise.all([
    useAppStore.getState().loadBarkosWorkerSessions(company.id),
    useAppStore.getState().loadBarkosControlPolicy(company.id),
    useAppStore.getState().loadBarkosWorkLedger(company.id)
  ])

  const plannedLedger = await useAppStore
    .getState()
    .createBarkosObjectivePlan(
      createBarkosProjectIntakePlan(company, args.request, availableBarkosAgentsOnTarget(target))
    )
  const objective = plannedLedger.objectives.at(-1)
  const plan = plannedLedger.plans.find((entry) => entry.id === objective?.activePlanId)
  const analysisTask = plan?.tasks.find((task) =>
    task.requiredCapabilities.includes('project-analysis')
  )
  if (!objective || !analysisTask) {
    throw new Error('BarkOS proje inceleme planını oluşturamadı')
  }

  let startup: Awaited<ReturnType<typeof startBarkosObjectiveTasks>>
  try {
    startup = await startBarkosObjectiveTasks({
      company,
      ledger: plannedLedger,
      objectiveId: objective.id,
      taskIds: [analysisTask.id]
    })
  } catch (error) {
    useAppStore.setState({
      barkosWorkLedgerError: error instanceof Error ? error.message : String(error)
    })
    throw error
  }

  return {
    company,
    objectiveId: objective.id,
    analystWorkerId: analyst.id,
    state: startup.started > 0 ? 'started' : 'planned'
  }
}
