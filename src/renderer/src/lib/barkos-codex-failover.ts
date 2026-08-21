import { barkosProviderAccountKey } from '../../../shared/barkos/provider-capacity'
import { parseBarkosControlPolicyForCompany } from '../../../shared/barkos/control-policy'
import type {
  BarkosProviderCapacityLedger,
  BarkosProviderFailoverAudit
} from '../../../shared/barkos/provider-capacity'
import { upsertBarkosProviderFailoverAudit } from '../../../shared/barkos/provider-capacity-ledger'
import { validateBarkosCodexLocalFailoverEligibility } from '../../../shared/barkos/provider-failover-execution'
import {
  createBarkosProviderFailoverAudit,
  selectBarkosFailoverAccount,
  settleBarkosProviderFailoverAttempt,
  stopBarkosProviderFailoverAudit
} from '../../../shared/barkos/provider-failover-policy'
import type { BarkosCompany } from '../../../shared/barkos/company'
import type { BarkosWorkLedger } from '../../../shared/barkos/work-ledger'
import { useAppStore } from '@/store'
import { resolveBarkosWorkerTerminalStatus } from './barkos-orchestration-target'
import { ensureBarkosWorkerSessionReady } from './ensure-barkos-worker-session'
import { executeBarkosCodexAccountMutationOnDesktop } from './barkos-codex-account-mutation'
import { launchBarkosCodexFailoverSession } from './launch-barkos-codex-failover-session'
import { replaceBarkosCodexDispatchOnRuntime } from './barkos-orchestration-runtime'

export type BarkosCodexFailoverResult =
  | {
      status: 'succeeded'
      workLedger: BarkosWorkLedger
      capacityLedger: BarkosProviderCapacityLedger
      audit: BarkosProviderFailoverAudit
    }
  | {
      status: 'stopped' | 'not-applied' | 'uncertain'
      capacityLedger: BarkosProviderCapacityLedger
      audit: BarkosProviderFailoverAudit
    }

function failoverAuditId(dispatchId: string): string {
  return `failover-${dispatchId.replace(/^dispatch-/, '')}`.slice(0, 64).replace(/-+$/g, '')
}

async function persistCapacity(
  company: BarkosCompany,
  ledger: BarkosProviderCapacityLedger,
  audit: BarkosProviderFailoverAudit
): Promise<BarkosProviderCapacityLedger> {
  return useAppStore
    .getState()
    .saveBarkosProviderCapacity(upsertBarkosProviderFailoverAudit({ ledger, company, audit }))
}

