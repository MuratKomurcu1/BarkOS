import { z } from 'zod'
import type { BarkosPlan, BarkosTask, BarkosWorkLedger } from './work-ledger'
import { parseBarkosWorkLedger } from './work-ledger'
import {
  barkosAdapterError,
  callBarkosOrchestrationRpc,
  persistBarkosLedgerMutation,
  type BarkosOrchestrationRpcCaller,
  type BarkosWorkLedgerPersist
} from './orchestration-adapter-support'
import {
  barkosObjectiveSpec,
  barkosTaskResult,
  barkosTaskSpec,
  bindBarkosObjectiveToRun,
  bindBarkosTaskToOrca,
  desiredOrcaTaskStatus,
  topologicalBarkosTasks
} from './orchestration-plan-state'

const runResponseSchema = z
  .object({ run: z.object({ id: z.string().trim().min(1).max(256) }).passthrough() })
  .passthrough()
const taskResponseSchema = z
  .object({ task: z.object({ id: z.string().trim().min(1).max(256) }).passthrough() })
  .passthrough()

const MATERIALIZABLE_PLAN_STATUSES = new Set<BarkosPlan['status']>([
  'approved',
  'active',
  'completed'
])
const MATERIALIZABLE_TASK_STATUSES = new Set<BarkosTask['status']>([
  'blocked',
  'ready',
  'completed',
  'failed',
  'cancelled'
])

export async function materializeBarkosPlanInOrca(args: {
  ledger: BarkosWorkLedger
  objectiveId: string
  coordinatorTerminalHandle: string
  runtimeEnvironmentId: string | null
  callRpc: BarkosOrchestrationRpcCaller
  persist: BarkosWorkLedgerPersist
  now?: () => number
}): Promise<{ ledger: BarkosWorkLedger; runCreated: boolean; tasksCreated: number }> {
  let ledger = parseBarkosWorkLedger(args.ledger)
  const objective = ledger.objectives.find((entry) => entry.id === args.objectiveId)
  const plan = ledger.plans.find((entry) => entry.id === objective?.activePlanId)
  if (!objective || !plan || !MATERIALIZABLE_PLAN_STATUSES.has(plan.status)) {
    throw barkosAdapterError(
      'precondition-failed',
      'Objective requires an approved active plan before BarkOS materialization',
      'plan-precondition'
    )
  }
  const unsupportedTask = plan.tasks.find(
    (task) => !task.orchestrationTaskId && !MATERIALIZABLE_TASK_STATUSES.has(task.status)
  )
  if (unsupportedTask) {
    throw barkosAdapterError(
      'precondition-failed',
      `Task ${unsupportedTask.id} is ${unsupportedTask.status} and cannot be materialized`,
      'plan-precondition'
    )
  }

  const existingBinding = objective.orchestrationBinding
  if (existingBinding && existingBinding.runtimeEnvironmentId !== args.runtimeEnvironmentId) {
    throw barkosAdapterError(
      'precondition-failed',
      'Objective is already bound to a different BarkOS runtime home',
      'run-binding'
    )
  }

  let runId = existingBinding?.runId
  let runCreated = false
  if (runId) {
    const response = runResponseSchema.safeParse(
      await callBarkosOrchestrationRpc({
        callRpc: args.callRpc,
        method: 'orchestration.runUse',
        params: { id: runId, from: args.coordinatorTerminalHandle },
        stage: 'run-use'
      })
    )
    if (!response.success || response.data.run.id !== runId) {
      throw barkosAdapterError(
        'invalid-rpc-response',
        'BarkOS returned an invalid Run binding response',
        'run-use',
        'possible'
      )
    }
  } else {
    const response = runResponseSchema.safeParse(
      await callBarkosOrchestrationRpc({
        callRpc: args.callRpc,
        method: 'orchestration.runCreate',
        params: {
          objective: barkosObjectiveSpec(objective),
          from: args.coordinatorTerminalHandle
        },
        stage: 'run-create'
      })
    )
    if (!response.success) {
      throw barkosAdapterError(
        'invalid-rpc-response',
        'BarkOS returned an invalid Run creation response',
        'run-create',
        'possible'
      )
    }
    runId = response.data.run.id
    runCreated = true
    ledger = await persistBarkosLedgerMutation({
      ledger: bindBarkosObjectiveToRun({
        ledger,
        objectiveId: objective.id,
        planId: plan.id,
        runId,
        runtimeEnvironmentId: args.runtimeEnvironmentId,
        now: (args.now ?? Date.now)()
      }),
      persist: args.persist,
      stage: 'run-create',
      effects: 'applied'
    })
  }

  let tasksCreated = 0
  for (const sourceTask of topologicalBarkosTasks(plan)) {
    let task = ledger.plans
      .find((entry) => entry.id === plan.id)
      ?.tasks.find((entry) => entry.id === sourceTask.id)
    if (!task) {
      throw barkosAdapterError(
        'precondition-failed',
        `Task ${sourceTask.id} disappeared during materialization`,
        'task-binding'
      )
    }
    if (!task.orchestrationTaskId) {
      const currentPlan = ledger.plans.find((entry) => entry.id === plan.id) as BarkosPlan
      const taskIds = new Map(
        currentPlan.tasks.map((entry) => [entry.id, entry.orchestrationTaskId])
      )
      const dependencyIds = task.dependencyIds.map((id) => taskIds.get(id))
      if (dependencyIds.some((id) => !id)) {
        throw barkosAdapterError(
          'precondition-failed',
          `Task ${task.id} has an unbound BarkOS dependency`,
          'task-binding'
        )
      }
      const response = taskResponseSchema.safeParse(
        await callBarkosOrchestrationRpc({
          callRpc: args.callRpc,
          method: 'orchestration.taskCreate',
          params: {
            spec: barkosTaskSpec(task),
            taskTitle: task.title,
            displayName: task.title,
            deps: JSON.stringify(dependencyIds),
            run: runId,
            callerTerminalHandle: args.coordinatorTerminalHandle
          },
          stage: 'task-create'
        })
      )
      if (!response.success) {
        throw barkosAdapterError(
          'invalid-rpc-response',
          `BarkOS returned an invalid Task response for ${task.id}`,
          'task-create',
          'possible'
        )
      }
      ledger = await persistBarkosLedgerMutation({
        ledger: bindBarkosTaskToOrca({
          ledger,
          planId: plan.id,
          taskId: task.id,
          orchestrationTaskId: response.data.task.id,
          now: (args.now ?? Date.now)()
        }),
        persist: args.persist,
        stage: 'task-create',
        effects: 'applied'
      })
      tasksCreated += 1
      task = ledger.plans
        .find((entry) => entry.id === plan.id)
        ?.tasks.find((entry) => entry.id === sourceTask.id)
    }
    const status = task ? desiredOrcaTaskStatus(task, plan) : null
    if (task?.orchestrationTaskId && status) {
      await callBarkosOrchestrationRpc({
        callRpc: args.callRpc,
        method: 'orchestration.taskUpdate',
        params: {
          id: task.orchestrationTaskId,
          status,
          result: barkosTaskResult(task),
          run: runId,
          callerTerminalHandle: args.coordinatorTerminalHandle
        },
        stage: 'task-update'
      })
    }
  }

  return { ledger, runCreated, tasksCreated }
}
