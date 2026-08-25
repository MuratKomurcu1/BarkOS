import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { BarkosCompany } from '../../../shared/barkos/company'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import type {
  BarkosAssignment,
  BarkosDispatch,
  BarkosTask,
  BarkosWorkLedger
} from '../../../shared/barkos/work-ledger'
import type { BarkosWorkerSessionState } from './barkos-worker-session-state'

const ACTIVE_ASSIGNMENT_STATUSES = new Set<BarkosAssignment['status']>([
  'proposed',
  'approved',
  'dispatched'
])

export type BarkosLiveOfficeStatus =
  | 'working'
  | 'blocked'
  | 'waiting'
  | 'assigned'
  | 'awaiting-evidence'
  | 'awaiting-review'
  | 'stop-pending'
  | 'stop-uncertain'
  | 'runtime-unconfirmed'
  | 'starting'
  | 'relaunch-required'
  | 'unbound'
  | 'paused'
  | 'offline'
  | 'idle'

export type BarkosLiveOfficeStation =
  | 'analysis'
  | 'research'
  | 'planning'
  | 'implementation'
  | 'verification'
  | 'review'
  | 'communication'

export type BarkosLiveOfficeWorkItem = {
  assignmentId: string
  taskId: string
  taskTitle: string
  taskStatus: BarkosTask['status']
  dispatchId: string | null
  dispatchState: BarkosDispatch['state'] | null
}

export type BarkosLiveOfficeWorker = {
  workerId: string
  status: BarkosLiveOfficeStatus
  work: BarkosLiveOfficeWorkItem[]
  workspaceId: string | null
  executionHostId: string | null
  toolName: string | null
  toolInput: string | null
  activityUpdatedAt: number | null
  station: BarkosLiveOfficeStation
}

export function resolveBarkosLiveOfficeStation(args: {
  status: BarkosLiveOfficeStatus
  toolName: string | null
  toolInput?: string | null
  taskStatus?: BarkosTask['status'] | null
}): BarkosLiveOfficeStation {
  if (args.status === 'blocked' || args.status === 'waiting') {
    return 'communication'
  }
  if (args.taskStatus === 'review' || args.status === 'awaiting-review') {
    return 'review'
  }
  const tool = `${args.toolName ?? ''} ${args.toolInput ?? ''}`
  if (/browser|web|fetch|navigate|screenshot/i.test(tool)) {
    return 'research'
  }
  if (/test|verify|lint|typecheck|build|diagnostic/i.test(tool)) {
    return 'verification'
  }
  if (/read|search|find|list|grep|inspect|scan/i.test(tool)) {
    return 'analysis'
  }
  if (/plan|task|delegate|dispatch|orchestrat/i.test(tool)) {
    return 'planning'
  }
  if (/review|diff|commit|merge|git/i.test(tool)) {
    return 'review'
  }
  return 'implementation'
}

function latestDispatchForAssignment(
  ledger: BarkosWorkLedger,
  assignmentId: string
): BarkosDispatch | null {
  return (
    ledger.dispatches
      .filter((dispatch) => dispatch.assignmentId === assignmentId)
      .toSorted(
        (left, right) => right.attempt - left.attempt || right.createdAt - left.createdAt
      )[0] ?? null
  )
}

function workItem(
  assignment: BarkosAssignment,
  task: BarkosTask,
  dispatch: BarkosDispatch | null
): BarkosLiveOfficeWorkItem {
  return {
    assignmentId: assignment.id,
    taskId: task.id,
    taskTitle: task.title,
    taskStatus: task.status,
    dispatchId: dispatch?.id ?? null,
    dispatchState: dispatch?.state ?? null
  }
}

function stopStatus(dispatches: readonly (BarkosDispatch | null)[]): BarkosLiveOfficeStatus | null {
  const stops = dispatches.flatMap((dispatch) => (dispatch?.stop ? [dispatch.stop] : []))
  if (stops.some((stop) => stop.state === 'uncertain')) {
    return 'stop-uncertain'
  }
  return stops.some((stop) => stop.state === 'requested' || stop.state === 'dispatch-stopped')
    ? 'stop-pending'
    : null
}