export async function executeBarkosCodexLocalFailover(args: {
  company: BarkosCompany
  workLedger: BarkosWorkLedger
  capacityLedger: BarkosProviderCapacityLedger
  dispatchId: string
}): Promise<BarkosCodexFailoverResult> {
  const controlPolicyValue = await window.api.barkosControlPolicy.load()
  if (!controlPolicyValue) {
    throw new Error('BarkOS control policy is unavailable')
  }
  const controlPolicy = parseBarkosControlPolicyForCompany(controlPolicyValue, args.company)
  if (controlPolicy.executionState !== 'running') {
    throw new Error('BarkOS execution is paused; resume it before recovering a Dispatch')
  }
  const workerSessions = await window.api.barkosWorkerSessions.load()
  if (!workerSessions) {
    throw new Error('BarkOS worker session snapshot is unavailable')
  }
  const dispatch = args.workLedger.dispatches.find((entry) => entry.id === args.dispatchId)
  const binding = dispatch
    ? workerSessions.bindings.find((entry) => entry.workerId === dispatch.workerId)
    : undefined
  const sourceStatus = binding
    ? resolveBarkosWorkerTerminalStatus(binding, useAppStore.getState().agentStatusByPaneKey)
    : null
  const eligibility = validateBarkosCodexLocalFailoverEligibility({
    company: args.company,
    workLedger: args.workLedger,
    capacityLedger: args.capacityLedger,
    workerSessions,
    dispatchId: args.dispatchId,
    runtimeLane: { kind: 'host' },
    status: sourceStatus
  })
  if (!eligibility.eligible || !sourceStatus) {
    throw new Error(
      `BarkOS Codex failover is not eligible: ${eligibility.eligible ? 'agent-status-mismatch' : eligibility.reason}`
    )
  }

  const coordinator = await ensureBarkosWorkerSessionReady({
    company: args.company,
    workerId: args.company.leadWorkerId,
    fallbackBinding: workerSessions.bindings.find(
      (entry) => entry.workerId === args.company.leadWorkerId
    )
  })
  const audit =
    eligibility.audit ??
    createBarkosProviderFailoverAudit({
      id: failoverAuditId(eligibility.dispatch.id),
      taskId: eligibility.task.id,
      assignmentId: eligibility.assignment.id,
      dispatchId: eligibility.dispatch.id,
      workerId: eligibility.worker.id,
      provider: 'codex',
      executionHostId: 'local',
      runtimeLane: { kind: 'host' }
    })
  const selection = selectBarkosFailoverAccount({
    accounts: args.capacityLedger.accounts,
    provider: 'codex',
    executionHostId: 'local',
    runtimeLane: { kind: 'host' },
    triedAccountKeys: new Set(
      audit.attempts.map((attempt) => barkosProviderAccountKey(attempt.account))
    ),
    attemptCount: audit.attempts.length,
    attemptCeiling: audit.attemptCeiling
  })
  if (selection.status === 'stopped') {
    const stopped = stopBarkosProviderFailoverAudit({ audit, reason: selection.reason })
    const capacityLedger = await persistCapacity(args.company, args.capacityLedger, stopped)
    return { status: 'stopped', capacityLedger, audit: stopped }
  }

  const conversationMode =
    eligibility.conversationMode === 'same-conversation' && selection.account.accountId
      ? 'same-conversation'
      : 'new-session'
  const mutation = await executeBarkosCodexAccountMutationOnDesktop({
    company: args.company,
    ledger: args.capacityLedger,
    audit,
    account: selection.account,
    sourceOrchestrationDispatchId: eligibility.dispatch.orchestrationDispatchId!,
    persist: (ledger) => useAppStore.getState().saveBarkosProviderCapacity(ledger)
  })
  if (mutation.status !== 'applied') {
    return {
      status: mutation.status,
      capacityLedger: mutation.ledger,
      audit: mutation.audit
    }
  }

  try {
    const replacement = await replaceBarkosCodexDispatchOnRuntime({
      ledger: args.workLedger,
      dispatchId: eligibility.dispatch.id,
      coordinator: coordinator.binding,
      coordinatorTerminalHandle: coordinator.terminalHandle,
      sourceWorker: eligibility.binding,
      sourceWorkerTerminalHandle: eligibility.status.terminalHandle!,
      rebindCoordinator: eligibility.worker.id === args.company.leadWorkerId,
      launchReplacement: async () => {
        const runtime = await launchBarkosCodexFailoverSession({
          company: args.company,
          binding: eligibility.binding,
          sourceStatus,
          targetAccountId: selection.account.accountId,
          conversationMode
        })
        return { terminalHandle: runtime.terminalHandle }
      }
    })
    const succeeded = settleBarkosProviderFailoverAttempt({
      audit: mutation.audit,
      outcome: 'succeeded',
      reason: 'completed',
      conversationMode,
      replacementOrchestrationDispatchId: replacement.dispatch.orchestrationDispatchId!
    })
    const capacityLedger = await persistCapacity(args.company, mutation.ledger, succeeded)
    return {
      status: 'succeeded',
      workLedger: replacement.ledger,
      capacityLedger,
      audit: succeeded
    }
  } catch (error) {
    const uncertain = settleBarkosProviderFailoverAttempt({
      audit: mutation.audit,
      outcome: 'uncertain',
      reason: 'ambiguous-side-effect',
      conversationMode
    })
    try {
      await persistCapacity(args.company, mutation.ledger, uncertain)
    } catch (persistenceError) {
      throw new AggregateError(
        [error, persistenceError],
        'Codex failover effects may have applied and the uncertainty record could not be saved'
      )
    }
    throw error
  }
}
