import { z } from 'zod'
import {
  evaluateBarkosDispatchControl,
  type BarkosControlPolicy,
  type BarkosDispatchControlDecision
} from './control-policy'
import {
  barkosMemoryDispatchContextSchema,
  sha256BarkosMemoryContext,
  type BarkosMemoryDispatchContext
} from './memory-delivery'
import {
  BARKOS_MAX_DISPATCH_ATTEMPTS,
  parseBarkosWorkLedger,
  type BarkosDispatch,
  type BarkosWorkLedger
} from './work-ledger'
import {
  barkosAdapterError,
  boundedBarkosErrorMessage,
  persistBarkosLedgerMutation,
  type BarkosOrchestrationRpcCaller,
  type BarkosWorkLedgerPersist
} from './orchestration-adapter-support'
import {
  barkosDispatchId,
  commitBarkosDispatch,
  failPreparedBarkosDispatch,
  findBarkosTask,
  hasUnsettledBarkosDispatch,
  prepareBarkosDispatch,
  requireApprovedBarkosDispatch
} from './orchestration-dispatch-state'

const dispatchResponseSchema = z
  .object({
    dispatch: z
      .object({
        id: z.string().trim().min(1).max(256),
        task_id: z.string().trim().min(1).max(256)
      })
      .passthrough(),
    injected: z.literal(true),
    contextReceipt: z
      .object({
        id: z.string().trim().min(1).max(64),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        characterCount: z.number().int().min(1).max(8_000)
      })
      .strict()
      .optional()
  })
  .passthrough()

