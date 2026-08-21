import { describe, expect, it, vi } from 'vitest'
import type { BarkosWorkLedger } from './work-ledger'
import { materializeBarkosPlanInOrca } from './orchestration-plan-adapter'
import type { BarkosOrchestrationAdapterError } from './orchestration-adapter-support'

function ledger(): BarkosWorkLedger {
  return {
    schemaVersion: 5,
    companyId: 'barkos-labs',
    objectives: [
      {
        id: 'ship-release',
        companyId: 'barkos-labs',
        title: 'Ship release',
        brief: 'Build and verify the release.',
        status: 'planned',
        activePlanId: 'release-plan',
        orchestrationBinding: null,
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
        status: 'approved',
        createdByWorkerId: 'ada',
        tasks: [
          {
            id: 'design-release',
            objectiveId: 'ship-release',
            planId: 'release-plan',
            title: 'Design release',
            spec: 'Define the release contract.',
            requiredCapabilities: ['planning'],
            dependencyIds: [],
            status: 'ready',
            workspacePolicy: 'inherit',
            preferredEnvironmentId: null,
            risk: 'low',
            approvalPolicy: 'none',
            orchestrationTaskId: null,
            createdAt: 2,
            updatedAt: 2
          },
          {
            id: 'build-release',
            objectiveId: 'ship-release',
            planId: 'release-plan',
            title: 'Build release',
            spec: 'Implement the approved contract.',
            requiredCapabilities: ['coding'],
            dependencyIds: ['design-release'],
            status: 'blocked',
            workspacePolicy: 'worktree',
            preferredEnvironmentId: null,
            risk: 'medium',
            approvalPolicy: 'none',
            orchestrationTaskId: null,
            createdAt: 2,
            updatedAt: 2
          }
        ],
        createdAt: 2,
        approvedAt: 2
      }
    ],
    assignments: [],
    dispatches: [],
    evidence: [],
    approvalGates: [],
    revision: 0,
    createdAt: 1,
    updatedAt: 2
  }
}

function rpcForCreation() {
  let taskIndex = 0
  return vi.fn(async (method: string) => {
    if (method === 'orchestration.runCreate') {
      return { run: { id: 'run_release' } }
    }
    if (method === 'orchestration.taskCreate') {
      taskIndex += 1
      return { task: { id: taskIndex === 1 ? 'task_design' : 'task_build' } }
    }
    if (method === 'orchestration.taskUpdate') {
      return { task: { id: 'task_design' } }
    }
    throw new Error(`Unexpected method ${method}`)
  })
}

describe('BarkOS plan orchestration adapter', () => {
  it('materializes a dependency-aware plan and persists every returned id', async () => {
    const callRpc = rpcForCreation()
    const persisted: BarkosWorkLedger[] = []
    const result = await materializeBarkosPlanInOrca({
      ledger: ledger(),
      objectiveId: 'ship-release',
      coordinatorTerminalHandle: 'term_coord',
      runtimeEnvironmentId: null,
      callRpc,
      persist: async (value) => {
        persisted.push(value)
        return value
      },
      now: () => 10
    })

    expect(result).toMatchObject({ runCreated: true, tasksCreated: 2 })
    expect(result.ledger.revision).toBe(3)
    expect(result.ledger.objectives[0]).toMatchObject({
      status: 'active',
      orchestrationBinding: { runId: 'run_release', runtimeEnvironmentId: null }
    })
    expect(result.ledger.plans[0]).toMatchObject({ status: 'active' })
    expect(result.ledger.plans[0].tasks.map((task) => task.orchestrationTaskId)).toEqual([
      'task_design',
      'task_build'
    ])
    expect(persisted.map((value) => value.revision)).toEqual([1, 2, 3])
    expect(callRpc).toHaveBeenNthCalledWith(
      1,
      'orchestration.runCreate',
      expect.objectContaining({
        from: 'term_coord',
        objective: expect.stringContaining('ship-release')
      })
    )
    expect(callRpc).toHaveBeenCalledWith(
      'orchestration.taskCreate',
      expect.objectContaining({
        deps: JSON.stringify(['task_design']),
        run: 'run_release',
        spec: expect.stringContaining('BarkOS task: build-release')
      })
    )
  })

  it('reuses durable Run and Task bindings without creating duplicates', async () => {
    const first = await materializeBarkosPlanInOrca({
      ledger: ledger(),
      objectiveId: 'ship-release',
      coordinatorTerminalHandle: 'term_coord',
      runtimeEnvironmentId: 'runtime-a',
      callRpc: rpcForCreation(),
      persist: async (value) => value,
      now: () => 10
    })
    const callRpc = vi.fn(async (method: string, params: Record<string, unknown>) => {
      if (method === 'orchestration.runUse') {
        return { run: { id: params.id } }
      }
      if (method === 'orchestration.taskUpdate') {
        return { task: { id: params.id } }
      }
      throw new Error(`Unexpected method ${method}`)
    })
    const persist = vi.fn(async (value: BarkosWorkLedger) => value)

    const resumed = await materializeBarkosPlanInOrca({
      ledger: first.ledger,
      objectiveId: 'ship-release',
      coordinatorTerminalHandle: 'term_coord_2',
      runtimeEnvironmentId: 'runtime-a',
      callRpc,
      persist
    })

    expect(resumed).toMatchObject({ runCreated: false, tasksCreated: 0 })
    expect(callRpc.mock.calls.map(([method]) => method)).toEqual([
      'orchestration.runUse',
      'orchestration.taskUpdate'
    ])
    expect(persist).not.toHaveBeenCalled()
  })

  it('stops before Task creation when the Run binding cannot be persisted', async () => {
    const callRpc = rpcForCreation()

    await expect(
      materializeBarkosPlanInOrca({
        ledger: ledger(),
        objectiveId: 'ship-release',
        coordinatorTerminalHandle: 'term_coord',
        runtimeEnvironmentId: null,
        callRpc,
        persist: async () => {
          throw new Error('disk-full')
        }
      })
    ).rejects.toMatchObject({
      code: 'persistence-failed',
      stage: 'run-create',
      effects: 'applied'
    } satisfies Partial<BarkosOrchestrationAdapterError>)
    expect(callRpc).toHaveBeenCalledTimes(1)
  })

  it('refuses a runtime-home change before any RPC mutation', async () => {
    const value = ledger()
    value.objectives[0].orchestrationBinding = {
      runId: 'run_release',
      runtimeEnvironmentId: 'runtime-a'
    }
    const callRpc = vi.fn()

    await expect(
      materializeBarkosPlanInOrca({
        ledger: value,
        objectiveId: 'ship-release',
        coordinatorTerminalHandle: 'term_coord',
        runtimeEnvironmentId: 'runtime-b',
        callRpc,
        persist: async (next) => next
      })
    ).rejects.toMatchObject({ code: 'precondition-failed', effects: 'none' })
    expect(callRpc).not.toHaveBeenCalled()
  })
})
