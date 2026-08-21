import type { z } from 'zod'
import type { BarkosWorkLedger } from './work-ledger'

function addDuplicateBindingIssues(
  values: readonly { id: string; bindingId: string | null; path: (string | number)[] }[],
  label: string,
  context: z.RefinementCtx
): void {
  const seen = new Map<string, string>()
  for (const value of values) {
    if (!value.bindingId) {
      continue
    }
    const existing = seen.get(value.bindingId)
    if (existing) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate ${label} binding ${value.bindingId} for ${existing} and ${value.id}`,
        path: value.path
      })
    } else {
      seen.set(value.bindingId, value.id)
    }
  }
}

export function validateBarkosOrchestrationBindings(
  ledger: BarkosWorkLedger,
  context: z.RefinementCtx
): void {
  const objectives = new Map(ledger.objectives.map((objective) => [objective.id, objective]))
  const tasks = new Map(ledger.plans.flatMap((plan) => plan.tasks.map((task) => [task.id, task])))

  addDuplicateBindingIssues(
    ledger.objectives.map((objective, index) => ({
      id: objective.id,
      bindingId: objective.orchestrationBinding?.runId ?? null,
      path: ['objectives', index, 'orchestrationBinding', 'runId']
    })),
    'orchestration Run',
    context
  )
  addDuplicateBindingIssues(
    ledger.plans.flatMap((plan, planIndex) =>
      plan.tasks.map((task, taskIndex) => ({
        id: task.id,
        bindingId: task.orchestrationTaskId,
        path: ['plans', planIndex, 'tasks', taskIndex, 'orchestrationTaskId']
      }))
    ),
    'orchestration Task',
    context
  )

  ledger.plans.forEach((plan, planIndex) => {
    const objective = objectives.get(plan.objectiveId)
    plan.tasks.forEach((task, taskIndex) => {
      if (task.orchestrationTaskId && !objective?.orchestrationBinding) {
        context.addIssue({
          code: 'custom',
          message: 'Orchestration Task binding requires an Objective Run binding',
          path: ['plans', planIndex, 'tasks', taskIndex, 'orchestrationTaskId']
        })
      }
    })
  })

  ledger.dispatches.forEach((dispatch, index) => {
    const bindingIds = [
      dispatch.orchestrationRunId,
      dispatch.orchestrationTaskId,
      dispatch.orchestrationDispatchId
    ]
    const populatedCount = bindingIds.filter((value) => value !== null).length
    if (populatedCount !== 0 && populatedCount !== bindingIds.length) {
      context.addIssue({
        code: 'custom',
        message: 'Dispatch orchestration binding must be entirely present or absent',
        path: ['dispatches', index, 'orchestrationDispatchId']
      })
      return
    }
    if (populatedCount === 0) {
      if (['running', 'succeeded'].includes(dispatch.state)) {
        context.addIssue({
          code: 'custom',
          message: 'Active dispatch is missing its orchestration binding',
          path: ['dispatches', index, 'orchestrationDispatchId']
        })
      }
      return
    }

    const task = tasks.get(dispatch.taskId)
    const objective = task ? objectives.get(task.objectiveId) : undefined
    if (
      dispatch.orchestrationRunId !== objective?.orchestrationBinding?.runId ||
      dispatch.orchestrationTaskId !== task?.orchestrationTaskId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Dispatch orchestration binding does not match its Objective and Task',
        path: ['dispatches', index, 'orchestrationRunId']
      })
    }
  })
}
