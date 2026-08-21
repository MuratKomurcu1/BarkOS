import type { z } from 'zod'
import type { BarkosTask, BarkosWorkLedger } from './work-ledger'
import { validateBarkosWorkCompletion } from './work-ledger-completion-validation'
import { validateBarkosMemoryDeliveries } from './work-ledger-memory-delivery-validation'
import { validateBarkosOrchestrationBindings } from './work-ledger-orchestration-validation'
import { validateBarkosDispatchStops } from './work-ledger-stop-validation'

type IssuePath = (string | number)[]

function addDuplicateIssues(
  values: readonly { id: string }[],
  path: IssuePath,
  label: string,
  context: z.RefinementCtx
): void {
  const seen = new Set<string>()
  values.forEach((value, index) => {
    if (seen.has(value.id)) {
      context.addIssue({
        code: 'custom',
        message: `Duplicate ${label} id: ${value.id}`,
        path: [...path, index, 'id']
      })
    }
    seen.add(value.id)
  })
}

function findDependencyCycle(tasks: readonly BarkosTask[]): string[] | null {
  const dependencies = new Map(tasks.map((task) => [task.id, task.dependencyIds]))
  const visited = new Set<string>()
  const visiting = new Set<string>()
  const stack: string[] = []
  const visit = (taskId: string): string[] | null => {
    if (visiting.has(taskId)) {
      return [...stack.slice(stack.indexOf(taskId)), taskId]
    }
    if (visited.has(taskId)) {
      return null
    }
    visiting.add(taskId)
    stack.push(taskId)
    for (const dependencyId of dependencies.get(taskId) ?? []) {
      const cycle = visit(dependencyId)
      if (cycle) {
        return cycle
      }
    }
    stack.pop()
    visiting.delete(taskId)
    visited.add(taskId)
    return null
  }
  for (const task of tasks) {
    const cycle = visit(task.id)
    if (cycle) {
      return cycle
    }
  }
  return null
}

function validatePlans(ledger: BarkosWorkLedger, context: z.RefinementCtx): void {
  const objectiveIds = new Set(ledger.objectives.map((objective) => objective.id))
  const allTasks = ledger.plans.flatMap((plan) => plan.tasks)
  addDuplicateIssues(allTasks, ['plans'], 'task', context)
  for (const [planIndex, plan] of ledger.plans.entries()) {
    if (!objectiveIds.has(plan.objectiveId)) {
      context.addIssue({
        code: 'custom',
        message: 'Unknown objective',
        path: ['plans', planIndex, 'objectiveId']
      })
    }
    addDuplicateIssues(plan.tasks, ['plans', planIndex, 'tasks'], 'task', context)
    const planTaskIds = new Set(plan.tasks.map((task) => task.id))
    const tasksById = new Map(plan.tasks.map((task) => [task.id, task]))
    for (const [taskIndex, task] of plan.tasks.entries()) {
      const taskPath = ['plans', planIndex, 'tasks', taskIndex]
      if (task.planId !== plan.id || task.objectiveId !== plan.objectiveId) {
        context.addIssue({
          code: 'custom',
          message: 'Task scope does not match its plan',
          path: taskPath
        })
      }
      if (new Set(task.dependencyIds).size !== task.dependencyIds.length) {
        context.addIssue({
          code: 'custom',
          message: 'Duplicate task dependency',
          path: [...taskPath, 'dependencyIds']
        })
      }
      for (const dependencyId of task.dependencyIds) {
        if (!planTaskIds.has(dependencyId) || dependencyId === task.id) {
          context.addIssue({
            code: 'custom',
            message: 'Invalid task dependency',
            path: [...taskPath, 'dependencyIds']
          })
        }
      }
      const dependenciesSettled = task.dependencyIds.every(
        (dependencyId) => tasksById.get(dependencyId)?.status === 'completed'
      )
      if (
        !dependenciesSettled &&
        ['ready', 'assigned', 'running', 'review', 'completed'].includes(task.status)
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Runnable task has incomplete dependencies',
          path: [...taskPath, 'status']
        })
      }
    }
    const cycle = findDependencyCycle(plan.tasks)
    if (cycle) {
      context.addIssue({
        code: 'custom',
        message: `Task dependency cycle: ${cycle.join(' -> ')}`,
        path: ['plans', planIndex, 'tasks']
      })
    }
  }
}

