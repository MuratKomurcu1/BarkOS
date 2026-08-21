import { z } from 'zod'
import {
  parseBarkosDecisionRequest,
  type BarkosDecisionRequest
} from '../../../shared/barkos/decision-inbox'
import type {
  BarkosAssignment,
  BarkosDispatch,
  BarkosTask,
  BarkosWorkLedger
} from '../../../shared/barkos/work-ledger'

const externalIdSchema = z.string().trim().min(1).max(512)
const timestampTextSchema = z.string().trim().min(1).max(80)
const gateRowSchema = z
  .object({
    id: externalIdSchema,
    run_id: externalIdSchema,
    task_id: externalIdSchema,
    question: z.string().trim().min(1).max(12_000),
    options: z.string().max(20_000),
    status: z.enum(['pending', 'resolved', 'timeout']),
    resolution: z.string().trim().min(1).max(8_000).nullable(),
    created_at: timestampTextSchema,
    resolved_at: timestampTextSchema.nullable()
  })
  .passthrough()
const messageRowSchema = z
  .object({
    id: externalIdSchema,
    run_id: externalIdSchema,
    from_handle: z.string().trim().min(1).max(512),
    subject: z.string().trim().min(1).max(12_000),
    body: z.string().max(12_000),
    type: z.enum(['question', 'decision_gate', 'escalation']),
    priority: z.enum(['normal', 'high', 'urgent']),
    payload: z.string().max(30_000).nullable(),
    created_at: timestampTextSchema
  })
  .passthrough()
const gateListResponseSchema = z
  .object({ runId: externalIdSchema, gates: z.array(z.unknown()).max(500) })
  .passthrough()
const messageListResponseSchema = z
  .object({ runId: externalIdSchema, messages: z.array(z.unknown()).max(100) })
  .passthrough()
const messagePayloadSchema = z
  .object({
    taskId: externalIdSchema,
    dispatchId: externalIdSchema,
    question: z.string().trim().min(1).max(12_000).optional(),
    options: z.array(z.string().trim().min(1).max(500)).max(30).optional()
  })
  .passthrough()

type TaskContext = {
  task: BarkosTask
  objectiveRunId: string
}

