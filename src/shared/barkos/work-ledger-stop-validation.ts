import type { z } from 'zod'
import type { BarkosAssignment, BarkosWorkLedger } from './work-ledger'

function hasReplacementAssignment(
  ledger: BarkosWorkLedger,
  assignment: BarkosAssignment,
  settledAt: number
): boolean {
  return ledger.assignments.some(
    (candidate) =>
      candidate.id !== assignment.id &&
      candidate.taskId === assignment.taskId &&
      candidate.assignedAt >= settledAt
  )
}

export function validateBarkosDispatchStops(
  ledger: BarkosWorkLedger,
  context: z.RefinementCtx
): void {
  const assignments = new Map(ledger.assignments.map((assignment) => [assignment.id, assignment]))
  const tasks = new Map(
    ledger.plans.flatMap((plan) => plan.tasks.map((task) => [task.id, task] as const))
  )
  ledger.dispatches.forEach((dispatch, index) => {
    if (!dispatch.stop) {
      return
    }
    if (dispatch.stop.orchestrationDispatchId !== dispatch.orchestrationDispatchId) {
      context.addIssue({
        code: 'custom',
        message: 'Stop authority does not match the Dispatch binding',
        path: ['dispatches', index, 'stop', 'orchestrationDispatchId']
      })
    }
    const completed = dispatch.stop.state === 'completed'
    const assignment = assignments.get(dispatch.assignmentId)
    const task = tasks.get(dispatch.taskId)
    if (
      (completed && dispatch.state !== 'cancelled') ||
      (!completed && dispatch.state !== 'running')
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Dispatch state does not match its stop settlement',
        path: ['dispatches', index, 'stop', 'state']
      })
    }
    const completedAssignmentMatches =
      assignment?.status === 'rejected'
        ? task?.status === 'cancelled'
        : assignment?.status === 'reassigned' &&
          dispatch.stop.settledAt !== null &&
          hasReplacementAssignment(ledger, assignment, dispatch.stop.settledAt)
    if (
      (completed && !completedAssignmentMatches) ||
      (!completed && (assignment?.status !== 'dispatched' || task?.status !== 'running'))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Task and Assignment do not match their stop settlement',
        path: ['dispatches', index, 'stop', 'state']
      })
    }
  })
}
