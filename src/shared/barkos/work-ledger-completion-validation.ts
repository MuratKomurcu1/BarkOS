import type { z } from 'zod'
import type { BarkosAssignment, BarkosEvidenceManifest, BarkosWorkLedger } from './work-ledger'

const ACTIVE_ASSIGNMENT_STATUSES = new Set<BarkosAssignment['status']>([
  'proposed',
  'approved',
  'dispatched'
])

function indexEvidenceByAssignment(
  ledger: BarkosWorkLedger
): Map<string, BarkosEvidenceManifest[]> {
  const evidenceByAssignment = new Map<string, BarkosEvidenceManifest[]>()
  for (const manifest of ledger.evidence) {
    const current = evidenceByAssignment.get(manifest.assignmentId) ?? []
    current.push(manifest)
    evidenceByAssignment.set(manifest.assignmentId, current)
  }
  return evidenceByAssignment
}

function indexAssignmentsByTask(ledger: BarkosWorkLedger): Map<string, BarkosAssignment[]> {
  const assignmentsByTask = new Map<string, BarkosAssignment[]>()
  for (const assignment of ledger.assignments) {
    const current = assignmentsByTask.get(assignment.taskId) ?? []
    current.push(assignment)
    assignmentsByTask.set(assignment.taskId, current)
  }
  return assignmentsByTask
}

function validateAssignmentCompletion(
  ledger: BarkosWorkLedger,
  evidenceByAssignment: ReadonlyMap<string, BarkosEvidenceManifest[]>,
  context: z.RefinementCtx
): void {
  ledger.assignments.forEach((assignment, index) => {
    const hasAcceptedEvidence = (evidenceByAssignment.get(assignment.id) ?? []).some(
      (manifest) => manifest.status === 'accepted'
    )
    if (assignment.status === 'completed' && !hasAcceptedEvidence) {
      context.addIssue({
        code: 'custom',
        message: 'Completed assignment has no accepted evidence',
        path: ['assignments', index, 'status']
      })
    }
  })
}

function validateActiveAssignments(
  ledger: BarkosWorkLedger,
  assignmentsByTask: ReadonlyMap<string, BarkosAssignment[]>,
  context: z.RefinementCtx
): void {
  const assignmentIndexes = new Map(
    ledger.assignments.map((assignment, index) => [assignment.id, index])
  )
  for (const assignments of assignmentsByTask.values()) {
    const activeAssignments = assignments.filter((assignment) =>
      ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)
    )
    activeAssignments.slice(1).forEach((assignment) => {
      context.addIssue({
        code: 'custom',
        message: 'Task has multiple active assignments',
        path: ['assignments', assignmentIndexes.get(assignment.id) ?? 0, 'status']
      })
    })
  }
}

function validateTaskCompletion(
  ledger: BarkosWorkLedger,
  assignmentsByTask: ReadonlyMap<string, BarkosAssignment[]>,
  evidenceByAssignment: ReadonlyMap<string, BarkosEvidenceManifest[]>,
  context: z.RefinementCtx
): void {
  ledger.plans.forEach((plan, planIndex) => {
    plan.tasks.forEach((task, taskIndex) => {
      if (task.status !== 'completed') {
        return
      }
      const accepted = (assignmentsByTask.get(task.id) ?? []).some((assignment) =>
        (evidenceByAssignment.get(assignment.id) ?? []).some(
          (manifest) => manifest.status === 'accepted'
        )
      )
      if (!accepted) {
        context.addIssue({
          code: 'custom',
          message: 'Completed task has no accepted evidence',
          path: ['plans', planIndex, 'tasks', taskIndex, 'status']
        })
      }
    })
  })
}

function validateDispatchApprovals(ledger: BarkosWorkLedger, context: z.RefinementCtx): void {
  const approvedDispatchGates = new Set(
    ledger.approvalGates
      .filter((gate) => gate.kind === 'dispatch' && gate.status === 'approved')
      .map((gate) => `${gate.taskId}:${gate.assignmentId ?? ''}`)
  )
  const tasks = new Map(ledger.plans.flatMap((plan) => plan.tasks.map((task) => [task.id, task])))
  ledger.assignments.forEach((assignment, index) => {
    const task = tasks.get(assignment.taskId)
    if (
      task?.approvalPolicy === 'before-dispatch' &&
      ['dispatched', 'completed'].includes(assignment.status) &&
      !approvedDispatchGates.has(`${task.id}:${assignment.id}`)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Assignment was dispatched without its required approval',
        path: ['assignments', index, 'status']
      })
    }
  })
}

function validateObjectiveCompletion(ledger: BarkosWorkLedger, context: z.RefinementCtx): void {
  const plansById = new Map(ledger.plans.map((plan) => [plan.id, plan]))
  ledger.objectives.forEach((objective, index) => {
    if (objective.status !== 'completed' || !objective.activePlanId) {
      return
    }
    const plan = plansById.get(objective.activePlanId)
    if (!plan || plan.tasks.some((task) => task.status !== 'completed')) {
      context.addIssue({
        code: 'custom',
        message: 'Completed objective has unfinished tasks',
        path: ['objectives', index, 'status']
      })
    }
  })
}

export function validateBarkosWorkCompletion(
  ledger: BarkosWorkLedger,
  context: z.RefinementCtx
): void {
  const evidenceByAssignment = indexEvidenceByAssignment(ledger)
  const assignmentsByTask = indexAssignmentsByTask(ledger)
  validateAssignmentCompletion(ledger, evidenceByAssignment, context)
  validateActiveAssignments(ledger, assignmentsByTask, context)
  validateTaskCompletion(ledger, assignmentsByTask, evidenceByAssignment, context)
  validateDispatchApprovals(ledger, context)
  validateObjectiveCompletion(ledger, context)
}