export async function dispatchBarkosAssignmentToOrca(args: {
  ledger: BarkosWorkLedger
  controlPolicy: BarkosControlPolicy
  assignmentId: string
  coordinatorTerminalHandle: string
  workerTerminalHandle: string
  workspaceId: string
  executionHostId: string
  memoryContext?: BarkosMemoryDispatchContext | null
  callRpc: BarkosOrchestrationRpcCaller
  persist: BarkosWorkLedgerPersist
  now?: () => number
}): Promise<{ ledger: BarkosWorkLedger; dispatch: BarkosDispatch }> {
  let ledger = parseBarkosWorkLedger(args.ledger)
  const assignment = ledger.assignments.find((entry) => entry.id === args.assignmentId)
  const task = assignment ? findBarkosTask(ledger, assignment.taskId) : undefined
  const objective = task
    ? ledger.objectives.find((entry) => entry.id === task.objectiveId)
    : undefined
  if (
    !assignment ||
    assignment.status !== 'approved' ||
    !task ||
    task.status !== 'ready' ||
    !task.orchestrationTaskId ||
    !objective?.orchestrationBinding
  ) {
    throw barkosAdapterError(
      'precondition-failed',
      'Dispatch requires an approved assignment and a ready Orca-bound Task',
      'dispatch-precondition'
    )
  }
  requireBarkosDispatchControl(args.controlPolicy, ledger, task.id)
  requireApprovedBarkosDispatch(ledger, assignment.id, task)

  const attempts = ledger.dispatches.filter((dispatch) => dispatch.assignmentId === assignment.id)
  if (hasUnsettledBarkosDispatch(attempts)) {
    throw barkosAdapterError(
      'dispatch-in-progress',
      `Assignment ${assignment.id} already has an unsettled dispatch`,
      'dispatch-precondition',
      'possible'
    )
  }
  const attempt = Math.max(0, ...attempts.map((dispatch) => dispatch.attempt)) + 1
  if (attempt > BARKOS_MAX_DISPATCH_ATTEMPTS) {
    throw barkosAdapterError(
      'dispatch-attempts-exhausted',
      `Assignment ${assignment.id} exhausted its dispatch attempts`,
      'dispatch-precondition'
    )
  }

  const now = args.now ?? Date.now
  const preparedId = barkosDispatchId(assignment.id, attempt)
  const memoryContext = args.memoryContext
    ? barkosMemoryDispatchContextSchema.parse(args.memoryContext)
    : null
  const contextSha256 = memoryContext ? await sha256BarkosMemoryContext(memoryContext.text) : null
  ledger = await persistBarkosLedgerMutation({
    ledger: prepareBarkosDispatch({
      ledger,
      assignment,
      attempt,
      workspaceId: args.workspaceId,
      executionHostId: args.executionHostId,
      memoryContext:
        memoryContext && contextSha256
          ? {
              memoryIds: memoryContext.selectedMemoryIds,
              contextSha256,
              characterCount: memoryContext.text.length
            }
          : undefined,
      now: now()
    }),
    persist: args.persist,
    stage: 'dispatch-prepare',
    effects: 'none'
  })

  let responseValue: unknown
  try {
    const preparedDispatch = ledger.dispatches.find((dispatch) => dispatch.id === preparedId)
    responseValue = await args.callRpc('orchestration.dispatch', {
      task: task.orchestrationTaskId,
      to: args.workerTerminalHandle,
      from: args.coordinatorTerminalHandle,
      inject: true,
      run: objective.orchestrationBinding.runId,
      ...(memoryContext && preparedDispatch?.memoryDelivery
        ? {
            supplementalContext: memoryContext.text,
            contextReceiptId: preparedDispatch.memoryDelivery.receiptId
          }
        : {})
    })
  } catch (error) {
    ledger = await persistBarkosLedgerMutation({
      ledger: failPreparedBarkosDispatch(ledger, preparedId, error, now()),
      persist: args.persist,
      stage: 'dispatch-failure',
      effects: 'possible'
    })
    throw barkosAdapterError(
      'rpc-failed',
      boundedBarkosErrorMessage(error),
      'dispatch-call',
      'possible',
      error
    )
  }

  const response = dispatchResponseSchema.safeParse(responseValue)
  if (!response.success || response.data.dispatch.task_id !== task.orchestrationTaskId) {
    const invalidResponse = new Error('BarkOS returned an invalid dispatch response')
    ledger = await persistBarkosLedgerMutation({
      ledger: failPreparedBarkosDispatch(ledger, preparedId, invalidResponse, now()),
      persist: args.persist,
      stage: 'dispatch-response',
      effects: 'possible'
    })
    throw barkosAdapterError(
      'invalid-rpc-response',
      invalidResponse.message,
      'dispatch-response',
      'possible',
      response.success ? undefined : response.error
    )
  }

  const preparedDelivery = ledger.dispatches.find(
    (dispatch) => dispatch.id === preparedId
  )?.memoryDelivery
  const contextReceipt = response.data.contextReceipt
  const memoryDeliveryConfirmed =
    preparedDelivery === null ||
    (preparedDelivery !== undefined &&
      contextReceipt !== undefined &&
      contextReceipt.id === preparedDelivery.receiptId &&
      contextReceipt.sha256 === preparedDelivery.contextSha256 &&
      contextReceipt.characterCount === preparedDelivery.characterCount)

  ledger = await persistBarkosLedgerMutation({
    ledger: commitBarkosDispatch({
      ledger,
      assignment,
      task,
      dispatchRecordId: preparedId,
      runId: objective.orchestrationBinding.runId,
      orchestrationDispatchId: response.data.dispatch.id,
      memoryDeliveryConfirmed,
      now: now()
    }),
    persist: args.persist,
    stage: 'dispatch-commit',
    effects: 'applied'
  })
  const dispatch = ledger.dispatches.find((entry) => entry.id === preparedId)
  if (!dispatch) {
    throw barkosAdapterError(
      'persistence-failed',
      'Persisted dispatch record disappeared',
      'dispatch-commit',
      'applied'
    )
  }
  return { ledger, dispatch }
}

function requireBarkosDispatchControl(
  policy: BarkosControlPolicy,
  ledger: BarkosWorkLedger,
  taskId: string
): void {
  const decision = evaluateBarkosDispatchControl({ policy, ledger, taskId })
  if (decision.allowed) {
    return
  }
  throw controlDecisionError(decision, policy)
}

function controlDecisionError(
  decision: Extract<BarkosDispatchControlDecision, { allowed: false }>,
  policy: BarkosControlPolicy
) {
  switch (decision.reason) {
    case 'paused':
      return barkosAdapterError(
        'execution-paused',
        'BarkOS execution is paused; resume it before dispatching new work',
        'dispatch-control'
      )
    case 'concurrency-limit':
      return barkosAdapterError(
        'concurrency-limit-reached',
        `BarkOS already has ${decision.activeDispatches} active Dispatches, reaching the configured limit of ${policy.maxConcurrentDispatches}`,
        'dispatch-control'
      )
    case 'objective-budget-exhausted':
      return barkosAdapterError(
        'objective-dispatch-budget-exhausted',
        `This objective has used its configured ${policy.maxDispatchesPerObjective}-Dispatch execution budget`,
        'dispatch-control'
      )
    case 'scope-mismatch':
      return barkosAdapterError(
        'control-policy-mismatch',
        'BarkOS control policy does not match this task and work ledger',
        'dispatch-control'
      )
  }
}