function validateReferences(ledger: BarkosWorkLedger, context: z.RefinementCtx): void {
  const plans = new Map(ledger.plans.map((plan) => [plan.id, plan]))
  const tasks = new Map(ledger.plans.flatMap((plan) => plan.tasks.map((task) => [task.id, task])))
  const assignments = new Map(ledger.assignments.map((assignment) => [assignment.id, assignment]))
  const dispatches = new Map(ledger.dispatches.map((dispatch) => [dispatch.id, dispatch]))
  for (const [index, objective] of ledger.objectives.entries()) {
    if (objective.companyId !== ledger.companyId) {
      context.addIssue({
        code: 'custom',
        message: 'Objective company mismatch',
        path: ['objectives', index, 'companyId']
      })
    }
    const activePlan = objective.activePlanId ? plans.get(objective.activePlanId) : null
    if (objective.activePlanId && activePlan?.objectiveId !== objective.id) {
      context.addIssue({
        code: 'custom',
        message: 'Invalid active plan',
        path: ['objectives', index, 'activePlanId']
      })
    }
  }
  ledger.assignments.forEach((assignment, index) => {
    if (!tasks.has(assignment.taskId)) {
      context.addIssue({
        code: 'custom',
        message: 'Unknown assignment task',
        path: ['assignments', index, 'taskId']
      })
    }
  })
  ledger.dispatches.forEach((dispatch, index) => {
    const assignment = assignments.get(dispatch.assignmentId)
    if (
      !assignment ||
      assignment.taskId !== dispatch.taskId ||
      assignment.workerId !== dispatch.workerId
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Dispatch does not match its assignment',
        path: ['dispatches', index, 'assignmentId']
      })
    }
  })
  ledger.evidence.forEach((manifest, index) => {
    const assignment = assignments.get(manifest.assignmentId)
    const dispatch = dispatches.get(manifest.dispatchId)
    if (
      !assignment ||
      !dispatch ||
      assignment.taskId !== manifest.taskId ||
      dispatch.assignmentId !== assignment.id
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Evidence does not match its dispatch',
        path: ['evidence', index]
      })
    }
    const reviewed = manifest.status === 'accepted' || manifest.status === 'rejected'
    if (reviewed !== (manifest.reviewedAt !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Evidence review state is inconsistent',
        path: ['evidence', index, 'reviewedAt']
      })
    }
    const hasMaterialEvidence =
      manifest.tests.length > 0 ||
      manifest.changedFiles.length > 0 ||
      manifest.diffSummary !== null ||
      manifest.terminalExcerpts.length > 0 ||
      manifest.screenshots.length > 0 ||
      manifest.risks.length > 0 ||
      manifest.unresolvedDecisions.length > 0
    if (manifest.status !== 'draft' && !hasMaterialEvidence) {
      context.addIssue({
        code: 'custom',
        message: 'Submitted evidence has no bounded artifacts',
        path: ['evidence', index]
      })
    }
    if (manifest.status !== 'draft' && dispatch?.state !== 'succeeded') {
      context.addIssue({
        code: 'custom',
        message: 'Submitted evidence requires a succeeded dispatch',
        path: ['evidence', index, 'dispatchId']
      })
    }
  })
  const evidenceByDispatch = new Map<string, number>()
  ledger.evidence.forEach((manifest, index) => {
    if (evidenceByDispatch.has(manifest.dispatchId)) {
      context.addIssue({
        code: 'custom',
        message: 'Dispatch has multiple evidence manifests',
        path: ['evidence', index, 'dispatchId']
      })
    }
    evidenceByDispatch.set(manifest.dispatchId, index)
  })
  ledger.approvalGates.forEach((gate, index) => {
    if (!tasks.has(gate.taskId) || (gate.assignmentId && !assignments.has(gate.assignmentId))) {
      context.addIssue({
        code: 'custom',
        message: 'Approval gate target is unknown',
        path: ['approvalGates', index]
      })
    }
    const pending = gate.status === 'pending'
    const emptyResolution =
      gate.resolvedAt === null && gate.resolvedBy === null && gate.resolution === null
    const completeResolution =
      gate.resolvedAt !== null && gate.resolvedBy !== null && gate.resolution !== null
    if ((pending && !emptyResolution) || (!pending && !completeResolution)) {
      context.addIssue({
        code: 'custom',
        message: 'Approval gate resolution state is inconsistent',
        path: ['approvalGates', index, 'status']
      })
    }
  })

  const attemptsByAssignment = new Map<string, Set<number>>()
  ledger.dispatches.forEach((dispatch, index) => {
    const attempts = attemptsByAssignment.get(dispatch.assignmentId) ?? new Set<number>()
    if (attempts.has(dispatch.attempt)) {
      context.addIssue({
        code: 'custom',
        message: 'Duplicate dispatch attempt',
        path: ['dispatches', index, 'attempt']
      })
    }
    attempts.add(dispatch.attempt)
    attemptsByAssignment.set(dispatch.assignmentId, attempts)
    const terminalState = ['succeeded', 'failed', 'circuit-broken', 'cancelled'].includes(
      dispatch.state
    )
    if (terminalState !== (dispatch.finishedAt !== null)) {
      context.addIssue({
        code: 'custom',
        message: 'Dispatch finish state is inconsistent',
        path: ['dispatches', index, 'finishedAt']
      })
    }
    if (dispatch.state === 'failed' && dispatch.error === null) {
      context.addIssue({
        code: 'custom',
        message: 'Failed dispatch must record an error',
        path: ['dispatches', index, 'error']
      })
    }
  })
  validateBarkosMemoryDeliveries(ledger, context)
  validateBarkosDispatchStops(ledger, context)
}

export function validateBarkosWorkLedger(ledger: BarkosWorkLedger, context: z.RefinementCtx): void {
  addDuplicateIssues(ledger.objectives, ['objectives'], 'objective', context)
  addDuplicateIssues(ledger.plans, ['plans'], 'plan', context)
  addDuplicateIssues(ledger.assignments, ['assignments'], 'assignment', context)
  addDuplicateIssues(ledger.dispatches, ['dispatches'], 'dispatch', context)
  addDuplicateIssues(ledger.evidence, ['evidence'], 'evidence', context)
  addDuplicateIssues(ledger.approvalGates, ['approvalGates'], 'approval gate', context)
  validatePlans(ledger, context)
  validateReferences(ledger, context)
  validateBarkosWorkCompletion(ledger, context)
  validateBarkosOrchestrationBindings(ledger, context)
  if (ledger.updatedAt < ledger.createdAt) {
    context.addIssue({
      code: 'custom',
      message: 'updatedAt precedes createdAt',
      path: ['updatedAt']
    })
  }
}
