import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../agent-status-types'
import { createBarkosCompany } from './company'
import type { BarkosProviderCapacityLedger } from './provider-capacity'
import { createEmptyBarkosProviderCapacityLedger } from './provider-capacity-ledger'
import { validateBarkosCodexLocalFailoverEligibility } from './provider-failover-execution'
import { parseBarkosWorkLedger, type BarkosWorkLedger } from './work-ledger'
import {
  createEmptyBarkosWorkerSessionSnapshot,
  upsertBarkosWorkerSessionBinding
} from './worker-session'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship dependable work.',
  leadName: 'Ada',
  now: 1
})

function runningLedger(): BarkosWorkLedger {
  return parseBarkosWorkLedger({
    schemaVersion: 5,
    companyId: company.id,
    objectives: [
      {
        id: 'ship-release',
        companyId: company.id,
        title: 'Ship release',
        brief: 'Build and verify the release.',
        status: 'active',
        activePlanId: 'release-plan',
        orchestrationBinding: { runId: 'run-release', runtimeEnvironmentId: null },
        createdByWorkerId: company.leadWorkerId,
        createdAt: 1,
        updatedAt: 4
      }
    ],
    plans: [
      {
        id: 'release-plan',
        objectiveId: 'ship-release',
        version: 1,
        status: 'active',
        createdByWorkerId: company.leadWorkerId,
        tasks: [
          {
            id: 'build-release',
            objectiveId: 'ship-release',
            planId: 'release-plan',
            title: 'Build release',
            spec: 'Implement and test the release.',
            requiredCapabilities: [],
            dependencyIds: [],
            status: 'running',
            workspacePolicy: 'worktree',
            preferredEnvironmentId: null,
            risk: 'medium',
            approvalPolicy: 'none',
            orchestrationTaskId: 'task-build',
            createdAt: 1,
            updatedAt: 4
          }
        ],
        createdAt: 1,
        approvedAt: 2
      }
    ],
    assignments: [
      {
        id: 'assignment-build',
        taskId: 'build-release',
        workerId: company.leadWorkerId,
        status: 'dispatched',
        reason: 'The lead owns this task.',
        matchedCapabilities: [],
        activeLoadAtAssignment: 0,
        assignedAt: 2,
        approvedAt: 2
      }
    ],
    dispatches: [
      {
        id: 'dispatch-build',
        assignmentId: 'assignment-build',
        taskId: 'build-release',
        workerId: company.leadWorkerId,
        attempt: 1,
        state: 'running',
        workspaceId: 'workspace-a',
        executionHostId: 'local',
        orchestrationRunId: 'run-release',
        orchestrationTaskId: 'task-build',
        orchestrationDispatchId: 'ctx-build',
        memoryDelivery: null,
        stop: null,
        error: null,
        createdAt: 3,
        startedAt: 4,
        finishedAt: null
      }
    ],
    evidence: [],
    approvalGates: [],
    revision: 2,
    createdAt: 1,
    updatedAt: 4
  })
}

function workerSessions() {
  return upsertBarkosWorkerSessionBinding({
    snapshot: createEmptyBarkosWorkerSessionSnapshot(company.id, company.createdAt, 1),
    company,
    binding: {
      workerId: company.leadWorkerId,
      agent: 'codex',
      targetId: 'workspace-a',
      workspaceId: 'workspace-a',
      workspaceKind: 'worktree',
      executionHostId: 'local',
      tabId: 'tab-worker',
      state: 'created',
      launchedAt: 2
    },
    now: 2
  })
}

function capacity(): BarkosProviderCapacityLedger {
  return {
    ...createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 1),
    accounts: [
      {
        account: {
          provider: 'codex',
          accountId: 'account-a',
          executionHostId: 'local',
          runtimeLane: { kind: 'host' }
        },
        active: true,
        status: 'limited',
        reason: 'usage-exhausted',
        usedPercent: 100,
        resetsAt: 100,
        retryAt: null,
        sourceUpdatedAt: 5,
        observedAt: 5
      },
      {
        account: {
          provider: 'codex',
          accountId: 'account-b',
          executionHostId: 'local',
          runtimeLane: { kind: 'host' }
        },
        active: false,
        status: 'available',
        reason: 'within-limits',
        usedPercent: 10,
        resetsAt: null,
        retryAt: null,
        sourceUpdatedAt: 5,
        observedAt: 5
      }
    ]
  }
}

