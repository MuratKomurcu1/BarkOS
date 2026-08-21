import { describe, expect, it } from 'vitest'
import { reassignStoppedBarkosTask } from './assignment-reassignment'
import type { BarkosCompany } from './company'
import {
  createEmptyBarkosWorkLedger,
  parseBarkosWorkLedger,
  type BarkosWorkLedger
} from './work-ledger'

function company(): BarkosCompany {
  return {
    schemaVersion: 1,
    id: 'company-1',
    name: 'BarkOS Labs',
    mission: 'Ship dependable work.',
    leadWorkerId: 'lead-1',
    roles: [
      {
        id: 'engineer',
        name: 'Engineer',
        mission: 'Build and verify.',
        capabilities: ['coding'],
        definitionOfDone: ['Tests pass.'],
        instructions: null
      }
    ],
    workers: [
      {
        id: 'lead-1',
        name: 'Lead',
        roleId: 'engineer',
        agentId: 'codex',
        model: null,
        preferredEnvironmentId: null,
        workspacePolicy: 'inherit',
        status: 'paused'
      },
      {
        id: 'worker-1',
        name: 'Grace',
        roleId: 'engineer',
        agentId: 'codex',
        model: null,
        preferredEnvironmentId: null,
        workspacePolicy: 'inherit',
        status: 'available'
      },
      {
        id: 'worker-2',
        name: 'Linus',
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
}

function stoppedLedger(): BarkosWorkLedger {
  return parseBarkosWorkLedger({
    ...createEmptyBarkosWorkLedger('company-1', 1),
    objectives: [
      {
        id: 'objective-1',
        companyId: 'company-1',
        title: 'Build',
        brief: 'Build the release.',
        status: 'active',
        activePlanId: 'plan-1',
        orchestrationBinding: { runId: 'run-1', runtimeEnvironmentId: null },
        createdByWorkerId: 'lead-1',
        createdAt: 1,
        updatedAt: 10
      }
    ],
    plans: [
      {
        id: 'plan-1',
        objectiveId: 'objective-1',
        version: 1,
        status: 'active',
        createdByWorkerId: 'lead-1',
        tasks: [
          {
            id: 'task-1',
            objectiveId: 'objective-1',
            planId: 'plan-1',
            title: 'Implement',
            spec: 'Implement and verify the release.',
            requiredCapabilities: ['coding'],
            dependencyIds: [],
            status: 'cancelled',
            workspacePolicy: 'inherit',
            preferredEnvironmentId: null,
            risk: 'low',
            approvalPolicy: 'none',
            orchestrationTaskId: 'orca-task-1',
            createdAt: 1,
            updatedAt: 10
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
        status: 'rejected',
        reason: 'Best initial match.',
        matchedCapabilities: ['coding'],
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
        state: 'cancelled',
        workspaceId: 'workspace-1',
        executionHostId: 'local',
        orchestrationRunId: 'run-1',
        orchestrationTaskId: 'orca-task-1',
        orchestrationDispatchId: 'orca-dispatch-1',
        memoryDelivery: null,
        stop: {
          state: 'completed',
          orchestrationDispatchId: 'orca-dispatch-1',
          workerTerminalHandle: 'terminal-1',
          requestedAt: 7,
          dispatchStoppedAt: 8,
          terminalKilledAt: 9,
          settledAt: 9,
          error: null
        },
        error: null,
        createdAt: 2,
        startedAt: 3,
        finishedAt: 9
      }
    ],
    revision: 4,
    updatedAt: 10
  })
}

describe('BarkOS stopped Task reassignment', () => {
  it('preserves the stopped Assignment and creates a different approved owner', () => {
    const result = reassignStoppedBarkosTask({
      ledger: stoppedLedger(),
      company: company(),
      dispatchId: 'dispatch-1',
      now: 11
    })

    expect(result.ledger.assignments[0].status).toBe('reassigned')
    expect(result.assignment).toMatchObject({
      workerId: 'worker-2',
      status: 'approved',
      assignedAt: 11
    })
    expect(result.assignment.reason).toContain('confirmed stop of dispatch-1')
    expect(result.ledger.plans[0].tasks[0]).toMatchObject({ status: 'ready', updatedAt: 11 })
    expect(result.ledger.dispatches[0]).toMatchObject({
      state: 'cancelled',
      stop: { state: 'completed' }
    })
  })

  it('creates a fresh authority gate for protected replacement work', () => {
    const ledger = stoppedLedger()
    ledger.plans[0].tasks[0].approvalPolicy = 'before-dispatch'

    const result = reassignStoppedBarkosTask({
      ledger,
      company: company(),
      dispatchId: 'dispatch-1',
      now: 11
    })

    expect(result.ledger.approvalGates).toEqual([
      expect.objectContaining({
        assignmentId: result.assignment.id,
        kind: 'dispatch',
        status: 'pending'
      })
    ])
  })

  it('refuses any stop boundary that is not fully confirmed', () => {
    const ledger = stoppedLedger()
    ledger.assignments[0].status = 'dispatched'
    ledger.plans[0].tasks[0].status = 'running'
    ledger.dispatches[0] = {
      ...ledger.dispatches[0],
      state: 'running',
      finishedAt: null,
      stop: {
        ...ledger.dispatches[0].stop!,
        state: 'uncertain',
        terminalKilledAt: null,
        error: 'Authority result is ambiguous.'
      }
    }

    expect(() =>
      reassignStoppedBarkosTask({
        ledger,
        company: company(),
        dispatchId: 'dispatch-1',
        now: 11
      })
    ).toThrow('requires confirmed Dispatch authority and terminal termination')
  })

  it('does not silently return work to the stopped worker', () => {
    const value = company()
    value.workers[2].status = 'offline'

    expect(() =>
      reassignStoppedBarkosTask({
        ledger: stoppedLedger(),
        company: value,
        dispatchId: 'dispatch-1',
        now: 11
      })
    ).toThrow('No different available worker')
  })

  it('rejects a reassigned audit state without a later replacement Assignment', () => {
    const ledger = stoppedLedger()
    ledger.assignments[0].status = 'reassigned'

    expect(() => parseBarkosWorkLedger(ledger)).toThrow(
      'Task and Assignment do not match their stop settlement'
    )
  })
})
