import type { BarkosCompany } from './company'
import type { BarkosWorkLedger } from './work-ledger'

export type BarkosCollaborationTimelineEntry = {
  id: string
  kind: 'handoff' | 'report' | 'failure'
  fromWorkerId: string
  toWorkerId: string
  taskId: string
  dispatchId: string
  subject: string
  body: string
  createdAt: number
}

function boundedBody(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized.length <= 240 ? normalized : `${normalized.slice(0, 237)}...`
}

export function projectBarkosCollaborationTimeline(args: {
  company: BarkosCompany
  ledger: BarkosWorkLedger | null
  limit?: number
}): BarkosCollaborationTimelineEntry[] {
  if (!args.ledger || args.ledger.companyId !== args.company.id) {
    return []
  }
  const tasks = new Map(
    args.ledger.plans.flatMap((plan) => plan.tasks.map((task) => [task.id, task] as const))
  )
  const evidenceByDispatch = new Map(
    args.ledger.evidence.map((evidence) => [evidence.dispatchId, evidence] as const)
  )
  const entries: BarkosCollaborationTimelineEntry[] = []

  for (const dispatch of args.ledger.dispatches) {
    const task = tasks.get(dispatch.taskId)
    if (!task) {
      continue
    }
    entries.push({
      id: `${dispatch.id}:handoff`,
      kind: 'handoff',
      fromWorkerId: args.company.leadWorkerId,
      toWorkerId: dispatch.workerId,
      taskId: task.id,
      dispatchId: dispatch.id,
      subject: task.title,
      body: boundedBody(task.spec),
      createdAt: dispatch.createdAt
    })

    const evidence = evidenceByDispatch.get(dispatch.id)
    if (evidence) {
      const terminalReport = evidence.terminalExcerpts.at(-1)
      entries.push({
        id: `${evidence.id}:report`,
        kind: 'report',
        fromWorkerId: dispatch.workerId,
        toWorkerId: args.company.leadWorkerId,
        taskId: task.id,
        dispatchId: dispatch.id,
        subject: terminalReport?.label ?? task.title,
        body: boundedBody(
          terminalReport?.excerpt ?? evidence.diffSummary ?? 'Ajan çalışma kanıtını teslim etti.'
        ),
        createdAt: evidence.producedAt
      })
    } else if (
      dispatch.finishedAt !== null &&
      ['failed', 'circuit-broken', 'cancelled'].includes(dispatch.state)
    ) {
      entries.push({
        id: `${dispatch.id}:failure`,
        kind: 'failure',
        fromWorkerId: dispatch.workerId,
        toWorkerId: args.company.leadWorkerId,
        taskId: task.id,
        dispatchId: dispatch.id,
        subject: task.title,
        body: boundedBody(dispatch.error ?? 'Görev tamamlanmadan durduruldu.'),
        createdAt: dispatch.finishedAt
      })
    }
  }

  return entries
    .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id))
    .slice(0, Math.max(1, Math.min(args.limit ?? 12, 50)))
}
