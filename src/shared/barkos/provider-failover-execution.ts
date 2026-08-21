import type { AgentStatusEntry } from '../agent-status-types'
import type { BarkosCompany, BarkosWorker } from './company'
import type {
  BarkosProviderCapacityLedger,
  BarkosProviderCapacityObservation,
  BarkosProviderFailoverAudit,
  BarkosProviderRuntimeLane
} from './provider-capacity'
import { barkosProviderRuntimeLanesEqual } from './provider-capacity'
import { parseBarkosProviderCapacityLedgerForCompany } from './provider-capacity-ledger'
import { resolveBarkosProviderConversationMode } from './provider-account-mutation'
import type { BarkosAssignment, BarkosDispatch, BarkosTask, BarkosWorkLedger } from './work-ledger'
import { parseBarkosWorkLedgerForCompany } from './work-ledger-company'
import type { BarkosWorkerSessionBinding, BarkosWorkerSessionSnapshot } from './worker-session'
import { parseBarkosWorkerSessionSnapshotForCompany } from './worker-session'

export type BarkosCodexLocalFailoverBlockReason =
  | 'snapshot-invalid'
  | 'dispatch-not-found'
  | 'dispatch-not-running'
  | 'task-chain-mismatch'
  | 'worker-provider-unsupported'
  | 'worker-session-mismatch'
  | 'execution-scope-unsupported'
  | 'agent-status-mismatch'
  | 'orchestration-dispatch-not-active'
  | 'agent-turn-not-settled'
  | 'provider-failure-unverified'
  | 'rate-limit-unverified'
  | 'failover-already-started'

type BarkosFailoverAgentStatus = Pick<
  AgentStatusEntry,
  | 'agentType'
  | 'connectionId'
  | 'orchestration'
  | 'providerFailure'
  | 'providerSession'
  | 'sessionBoundary'
  | 'state'
  | 'tabId'
  | 'terminalHandle'
  | 'worktreeId'
>

export type BarkosCodexLocalFailoverEligibility =
  | { eligible: false; reason: BarkosCodexLocalFailoverBlockReason }
  | {
      eligible: true
      task: BarkosTask
      assignment: BarkosAssignment
      dispatch: BarkosDispatch
      worker: BarkosWorker
      binding: BarkosWorkerSessionBinding
      status: BarkosFailoverAgentStatus
      limitedAccount: BarkosProviderCapacityObservation
      audit: BarkosProviderFailoverAudit | null
      conversationMode: 'same-conversation' | 'new-session'
    }

