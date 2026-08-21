import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { BarkosCompany } from '../../../shared/barkos/company'
import {
  createEmptyBarkosWorkLedger,
  type BarkosWorkLedger
} from '../../../shared/barkos/work-ledger'
import { projectBarkosLiveOffice } from './barkos-live-office'

const company: BarkosCompany = {
  schemaVersion: 1,
  id: 'company-1',
  name: 'BarkOS Labs',
  mission: 'Ship work.',
  leadWorkerId: 'worker-1',
  roles: [
    {
      id: 'engineer',
      name: 'Engineer',
      mission: 'Build.',
      capabilities: [],
      definitionOfDone: ['Verified.'],
      instructions: null
    }
  ],
  workers: [
    {
      id: 'worker-1',
      name: 'Ada',
      roleId: 'engineer',
      agentId: 'codex',
      model: null,
      preferredEnvironmentId: null,
      workspacePolicy: 'inherit',
      status: 'available'
    },
    {
      id: 'worker-2',
      name: 'Grace',
      roleId: 'engineer',
      agentId: 'codex',
      model: null,
      preferredEnvironmentId: null,
      workspacePolicy: 'inherit',
      status: 'available'
    }
  ],
  createdAt: 1,
  updatedAt: 1
}

function runningLedger(): BarkosWorkLedger {
  return {
    ...createEmptyBarkosWorkLedger(company.id, 1),
    objectives: [],
    plans: [
      {
        id: 'plan-1',
        objectiveId: 'objective-1',
        version: 1,
        status: 'active',
        createdByWorkerId: 'worker-1',
        tasks: [
          {
            id: 'task-1',
            objectiveId: 'objective-1',
            planId: 'plan-1',
            title: 'Build release',
            spec: 'Build.',
            requiredCapabilities: [],
            dependencyIds: [],
            status: 'running',
            workspacePolicy: 'inherit',
            preferredEnvironmentId: null,
            risk: 'low',
            approvalPolicy: 'none',
            orchestrationTaskId: 'task-runtime-1',
            createdAt: 1,
            updatedAt: 2
          }
        ],
        createdAt: 1,
        approvedAt: 1
      }
    ],
    assignments: [
      {
        id: 'assignment-1',
        taskId: 'task-1',
        workerId: 'worker-1',
        status: 'dispatched',
        reason: 'Assigned.',
        matchedCapabilities: [],
        activeLoadAtAssignment: 0,
        assignedAt: 2,
        approvedAt: 2
      }
    ],
    dispatches: [
      {
        id: 'dispatch-1',
        assignmentId: 'assignment-1',
        taskId: 'task-1',
        workerId: 'worker-1',
        attempt: 1,
        state: 'running',
        workspaceId: 'workspace-1',
        executionHostId: 'local',
        orchestrationRunId: 'run-1',
        orchestrationTaskId: 'task-runtime-1',
        orchestrationDispatchId: 'runtime-dispatch-1',
        memoryDelivery: null,
        stop: null,
        error: null,
        createdAt: 2,
        startedAt: 2,
        finishedAt: null
      }
    ],
    revision: 1,
    updatedAt: 2
  }
}

function agentStatus(state: AgentStatusEntry['state']): AgentStatusEntry {
  return {
    state,
    prompt: '',
    updatedAt: 5,
    stateStartedAt: 4,
    agentType: 'codex',
    paneKey: 'tab-1:leaf-1',
    terminalHandle: 'terminal-1',
    tabId: 'tab-1',
    stateHistory: [],
    toolName: 'Bash',
    toolInput: 'pnpm test'
  }
}

function project(ledger: BarkosWorkLedger, status: AgentStatusEntry | null) {
  return projectBarkosLiveOffice({
    company,
    ledger,
    workerSessions: {},
    workerSessionStates: { 'worker-1': 'ready', 'worker-2': 'ready' },
    agentStatuses: { 'worker-1': status }
  })
}

describe('BarkOS live office projection', () => {
  it('shows exact live work and bounded tool detail', () => {
    expect(project(runningLedger(), agentStatus('working'))[0]).toMatchObject({
      status: 'working',
      toolName: 'Bash',
      toolInput: 'pnpm test',
      work: [{ taskTitle: 'Build release', dispatchId: 'dispatch-1' }]
    })
  })

  it('does not claim a running agent without an exact live status', () => {
    expect(project(runningLedger(), null)[0].status).toBe('runtime-unconfirmed')
    expect(project(runningLedger(), agentStatus('done'))[0].status).toBe('awaiting-evidence')
  })

  it('surfaces ambiguous stop authority above live hook activity', () => {
    const ledger = runningLedger()
    ledger.dispatches[0].stop = {
      state: 'uncertain',
      orchestrationDispatchId: 'runtime-dispatch-1',
      workerTerminalHandle: 'terminal-1',
      requestedAt: 3,
      dispatchStoppedAt: null,
      terminalKilledAt: null,
      settledAt: 4,
      error: 'Stop result is ambiguous.'
    }

    expect(project(ledger, agentStatus('working'))[0].status).toBe('stop-uncertain')
  })

  it('keeps replaced audit history out of current worker load', () => {
    const ledger = runningLedger()
    ledger.assignments[0].status = 'reassigned'

    expect(project(ledger, null)[0]).toMatchObject({ status: 'idle', work: [] })
  })
})