function timestamp(value: string): number | null {
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : value
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function gateOptions(value: string): string[] | null {
  try {
    const parsed: unknown = JSON.parse(value)
    const result = z.array(z.string().trim().min(1).max(500)).max(30).safeParse(parsed)
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function messagePayload(value: string | null) {
  if (!value) {
    return null
  }
  try {
    const result = messagePayloadSchema.safeParse(JSON.parse(value))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function taskContexts(ledger: BarkosWorkLedger, runId: string): Map<string, TaskContext> {
  const contexts = new Map<string, TaskContext>()
  for (const objective of ledger.objectives) {
    if (objective.orchestrationBinding?.runId !== runId) {
      continue
    }
    for (const plan of ledger.plans.filter((entry) => entry.objectiveId === objective.id)) {
      for (const task of plan.tasks) {
        if (task.orchestrationTaskId) {
          contexts.set(task.orchestrationTaskId, { task, objectiveRunId: runId })
        }
      }
    }
  }
  return contexts
}

function matchingDispatch(
  ledger: BarkosWorkLedger,
  task: BarkosTask,
  runId: string,
  orchestrationDispatchId?: string
): BarkosDispatch | null {
  return (
    ledger.dispatches
      .filter(
        (dispatch) =>
          dispatch.taskId === task.id &&
          dispatch.orchestrationRunId === runId &&
          dispatch.orchestrationTaskId === task.orchestrationTaskId &&
          (orchestrationDispatchId === undefined ||
            dispatch.orchestrationDispatchId === orchestrationDispatchId)
      )
      .toSorted((left, right) => right.createdAt - left.createdAt)[0] ?? null
  )
}

function assignmentForDispatch(
  ledger: BarkosWorkLedger,
  dispatch: BarkosDispatch | null
): BarkosAssignment | null {
  if (!dispatch) {
    return null
  }
  return (
    ledger.assignments.find(
      (assignment) =>
        assignment.id === dispatch.assignmentId &&
        assignment.taskId === dispatch.taskId &&
        assignment.workerId === dispatch.workerId
    ) ?? null
  )
}

function requestSource(
  task: BarkosTask,
  dispatch: BarkosDispatch | null,
  assignment: BarkosAssignment | null
) {
  return {
    taskId: task.id,
    assignmentId: assignment?.id ?? null,
    dispatchId: dispatch?.id ?? null,
    requestedByWorkerId: dispatch?.workerId ?? null,
    risk: task.risk,
    executionHostId: dispatch?.executionHostId ?? null,
    orchestrationTaskId: task.orchestrationTaskId as string,
    orchestrationDispatchId: dispatch?.orchestrationDispatchId ?? null
  }
}

function gateRequest(args: {
  ledger: BarkosWorkLedger
  runId: string
  row: z.infer<typeof gateRowSchema>
  task: BarkosTask
  now: number
}): BarkosDecisionRequest | null {
  const options = gateOptions(args.row.options)
  const createdAt = timestamp(args.row.created_at)
  const resolvedAt = args.row.resolved_at ? timestamp(args.row.resolved_at) : null
  if (
    options === null ||
    createdAt === null ||
    (args.row.status !== 'pending' && resolvedAt === null)
  ) {
    return null
  }
  const dispatch = matchingDispatch(args.ledger, args.task, args.runId)
  const assignment = assignmentForDispatch(args.ledger, dispatch)
  const resolution = args.row.status === 'resolved' ? args.row.resolution : null
  if (args.row.status === 'resolved' && (!resolution || resolvedAt === null)) {
    return null
  }
  return parseBarkosDecisionRequest({
    id: `gate:${args.runId}:${args.row.id}`,
    sourceKind: 'gate',
    status:
      args.row.status === 'timeout'
        ? 'expired'
        : args.row.status === 'resolved'
          ? 'resolved'
          : 'pending',
    resolutionKind: resolution ? 'answered' : null,
    ...requestSource(args.task, dispatch, assignment),
    orchestrationRunId: args.runId,
    orchestrationMessageId: null,
    orchestrationGateId: args.row.id,
    question: args.row.question,
    details: null,
    options,
    priority:
      args.task.risk === 'critical' ? 'urgent' : args.task.risk === 'high' ? 'high' : 'normal',
    proposedResolution: resolution,
    resolution,
    createdAt,
    lastSeenAt: args.now,
    resolvedAt: args.row.status === 'pending' ? null : resolvedAt
  })
}

function messageRequest(args: {
  ledger: BarkosWorkLedger
  runId: string
  row: z.infer<typeof messageRowSchema>
  tasks: Map<string, TaskContext>
  now: number
}): BarkosDecisionRequest | null {
  const payload = messagePayload(args.row.payload)
  const createdAt = timestamp(args.row.created_at)
  const context = payload ? args.tasks.get(payload.taskId) : null
  if (!payload || !context || createdAt === null) {
    return null
  }
  const dispatch = matchingDispatch(args.ledger, context.task, args.runId, payload.dispatchId)
  const assignment = assignmentForDispatch(args.ledger, dispatch)
  if (!dispatch || !assignment) {
    return null
  }
  const question =
    args.row.type === 'escalation'
      ? args.row.subject
      : (payload.question ?? (args.row.body.trim() || args.row.subject))
  const details =
    args.row.body.trim() && args.row.body.trim() !== question ? args.row.body.trim() : null
  return parseBarkosDecisionRequest({
    id: `${args.row.type}:${args.runId}:${args.row.id}`,
    sourceKind: args.row.type,
    status: 'pending',
    resolutionKind: null,
    ...requestSource(context.task, dispatch, assignment),
    orchestrationRunId: args.runId,
    orchestrationMessageId: args.row.id,
    orchestrationGateId: null,
    question,
    details,
    options: payload.options ?? [],
    priority: args.row.priority,
    proposedResolution: null,
    resolution: null,
    createdAt,
    lastSeenAt: args.now,
    resolvedAt: null
  })
}

export function discoverBarkosDecisionRequests(args: {
  ledger: BarkosWorkLedger
  runId: string
  gateListResponse: unknown
  messageListResponse: unknown
  now?: number
}): { requests: BarkosDecisionRequest[]; skipped: number } {
  const gateResponse = gateListResponseSchema.parse(args.gateListResponse)
  const messageResponse = messageListResponseSchema.parse(args.messageListResponse)
  if (gateResponse.runId !== args.runId || messageResponse.runId !== args.runId) {
    throw new Error('Orca decision inbox response does not match the current Run')
  }
  const tasks = taskContexts(args.ledger, args.runId)
  const now = args.now ?? Date.now()
  let skipped = 0
  const gates = gateResponse.gates.flatMap((value) => {
    const parsed = gateRowSchema.safeParse(value)
    const task = parsed.success ? tasks.get(parsed.data.task_id)?.task : null
    const request =
      parsed.success && task
        ? gateRequest({ ledger: args.ledger, runId: args.runId, row: parsed.data, task, now })
        : null
    if (!request) {
      skipped += 1
    }
    return request ? [request] : []
  })
  const gateKeys = new Set(
    gates.map((request) => `${request.orchestrationTaskId}\n${request.question}`)
  )
  const messages = messageResponse.messages.flatMap((value) => {
    const parsed = messageRowSchema.safeParse(value)
    const request = parsed.success
      ? messageRequest({ ledger: args.ledger, runId: args.runId, row: parsed.data, tasks, now })
      : null
    if (!request) {
      skipped += 1
      return []
    }
    if (
      request.sourceKind === 'decision_gate' &&
      gateKeys.has(`${request.orchestrationTaskId}\n${request.question}`)
    ) {
      return []
    }
    return [request]
  })
  return {
    requests: [...gates, ...messages].toSorted((left, right) => right.createdAt - left.createdAt),
    skipped
  }
}