export function validateBarkosCodexLocalFailoverEligibility(args: {
  company: BarkosCompany
  workLedger: BarkosWorkLedger
  capacityLedger: BarkosProviderCapacityLedger
  workerSessions: BarkosWorkerSessionSnapshot
  dispatchId: string
  runtimeLane: BarkosProviderRuntimeLane
  status: BarkosFailoverAgentStatus | null
}): BarkosCodexLocalFailoverEligibility {
  let workLedger: BarkosWorkLedger
  let capacityLedger: BarkosProviderCapacityLedger
  let workerSessions: BarkosWorkerSessionSnapshot
  try {
    workLedger = parseBarkosWorkLedgerForCompany(args.workLedger, args.company)
    capacityLedger = parseBarkosProviderCapacityLedgerForCompany(args.capacityLedger, args.company)
    workerSessions = parseBarkosWorkerSessionSnapshotForCompany(args.workerSessions, args.company)
  } catch {
    return blocked('snapshot-invalid')
  }

  const dispatch = workLedger.dispatches.find((entry) => entry.id === args.dispatchId)
  if (!dispatch) {
    return blocked('dispatch-not-found')
  }
  if (
    dispatch.state !== 'running' ||
    !dispatch.orchestrationRunId ||
    !dispatch.orchestrationTaskId ||
    !dispatch.orchestrationDispatchId
  ) {
    return blocked('dispatch-not-running')
  }
  const assignment = workLedger.assignments.find((entry) => entry.id === dispatch.assignmentId)
  const task = workLedger.plans
    .flatMap((plan) => plan.tasks)
    .find((entry) => entry.id === dispatch.taskId)
  const objective = task
    ? workLedger.objectives.find((entry) => entry.id === task.objectiveId)
    : undefined
  if (
    !assignment ||
    assignment.taskId !== dispatch.taskId ||
    assignment.workerId !== dispatch.workerId ||
    assignment.status !== 'dispatched' ||
    !task ||
    task.status !== 'running' ||
    task.orchestrationTaskId !== dispatch.orchestrationTaskId ||
    objective?.orchestrationBinding?.runId !== dispatch.orchestrationRunId
  ) {
    return blocked('task-chain-mismatch')
  }

  const worker = args.company.workers.find((entry) => entry.id === dispatch.workerId)
  if (!worker || worker.agentId !== 'codex') {
    return blocked('worker-provider-unsupported')
  }
  const binding = workerSessions.bindings.find((entry) => entry.workerId === worker.id)
  if (
    !binding ||
    binding.agent !== 'codex' ||
    binding.state !== 'created' ||
    !binding.tabId ||
    binding.workspaceId !== dispatch.workspaceId
  ) {
    return blocked('worker-session-mismatch')
  }
  if (
    dispatch.executionHostId !== 'local' ||
    binding.executionHostId !== 'local' ||
    args.runtimeLane.kind !== 'host'
  ) {
    return blocked('execution-scope-unsupported')
  }

  const status = args.status
  if (
    !status?.terminalHandle ||
    status.tabId !== binding.tabId ||
    status.agentType !== 'codex' ||
    status.connectionId != null ||
    (status.worktreeId !== undefined && status.worktreeId !== binding.workspaceId) ||
    status.orchestration?.taskId !== dispatch.orchestrationTaskId ||
    status.orchestration.dispatchId !== dispatch.orchestrationDispatchId
  ) {
    return blocked('agent-status-mismatch')
  }
  if (status.state !== 'done' || status.sessionBoundary === true) {
    return blocked('agent-turn-not-settled')
  }
  if (status.providerFailure?.kind !== 'usage-limit-exceeded') {
    return blocked('provider-failure-unverified')
  }
  if (status.orchestration.dispatchStatus !== 'dispatched') {
    return blocked('orchestration-dispatch-not-active')
  }

  const scopedActive = capacityLedger.accounts.filter(
    (observation) =>
      observation.active &&
      observation.account.provider === 'codex' &&
      observation.account.executionHostId === 'local' &&
      barkosProviderRuntimeLanesEqual(observation.account.runtimeLane, args.runtimeLane)
  )
  const limitedAccount = scopedActive.length === 1 ? scopedActive[0] : undefined
  if (
    !limitedAccount ||
    !['limited', 'cooldown'].includes(limitedAccount.status) ||
    !['usage-exhausted', 'provider-retry-after'].includes(limitedAccount.reason)
  ) {
    return blocked('rate-limit-unverified')
  }
  const failovers = capacityLedger.failovers.filter((audit) => audit.dispatchId === dispatch.id)
  const audit = failovers.length === 1 ? failovers[0] : null
  if (
    failovers.length > 1 ||
    (audit && (audit.state !== 'active' || audit.attempts.at(-1)?.outcome === 'selected'))
  ) {
    return blocked('failover-already-started')
  }

  const conversationMode = resolveBarkosProviderConversationMode({
    provider: 'codex',
    agent: 'codex',
    ...(status.providerSession ? { providerSession: status.providerSession } : {})
  })
  return {
    eligible: true,
    task,
    assignment,
    dispatch,
    worker,
    binding,
    status,
    limitedAccount,
    audit,
    conversationMode: conversationMode === 'same-conversation' ? conversationMode : 'new-session'
  }
}

function blocked(reason: BarkosCodexLocalFailoverBlockReason): BarkosCodexLocalFailoverEligibility {
  return { eligible: false, reason }
}
