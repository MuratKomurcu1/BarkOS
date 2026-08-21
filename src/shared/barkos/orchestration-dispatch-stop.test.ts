import { describe, expect, it, vi } from 'vitest'
import type { BarkosOrchestrationAdapterError } from './orchestration-adapter-support'
import { stopBarkosDispatchAuthority } from './orchestration-dispatch-stop'
import { createEmptyBarkosWorkLedger, type BarkosWorkLedger } from './work-ledger'

function runningLedger(): BarkosWorkLedger {
  return {
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
        updatedAt: 2
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
            requiredCapabilities: [],
            dependencyIds: [],
            status: 'running',
            workspacePolicy: 'inherit',
            preferredEnvironmentId: null,
            risk: 'low',
            approvalPolicy: 'none',
            orchestrationTaskId: 'orca-task-1',
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
        reason: 'Best match.',
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
        orchestrationTaskId: 'orca-task-1',
        orchestrationDispatchId: 'orca-dispatch-1',
        memoryDelivery: null,
        stop: null,
        error: null,
        createdAt: 2,
        startedAt: 3,
        finishedAt: null
      }
    ],
    revision: 1,
    updatedAt: 3
  }
}

function successfulRpc(method: string): unknown {
  if (method === 'orchestration.workerStop') {
    return { dispatchId: 'orca-dispatch-1', state: 'stopped', processAction: 'none' }
  }
  if (method === 'terminal.close') {
    return { close: { handle: 'terminal-worker-1', ptyKilled: true } }
  }
  throw new Error(`Unexpected method: ${method}`)
}

function stopArgs(ledger = runningLedger()) {
  return {
    ledger,
    dispatchId: 'dispatch-1',
    workerTerminalHandle: 'terminal-worker-1',
    now: () => 10
  }
}

describe('BarkOS Dispatch stop adapter', () => {
  it('persists intent before stopping authority and commits only after exact PTY proof', async () => {
    const events: string[] = []
    const persisted: BarkosWorkLedger[] = []
    const result = await stopBarkosDispatchAuthority({
      ...stopArgs(),
      callRpc: async (method) => {
        events.push(method)
        return successfulRpc(method)
      },
      persist: async (ledger) => {
        events.push('persist')
        persisted.push(ledger)
        return ledger
      }
    })

    expect(events).toEqual([
      'persist',
      'orchestration.workerStop',
      'persist',
      'terminal.close',
      'persist'
    ])
    expect(persisted.map((ledger) => ledger.dispatches[0].stop?.state)).toEqual([
      'requested',
      'dispatch-stopped',
      'completed'
    ])
    expect(result.dispatch).toMatchObject({ state: 'cancelled', finishedAt: 10 })
    expect(result.ledger.assignments[0].status).toBe('rejected')
    expect(result.ledger.plans[0].tasks[0].status).toBe('cancelled')
  })

  it('does not call Orca when durable intent cannot be persisted', async () => {
    const callRpc = vi.fn()
    await expect(
      stopBarkosDispatchAuthority({
        ...stopArgs(),
        callRpc,
        persist: async () => {
          throw new Error('revision-conflict')
        }
      })
    ).rejects.toMatchObject({
      code: 'persistence-failed',
      stage: 'dispatch-stop-prepare',
      effects: 'none'
    } satisfies Partial<BarkosOrchestrationAdapterError>)
    expect(callRpc).not.toHaveBeenCalled()
  })

  it('records an uncertain result and blocks retry when authority proof is ambiguous', async () => {
    const persisted: BarkosWorkLedger[] = []
    const callRpc = vi.fn(async () => ({
      dispatchId: 'different-dispatch',
      state: 'stopped',
      processAction: 'none'
    }))
    await expect(
      stopBarkosDispatchAuthority({
        ...stopArgs(),
        callRpc,
        persist: async (ledger) => {
          persisted.push(ledger)
          return ledger
        }
      })
    ).rejects.toMatchObject({
      code: 'invalid-rpc-response',
      stage: 'dispatch-stop-authority',
      effects: 'possible'
    } satisfies Partial<BarkosOrchestrationAdapterError>)

    const uncertain = persisted.at(-1)
    if (!uncertain) {
      throw new Error('Expected a durable uncertain stop record')
    }
    expect(uncertain.dispatches[0]).toMatchObject({
      state: 'running',
      stop: { state: 'uncertain', dispatchStoppedAt: null }
    })
    await expect(
      stopBarkosDispatchAuthority({
        ...stopArgs(uncertain),
        callRpc,
        persist: async (ledger) => ledger
      })
    ).rejects.toMatchObject({ code: 'precondition-failed', effects: 'none' })
    expect(callRpc).toHaveBeenCalledTimes(1)
  })

  it('does not close the terminal when authority-proof persistence fails', async () => {
    const callRpc = vi.fn(async (method: string) => successfulRpc(method))
    let persistCount = 0
    await expect(
      stopBarkosDispatchAuthority({
        ...stopArgs(),
        callRpc,
        persist: async (ledger) => {
          persistCount += 1
          if (persistCount === 2) {
            throw new Error('disk-full')
          }
          return ledger
        }
      })
    ).rejects.toMatchObject({
      code: 'persistence-failed',
      stage: 'dispatch-stop-authority-proof',
      effects: 'applied'
    } satisfies Partial<BarkosOrchestrationAdapterError>)
    expect(callRpc).toHaveBeenCalledTimes(1)
  })

  it('retains authority proof but never claims stopped when PTY proof is ambiguous', async () => {
    const persisted: BarkosWorkLedger[] = []
    const callRpc = vi.fn(async (method: string) =>
      method === 'terminal.close'
        ? { close: { handle: 'terminal-worker-1', ptyKilled: false } }
        : successfulRpc(method)
    )
    await expect(
      stopBarkosDispatchAuthority({
        ...stopArgs(),
        callRpc,
        persist: async (ledger) => {
          persisted.push(ledger)
          return ledger
        }
      })
    ).rejects.toMatchObject({
      code: 'invalid-rpc-response',
      stage: 'dispatch-stop-terminal',
      effects: 'applied'
    } satisfies Partial<BarkosOrchestrationAdapterError>)

    expect(persisted.at(-1)?.dispatches[0]).toMatchObject({
      state: 'running',
      stop: {
        state: 'uncertain',
        dispatchStoppedAt: 10,
        terminalKilledAt: null
      }
    })
    expect(persisted.at(-1)?.plans[0].tasks[0].status).toBe('running')
  })

  it('leaves the durable authority proof when the final cancellation commit fails', async () => {
    const durable: BarkosWorkLedger[] = []
    let persistCount = 0
    await expect(
      stopBarkosDispatchAuthority({
        ...stopArgs(),
        callRpc: async (method) => successfulRpc(method),
        persist: async (ledger) => {
          persistCount += 1
          if (persistCount === 3) {
            throw new Error('disk-full')
          }
          durable.push(ledger)
          return ledger
        }
      })
    ).rejects.toMatchObject({
      code: 'persistence-failed',
      stage: 'dispatch-stop-commit',
      effects: 'applied'
    } satisfies Partial<BarkosOrchestrationAdapterError>)
    expect(durable.at(-1)?.dispatches[0].stop?.state).toBe('dispatch-stopped')
  })
})