function settledStatus(overrides: Partial<AgentStatusEntry> = {}) {
  return {
    state: 'done' as const,
    agentType: 'codex',
    connectionId: null,
    tabId: 'tab-worker',
    worktreeId: 'workspace-a',
    terminalHandle: 'term-worker',
    sessionBoundary: false,
    providerFailure: { kind: 'usage-limit-exceeded' } as const,
    providerSession: {
      key: 'session_id' as const,
      id: '019f81b9-19a9-7651-a8d1-352d9420bd11',
      transcriptPath:
        '/managed/account-a/sessions/2026/08/18/rollout-2026-08-18T12-00-00-session.jsonl'
    },
    orchestration: {
      taskId: 'task-build',
      dispatchId: 'ctx-build',
      dispatchStatus: 'dispatched' as const
    },
    ...overrides
  }
}

function eligibility(
  overrides: {
    workLedger?: BarkosWorkLedger
    capacityLedger?: BarkosProviderCapacityLedger
    status?: ReturnType<typeof settledStatus> | null
  } = {}
) {
  return validateBarkosCodexLocalFailoverEligibility({
    company,
    workLedger: overrides.workLedger ?? runningLedger(),
    capacityLedger: overrides.capacityLedger ?? capacity(),
    workerSessions: workerSessions(),
    dispatchId: 'dispatch-build',
    runtimeLane: { kind: 'host' },
    status: overrides.status === undefined ? settledStatus() : overrides.status
  })
}

describe('BarkOS Codex local failover eligibility', () => {
  it('revalidates the exact settled task chain and verified active limit', () => {
    expect(eligibility()).toMatchObject({
      eligible: true,
      conversationMode: 'same-conversation',
      audit: null,
      dispatch: { id: 'dispatch-build' },
      limitedAccount: { account: { accountId: 'account-a' } }
    })
  })

  it('records a new-session fallback when no provider session was observed', () => {
    expect(eligibility({ status: settledStatus({ providerSession: undefined }) })).toMatchObject({
      eligible: true,
      conversationMode: 'new-session'
    })
  })

  it('refuses a live turn, an untyped failure, or an unverified limit', () => {
    expect(eligibility({ status: settledStatus({ state: 'working' }) })).toEqual({
      eligible: false,
      reason: 'agent-turn-not-settled'
    })
    expect(eligibility({ status: settledStatus({ providerFailure: undefined }) })).toEqual({
      eligible: false,
      reason: 'provider-failure-unverified'
    })
    const unknownCapacity = capacity()
    unknownCapacity.accounts[0] = {
      ...unknownCapacity.accounts[0],
      status: 'unknown',
      reason: 'stale-snapshot'
    }
    expect(eligibility({ capacityLedger: unknownCapacity })).toEqual({
      eligible: false,
      reason: 'rate-limit-unverified'
    })
  })

  it('refuses a status attributed to another Orca Dispatch', () => {
    expect(
      eligibility({
        status: settledStatus({
          orchestration: {
            taskId: 'task-build',
            dispatchId: 'ctx-other',
            dispatchStatus: 'dispatched'
          }
        })
      })
    ).toEqual({ eligible: false, reason: 'agent-status-mismatch' })
  })

  it('refuses a settled pane whose Orca Dispatch is no longer active', () => {
    expect(
      eligibility({
        status: settledStatus({
          orchestration: {
            taskId: 'task-build',
            dispatchId: 'ctx-build',
            dispatchStatus: 'completed'
          }
        })
      })
    ).toEqual({ eligible: false, reason: 'orchestration-dispatch-not-active' })
  })

  it('allows the next bounded account after a proven failed mutation', () => {
    const capacityLedger = capacity()
    capacityLedger.failovers = [
      {
        id: 'failover-build',
        taskId: 'build-release',
        assignmentId: 'assignment-build',
        dispatchId: 'dispatch-build',
        workerId: company.leadWorkerId,
        provider: 'codex',
        executionHostId: 'local',
        runtimeLane: { kind: 'host' },
        attemptCeiling: 3,
        attempts: [
          {
            sequence: 1,
            account: capacityLedger.accounts[1].account,
            outcome: 'failed',
            conversationMode: 'unknown',
            reason: 'execution-failed',
            startedAt: 6,
            settledAt: 7
          }
        ],
        state: 'active',
        stopReason: null,
        createdAt: 6,
        updatedAt: 7
      }
    ]

    expect(eligibility({ capacityLedger })).toMatchObject({
      eligible: true,
      audit: { id: 'failover-build', state: 'active' }
    })
  })
})
