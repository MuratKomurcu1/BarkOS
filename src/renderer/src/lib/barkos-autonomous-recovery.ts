import type { BarkosWorkLedger } from '../../../shared/barkos/work-ledger'

const AUTONOMOUS_OBJECTIVE_PREFIXES = ['Proje:', 'Uygulama:'] as const

function isAutonomousObjective(title: string): boolean {
  return AUTONOMOUS_OBJECTIVE_PREFIXES.some((prefix) => title.startsWith(prefix))
}

export function findRecoverableBarkosObjectiveTasks(
  ledger: BarkosWorkLedger
): Map<string, string[]> {
  const recoverable = new Map<string, string[]>()
  for (const objective of ledger.objectives) {
    if (!isAutonomousObjective(objective.title) || !objective.activePlanId) {
      continue
    }
    const plan = ledger.plans.find((entry) => entry.id === objective.activePlanId)
    if (!plan) {
      continue
    }
    for (const task of plan.tasks) {
      if (task.status !== 'ready' || !task.orchestrationTaskId) {
        continue
      }
      const assignments = ledger.assignments.filter((entry) => entry.taskId === task.id)
      if (assignments.some((assignment) => assignment.status === 'rejected')) {
        continue
      }
      const approved = assignments.find((assignment) => assignment.status === 'approved')
      const gate = approved
        ? ledger.approvalGates.find(
            (entry) => entry.kind === 'dispatch' && entry.assignmentId === approved.id
          )
        : null
      if (
        gate?.status === 'pending' ||
        gate?.status === 'rejected' ||
        ledger.dispatches.some((dispatch) => dispatch.taskId === task.id)
      ) {
        continue
      }
      recoverable.set(objective.id, [...(recoverable.get(objective.id) ?? []), task.id])
    }
  }
  return recoverable
}
