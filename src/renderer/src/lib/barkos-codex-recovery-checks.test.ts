import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import { createBarkosCompany } from '../../../shared/barkos/company'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'
import { parseBarkosWorkLedger } from '../../../shared/barkos/work-ledger'
import { findBarkosCodexRecoveryChecks } from './barkos-codex-recovery-checks'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Recover bounded work.',
  leadName: 'Ada',
  now: 1
})

const binding: BarkosWorkerSessionBinding = {
  workerId: company.leadWorkerId,
  agent: 'codex',
  targetId: 'workspace-one',
  workspaceId: 'workspace-one',
  workspaceKind: 'worktree',
  executionHostId: 'local',
  tabId: 'tab-one',
  state: 'created',
  launchedAt: 2
}

const ledger = parseBarkosWorkLedger({
  schemaVersion: 5,
  companyId: company.id,
  objectives: [
    {
      id: 'objective-one',
      companyId: company.id,
      title: 'Ship recovery',
      brief: 'Prove recovery.',
      status: 'active',
      activePlanId: 'plan-one',
      orchestrationBinding: { runId: 'run-one', runtimeEnvironmentId: null },
      createdByWorkerId: company.leadWorkerId,
      createdAt: 1,
      updatedAt: 3
    }
  ],
  plans: [
    {
      id: 'plan-one',
      objectiveId: 'objective-one',
      version: 1,
      status: 'active',
      createdByWorkerId: company.leadWorkerId,
      tasks: [
        {
          id: 'task-one',
          objectiveId: 'objective-one',
          planId: 'plan-one',
          title: 'Recover Codex task',
          spec: 'Continue the same task.',
          requiredCapabilities: [],
          dependencyIds: [],
          status: 'running',
          workspacePolicy: 'worktree',
          preferredEnvironmentId: null,
          risk: 'medium',
          approvalPolicy: 'none',
          orchestrationTaskId: 'orca-task-one',
          createdAt: 1,
          updatedAt: 3
        }
      ],
      createdAt: 1,
      approvedAt: 2
    }
  ],
  assignments: [
    {
      id: 'assignment-one',
      taskId: 'task-one',
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
      id: 'dispatch-one',
      assignmentId: 'assignment-one',
      taskId: 'task-one',
      workerId: company.leadWorkerId,
      attempt: 1,
      state: 'running',
      workspaceId: 'workspace-one',
      executionHostId: 'local',
      orchestrationRunId: 'run-one',
      orchestrationTaskId: 'orca-task-one',
      orchestrationDispatchId: 'orca-dispatch-one',
      memoryDelivery: null,
      stop: null,
      error: null,
      createdAt: 2,
      startedAt: 3,
      finishedAt: null
    }
  ],
  evidence: [],
  approvalGates: [],
  revision: 1,
  createdAt: 1,
  updatedAt: 3
})

function status(overrides: Partial<AgentStatusEntry> = {}): AgentStatusEntry {
  return {
    state: 'done',
    prompt: 'Continue the task.',
    updatedAt: 4,
    stateStartedAt: 4,
    agentType: 'codex',
    paneKey: 'tab-one:leaf-one',
    terminalHandle: 'terminal-one',
    worktreeId: 'workspace-one',
    connectionId: null,
    tabId: 'tab-one',
    stateHistory: [],
    providerFailure: { kind: 'usage-limit-exceeded' },
    orchestration: {
      taskId: 'orca-task-one',
      dispatchId: 'orca-dispatch-one',
      dispatchStatus: 'dispatched'
    },
    ...overrides
  }
}

function checks(entry: AgentStatusEntry) {
  return findBarkosCodexRecoveryChecks({
    company,
    workLedger: ledger,
    workerSessions: { [company.leadWorkerId]: binding },
    statuses: { [entry.paneKey]: entry }
  })
}

describe('BarkOS Codex recovery checks', () => {
  it('offers a read-only check only for the exact settled active Dispatch', () => {
    expect(checks(status())).toEqual([
      {
        id: 'dispatch-one',
        taskTitle: 'Recover Codex task',
        workerName: 'Ada'
      }
    ])
  })

  it('refuses live, session-boundary, or already-settled Orca Dispatch states', () => {
    expect(checks(status({ state: 'working' }))).toEqual([])
    expect(checks(status({ sessionBoundary: true }))).toEqual([])
    expect(
      checks(
        status({
          orchestration: {
            taskId: 'orca-task-one',
            dispatchId: 'orca-dispatch-one',
            dispatchStatus: 'completed'
          }
        })
      )
    ).toEqual([])
  })

  it('refuses status from another Dispatch authority', () => {
    expect(
      checks(
        status({
          orchestration: {
            taskId: 'orca-task-one',
            dispatchId: 'orca-dispatch-other',
            dispatchStatus: 'dispatched'
          }
        })
      )
    ).toEqual([])
  })

  it('refuses a settled turn without the structured Codex limit cause', () => {
    expect(checks(status({ providerFailure: undefined }))).toEqual([])
  })
})
