import { describe, expect, it, vi } from 'vitest'
import { createDefaultBarkosControlPolicy } from './control-policy'
import type { BarkosDispatch, BarkosWorkLedger } from './work-ledger'
import { dispatchBarkosAssignmentToOrca } from './orchestration-dispatch-adapter'

function ledger(approvalPolicy: 'none' | 'before-dispatch' = 'none'): BarkosWorkLedger {
  return {
    schemaVersion: 5,
    companyId: 'barkos-labs',
    objectives: [
      {
        id: 'ship-release',
        companyId: 'barkos-labs',
        title: 'Ship release',
        brief: 'Build and verify the release.',
        status: 'active',
        activePlanId: 'release-plan',
        orchestrationBinding: { runId: 'run_release', runtimeEnvironmentId: null },
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
            approvalPolicy,
            orchestrationTaskId: 'task_build',
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
    dispatches: [],
    evidence: [],
    approvalGates: [],
    revision: 0,
    createdAt: 1,
    updatedAt: 3
  }
}

function failedDispatch(attempt: number): BarkosDispatch {
  return {
    id: `prior-dispatch-${attempt}`,
    assignmentId: 'build-assignment',
    taskId: 'build-release',
    workerId: 'grace',
    attempt,
    state: 'failed',
    workspaceId: 'workspace-a',
    executionHostId: 'local',
    orchestrationRunId: null,
    orchestrationTaskId: null,
    orchestrationDispatchId: null,
    memoryDelivery: null,
    stop: null,
    error: 'Agent was unavailable.',
    createdAt: 3 + attempt,
    startedAt: null,
    finishedAt: 4 + attempt
  }
}

function dispatchArgs(value: BarkosWorkLedger) {
  return {
    ledger: value,
    controlPolicy: createDefaultBarkosControlPolicy('barkos-labs', 1, 1),
    assignmentId: 'build-assignment',
    coordinatorTerminalHandle: 'term_coord',
    workerTerminalHandle: 'term_worker',
    workspaceId: 'workspace-a',
    executionHostId: 'local',
    now: () => 10
  }
}

describe('BarkOS dispatch orchestration adapter', () => {
  it('persists preparation before RPC and commits the exact Orca ids', async () => {
    const persisted: BarkosWorkLedger[] = []
    const callRpc = vi.fn(async () => ({
      dispatch: { id: 'ctx_build', task_id: 'task_build' },
      injected: true
    }))

    const result = await dispatchBarkosAssignmentToOrca({
      ...dispatchArgs(ledger()),
      callRpc,
      persist: async (value) => {
        persisted.push(value)
        return value
      }
    })

    expect(persisted.map((value) => value.revision)).toEqual([1, 2])
    expect(persisted[0].dispatches[0]).toMatchObject({
      state: 'prepared',
      orchestrationDispatchId: null
    })
    expect(result.ledger.assignments[0].status).toBe('dispatched')
    expect(result.ledger.plans[0].tasks[0].status).toBe('running')
    expect(result.dispatch).toMatchObject({
      attempt: 1,
      state: 'running',
      orchestrationRunId: 'run_release',
      orchestrationTaskId: 'task_build',
      orchestrationDispatchId: 'ctx_build',
      startedAt: 10
    })
    expect(callRpc).toHaveBeenCalledWith('orchestration.dispatch', {
      task: 'task_build',
      to: 'term_worker',
      from: 'term_coord',
      inject: true,
      run: 'run_release'
    })
  })

  it('does not call Orca when dispatch preparation cannot be persisted', async () => {
    const callRpc = vi.fn()

    await expect(
      dispatchBarkosAssignmentToOrca({
        ...dispatchArgs(ledger()),
        callRpc,
        persist: async () => {
          throw new Error('revision-conflict')
        }
      })
    ).rejects.toMatchObject({
      code: 'persistence-failed',
      stage: 'dispatch-prepare',
      effects: 'none'
    })
    expect(callRpc).not.toHaveBeenCalled()
  })

  it('persists and verifies an exact task-memory delivery receipt', async () => {
    const persisted: BarkosWorkLedger[] = []
    const context = {
      text: 'Approved task memory.',
      selectedMemoryIds: ['release-memory']
    }
    const callRpc = vi.fn(async () => ({
      dispatch: { id: 'ctx_build', task_id: 'task_build' },
      injected: true,
      contextReceipt: {
        id: 'memory-build-assignment-1',
        sha256: '3280a87208bb90faca36dc007137756f015ca610abe5d55c23428d7744e1b7a1',
        characterCount: 21
      }
    }))

    const result = await dispatchBarkosAssignmentToOrca({
      ...dispatchArgs(ledger()),
      memoryContext: context,
      callRpc,
      persist: async (value) => {
        persisted.push(value)
        return value
      }
    })

    expect(persisted[0].dispatches[0].memoryDelivery).toMatchObject({
      receiptId: 'memory-build-assignment-1',
      state: 'prepared',
      memoryIds: ['release-memory'],
      characterCount: 21
    })
    expect(callRpc).toHaveBeenCalledWith(
      'orchestration.dispatch',
      expect.objectContaining({
        supplementalContext: context.text,
        contextReceiptId: 'memory-build-assignment-1'
      })
    )
    expect(result.dispatch.memoryDelivery).toMatchObject({
      state: 'delivered',
      deliveredAt: 10
    })
  })

  it('records an unconfirmed receipt when an older host omits the optional echo', async () => {
    const result = await dispatchBarkosAssignmentToOrca({
      ...dispatchArgs(ledger()),
      memoryContext: {
        text: 'Approved task memory.',
        selectedMemoryIds: ['release-memory']
      },
      callRpc: async () => ({
        dispatch: { id: 'ctx_build', task_id: 'task_build' },
        injected: true
      }),
      persist: async (value) => value
    })

    expect(result.dispatch).toMatchObject({
      state: 'running',
      memoryDelivery: { state: 'unconfirmed', deliveredAt: null }
    })
  })

  it('settles a failed RPC attempt with bounded error evidence', async () => {
    const persisted: BarkosWorkLedger[] = []

    await expect(
      dispatchBarkosAssignmentToOrca({
        ...dispatchArgs(ledger()),
        callRpc: async () => {
          throw new Error('terminal-not-ready')
        },
        persist: async (value) => {
          persisted.push(value)
          return value
        }
      })
    ).rejects.toMatchObject({ code: 'rpc-failed', effects: 'possible' })
    expect(persisted.at(-1)?.dispatches[0]).toMatchObject({
      state: 'failed',
      error: 'terminal-not-ready',
      finishedAt: 10
    })
  })

  it('requires the exact user approval gate for protected work', async () => {
    const callRpc = vi.fn()
    const persist = vi.fn()

    await expect(
      dispatchBarkosAssignmentToOrca({
        ...dispatchArgs(ledger('before-dispatch')),
        callRpc,
        persist
      })
    ).rejects.toMatchObject({ code: 'precondition-failed' })
    expect(callRpc).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
  })

  it('requires an approval gate for high risk work even without an optional task gate', async () => {
    const value = ledger()
    value.plans[0].tasks[0].risk = 'high'
    const callRpc = vi.fn()

    await expect(
      dispatchBarkosAssignmentToOrca({
        ...dispatchArgs(value),
        callRpc,
        persist: vi.fn()
      })
    ).rejects.toMatchObject({ code: 'precondition-failed' })
    expect(callRpc).not.toHaveBeenCalled()
  })

  it('accepts an explicitly resolved user approval gate', async () => {
    const value = ledger('before-dispatch')
    value.approvalGates.push({
      id: 'dispatch-gate',
      taskId: 'build-release',
      assignmentId: 'build-assignment',
      kind: 'dispatch',
      status: 'approved',
      question: 'Dispatch Grace?',
      requestedByWorkerId: 'ada',
      resolution: 'Approved by the user.',
      resolvedBy: 'user',
      createdAt: 4,
      resolvedAt: 5
    })

    await expect(
      dispatchBarkosAssignmentToOrca({
        ...dispatchArgs(value),
        callRpc: async () => ({
          dispatch: { id: 'ctx_build', task_id: 'task_build' },
          injected: true
        }),
        persist: async (next) => next
      })
    ).resolves.toMatchObject({ dispatch: { state: 'running' } })
  })

  it('blocks duplicate uncertain work and enforces the three-attempt ceiling', async () => {
    const unsettled = ledger()
    unsettled.dispatches.push({
      ...failedDispatch(1),
      state: 'prepared',
      error: null,
      finishedAt: null
    })
    await expect(
      dispatchBarkosAssignmentToOrca({
        ...dispatchArgs(unsettled),
        callRpc: vi.fn(),
        persist: vi.fn()
      })
    ).rejects.toMatchObject({ code: 'dispatch-in-progress', effects: 'possible' })

    const exhausted = ledger()
    exhausted.dispatches.push(failedDispatch(1), failedDispatch(2), failedDispatch(3))
    await expect(
      dispatchBarkosAssignmentToOrca({
        ...dispatchArgs(exhausted),
        callRpc: vi.fn(),
        persist: vi.fn()
      })
    ).rejects.toMatchObject({ code: 'dispatch-attempts-exhausted' })
  })
})
