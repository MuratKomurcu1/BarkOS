import { describe, expect, it, vi } from 'vitest'
import { createDefaultBarkosControlPolicy, updateBarkosControlPolicy } from './control-policy'
import { dispatchBarkosAssignmentToOrca } from './orchestration-dispatch-adapter'
import { createEmptyBarkosWorkLedger, type BarkosWorkLedger } from './work-ledger'

function readyLedger(): BarkosWorkLedger {
  return {
    ...createEmptyBarkosWorkLedger('barkos-labs', 1),
    objectives: [
      {
        id: 'ship-release',
        companyId: 'barkos-labs',
        title: 'Ship release',
        brief: 'Build and verify the release.',
        status: 'active',
        activePlanId: 'release-plan',
        orchestrationBinding: { runId: 'run-release', runtimeEnvironmentId: null },
        createdByWorkerId: 'ada',
        createdAt: 1,
        updatedAt: 2
      }
    ],
    plans: [
      {
        id: 'release-plan',
        objectiveId: 'ship-release',
        version: 1,
        status: 'active',
        createdByWorkerId: 'ada',
        tasks: [
          {
            id: 'build-release',
            objectiveId: 'ship-release',
            planId: 'release-plan',
            title: 'Build release',
            spec: 'Implement and verify the release.',
            requiredCapabilities: ['coding'],
            dependencyIds: [],
            status: 'ready',
            workspacePolicy: 'worktree',
            preferredEnvironmentId: null,
            risk: 'medium',
            approvalPolicy: 'none',
            orchestrationTaskId: 'task-build',
            createdAt: 2,
            updatedAt: 2
          }
        ],
        createdAt: 2,
        approvedAt: 2
      }
    ],
    assignments: [
      {
        id: 'build-assignment',
        taskId: 'build-release',
        workerId: 'grace',
        status: 'approved',
        reason: 'Grace covers coding and has capacity.',
        matchedCapabilities: ['coding'],
        activeLoadAtAssignment: 0,
        assignedAt: 3,
        approvedAt: 3
      }
    ],
    updatedAt: 3
  }
}

function argumentsFor(ledger: BarkosWorkLedger) {
  return {
    ledger,
    assignmentId: 'build-assignment',
    coordinatorTerminalHandle: 'term-coordinator',
    workerTerminalHandle: 'term-worker',
    workspaceId: 'workspace-a',
    executionHostId: 'local',
    callRpc: vi.fn(),
    persist: vi.fn()
  }
}

function policyUpdates(
  executionState: 'running' | 'paused',
  maxConcurrentDispatches: number,
  maxDispatchesPerObjective: number
) {
  return {
    executionState,
    maxConcurrentDispatches,
    maxActiveAssignmentsPerWorker: 2,
    maxDispatchesPerObjective
  }
}

describe('BarkOS dispatch control policy', () => {
  it('blocks before persistence or RPC while company execution is paused', async () => {
    const ledger = readyLedger()
    const running = createDefaultBarkosControlPolicy('barkos-labs', 1, 1)
    const controlPolicy = updateBarkosControlPolicy({
      policy: running,
      updates: policyUpdates('paused', 4, 100)
    })
    const args = argumentsFor(ledger)

    await expect(dispatchBarkosAssignmentToOrca({ ...args, controlPolicy })).rejects.toMatchObject({
      code: 'execution-paused',
      effects: 'none'
    })
    expect(args.persist).not.toHaveBeenCalled()
    expect(args.callRpc).not.toHaveBeenCalled()
  })

  it('enforces company concurrency before persistence', async () => {
    const ledger = readyLedger()
    ledger.dispatches.push({
      id: 'prepared-dispatch',
      assignmentId: 'build-assignment',
      taskId: 'build-release',
      workerId: 'grace',
      attempt: 1,
      state: 'prepared',
      workspaceId: 'workspace-a',
      executionHostId: 'local',
      orchestrationRunId: null,
      orchestrationTaskId: null,
      orchestrationDispatchId: null,
      memoryDelivery: null,
      stop: null,
      error: null,
      createdAt: 4,
      startedAt: null,
      finishedAt: null
    })
    const base = createDefaultBarkosControlPolicy('barkos-labs', 1, 1)
    const controlPolicy = updateBarkosControlPolicy({
      policy: base,
      updates: policyUpdates('running', 1, 100)
    })

    await expect(
      dispatchBarkosAssignmentToOrca({ ...argumentsFor(ledger), controlPolicy })
    ).rejects.toMatchObject({ code: 'concurrency-limit-reached', effects: 'none' })
  })

  it('counts settled attempts against the objective execution budget', async () => {
    const ledger = readyLedger()
    ledger.dispatches.push({
      id: 'failed-dispatch',
      assignmentId: 'build-assignment',
      taskId: 'build-release',
      workerId: 'grace',
      attempt: 1,
      state: 'failed',
      workspaceId: 'workspace-a',
      executionHostId: 'local',
      orchestrationRunId: null,
      orchestrationTaskId: null,
      orchestrationDispatchId: null,
      memoryDelivery: null,
      stop: null,
      error: 'failed',
      createdAt: 4,
      startedAt: null,
      finishedAt: 5
    })
    const base = createDefaultBarkosControlPolicy('barkos-labs', 1, 1)
    const controlPolicy = updateBarkosControlPolicy({
      policy: base,
      updates: policyUpdates('running', 4, 1)
    })

    await expect(
      dispatchBarkosAssignmentToOrca({ ...argumentsFor(ledger), controlPolicy })
    ).rejects.toMatchObject({ code: 'objective-dispatch-budget-exhausted', effects: 'none' })
  })
})