function liveStatus(args: {
  workerStatus: BarkosCompany['workers'][number]['status']
  sessionState: BarkosWorkerSessionState
  agentStatus: AgentStatusEntry | null
  assignments: readonly BarkosAssignment[]
  tasks: readonly BarkosTask[]
  dispatches: readonly (BarkosDispatch | null)[]
}): BarkosLiveOfficeStatus {
  const stopping = stopStatus(args.dispatches)
  if (stopping) {
    return stopping
  }
  if (args.agentStatus?.state === 'blocked') {
    return 'blocked'
  }
  if (args.agentStatus?.state === 'working') {
    return 'working'
  }
  if (args.agentStatus?.state === 'waiting') {
    return 'waiting'
  }
  if (
    args.tasks.some((task) => task.status === 'review') ||
    args.dispatches.some((dispatch) => dispatch?.state === 'succeeded')
  ) {
    return 'awaiting-review'
  }
  if (args.dispatches.some((dispatch) => dispatch?.state === 'running')) {
    return args.agentStatus?.state === 'done' ? 'awaiting-evidence' : 'runtime-unconfirmed'
  }
  if (args.assignments.some((assignment) => assignment.status === 'approved')) {
    return 'assigned'
  }
  if (args.workerStatus === 'paused') {
    return 'paused'
  }
  if (args.workerStatus === 'offline') {
    return 'offline'
  }
  if (args.sessionState === 'starting' || args.sessionState === 'requested') {
    return 'starting'
  }
  if (args.sessionState === 'relaunch-required') {
    return 'relaunch-required'
  }
  return args.sessionState === 'unbound' ? 'unbound' : 'idle'
}

export function projectBarkosLiveOffice(args: {
  company: BarkosCompany
  ledger: BarkosWorkLedger | null
  workerSessions: Readonly<Record<string, BarkosWorkerSessionBinding>>
  workerSessionStates: Readonly<Record<string, BarkosWorkerSessionState>>
  agentStatuses: Readonly<Record<string, AgentStatusEntry | null>>
}): BarkosLiveOfficeWorker[] {
  const ledger = args.ledger?.companyId === args.company.id ? args.ledger : null
  const tasksById = new Map(
    ledger?.plans.flatMap((plan) => plan.tasks.map((task) => [task.id, task] as const)) ?? []
  )
  return args.company.workers.map((worker) => {
    const assignments =
      ledger?.assignments
        .filter(
          (assignment) =>
            assignment.workerId === worker.id && ACTIVE_ASSIGNMENT_STATUSES.has(assignment.status)
        )
        .toSorted((left, right) => right.assignedAt - left.assignedAt) ?? []
    const scoped = assignments.flatMap((assignment) => {
      const task = tasksById.get(assignment.taskId)
      if (!task) {
        return []
      }
      const dispatch = ledger ? latestDispatchForAssignment(ledger, assignment.id) : null
      return [{ assignment, task, dispatch }]
    })
    const session = args.workerSessions[worker.id]
    const agentStatus = args.agentStatuses[worker.id] ?? null
    const status = liveStatus({
      workerStatus: worker.status,
      sessionState: args.workerSessionStates[worker.id] ?? 'unbound',
      agentStatus,
      assignments: scoped.map((entry) => entry.assignment),
      tasks: scoped.map((entry) => entry.task),
      dispatches: scoped.map((entry) => entry.dispatch)
    })
    return {
      workerId: worker.id,
      status,
      work: scoped.map((entry) => workItem(entry.assignment, entry.task, entry.dispatch)),
      workspaceId: session?.workspaceId ?? null,
      executionHostId: session?.executionHostId ?? null,
      toolName: agentStatus?.toolName ?? null,
      toolInput: agentStatus?.toolInput ?? null,
      activityUpdatedAt: agentStatus?.updatedAt ?? null,
      station: resolveBarkosLiveOfficeStation({
        status,
        toolName: agentStatus?.toolName ?? null,
        toolInput: agentStatus?.toolInput ?? null,
        taskStatus: scoped[0]?.task.status ?? null
      })
    }
  })
}
