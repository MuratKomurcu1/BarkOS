import type { BarkosPlan, BarkosTask, BarkosWorkLedger } from './work-ledger'
import { nextBarkosLedgerRevision } from './orchestration-adapter-support'

export function topologicalBarkosTasks(plan: BarkosPlan): BarkosTask[] {
  const byId = new Map(plan.tasks.map((task) => [task.id, task]))
  const visited = new Set<string>()
  const ordered: BarkosTask[] = []
  const visit = (task: BarkosTask): void => {
    if (visited.has(task.id)) {
      return
    }
    task.dependencyIds.forEach((dependencyId) => {
      const dependency = byId.get(dependencyId)
      if (dependency) {
        visit(dependency)
      }
    })
    visited.add(task.id)
    ordered.push(task)
  }
  plan.tasks.forEach(visit)
  return ordered
}

export function barkosObjectiveSpec(objective: BarkosWorkLedger['objectives'][number]): string {
  return `${objective.title}\n\n${objective.brief}\n\nBarkOS objective: ${objective.id}`
}

export function barkosTaskSpec(task: BarkosTask): string {
  return `${task.spec}\n\nBarkOS task: ${task.id}`
}

export function desiredOrcaTaskStatus(task: BarkosTask, plan: BarkosPlan): string | null {
  if (task.status === 'completed') {
    return 'completed'
  }
  if (task.status === 'failed' || task.status === 'cancelled') {
    return 'failed'
  }
  if (task.status === 'ready') {
    return 'ready'
  }
  const byId = new Map(plan.tasks.map((entry) => [entry.id, entry]))
  const dependenciesSettled = task.dependencyIds.every(
    (dependencyId) => byId.get(dependencyId)?.status === 'completed'
  )
  return dependenciesSettled ? 'blocked' : null
}

export function barkosTaskResult(task: BarkosTask): string | undefined {
  if (task.status === 'completed') {
    return JSON.stringify({ barkosTaskId: task.id, outcome: 'completed' })
  }
  if (task.status === 'failed' || task.status === 'cancelled') {
    return JSON.stringify({ barkosTaskId: task.id, outcome: task.status })
  }
  return undefined
}

export function bindBarkosObjectiveToRun(args: {
  ledger: BarkosWorkLedger
  objectiveId: string
  planId: string
  runId: string
  runtimeEnvironmentId: string | null
  now: number
}): BarkosWorkLedger {
  return nextBarkosLedgerRevision(
    args.ledger,
    {
      objectives: args.ledger.objectives.map((objective) =>
        objective.id === args.objectiveId
          ? {
              ...objective,
              status: objective.status === 'planned' ? 'active' : objective.status,
              orchestrationBinding: {
                runId: args.runId,
                runtimeEnvironmentId: args.runtimeEnvironmentId
              },
              updatedAt: Math.max(args.now, objective.updatedAt + 1)
            }
          : objective
      ),
      plans: args.ledger.plans.map((plan) =>
        plan.id === args.planId && plan.status === 'approved' ? { ...plan, status: 'active' } : plan
      )
    },
    args.now
  )
}

export function bindBarkosTaskToOrca(args: {
  ledger: BarkosWorkLedger
  planId: string
  taskId: string
  orchestrationTaskId: string
  now: number
}): BarkosWorkLedger {
  return nextBarkosLedgerRevision(
    args.ledger,
    {
      plans: args.ledger.plans.map((plan) =>
        plan.id === args.planId
          ? {
              ...plan,
              tasks: plan.tasks.map((task) =>
                task.id === args.taskId
                  ? {
                      ...task,
                      orchestrationTaskId: args.orchestrationTaskId,
                      updatedAt: Math.max(args.now, task.updatedAt + 1)
                    }
                  : task
              )
            }
          : plan
      )
    },
    args.now
  )
}
