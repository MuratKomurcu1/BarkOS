import { describe, expect, it, vi } from 'vitest'
import type { BarkosOrchestrationAdapterError } from './orchestration-adapter-support'
import { replaceBarkosCodexDispatchAuthority } from './provider-failover-dispatch'
import { createEmptyBarkosWorkLedger, type BarkosWorkLedger } from './work-ledger'

function ledger(): BarkosWorkLedger {
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
        createdByWorkerId: 'worker-1',
        createdAt: 1,
        updatedAt: 1
      }
    ],
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
            title: 'Implement',
            spec: 'Implement the release.',
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
        assignedAt: 1,
        approvedAt: 1
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
        orchestrationDispatchId: 'ctx-old',
        memoryDelivery: null,
        stop: null,
        error: null,
        createdAt: 1,
        startedAt: 2,
        finishedAt: null
      }
    ],
    revision: 1,
    updatedAt: 2
  }
}

function successfulRpc(method: string): unknown {
  switch (method) {
    case 'orchestration.workerStop':
      return { dispatchId: 'ctx-old', state: 'stopped', processAction: 'none' }
    case 'terminal.close':
      return { close: { handle: 'terminal-old', ptyKilled: true } }
    case 'orchestration.taskUpdate':
      return { task: { id: 'orca-task-1', status: 'ready' } }
    case 'orchestration.runUse':
      return { run: { id: 'run-1' }, binding: { consumerGeneration: 2 } }
    case 'orchestration.dispatch':
      return { dispatch: { id: 'ctx-new', task_id: 'orca-task-1' }, injected: true }
    default:
      throw new Error(`Unexpected method: ${method}`)
  }
}

describe('BarkOS Codex failover Dispatch replacement', () => {
  it('fences and kills the old process before launching and committing new authority', async () => {
    const events: string[] = []
    const callRpc = vi.fn(async (method: string) => {
      events.push(method)
      return successfulRpc(method)
    })
    const persist = vi.fn(async (value: BarkosWorkLedger) => {
      events.push('persist')
      return value
    })

    const result = await replaceBarkosCodexDispatchAuthority({
      ledger: ledger(),
      dispatchId: 'dispatch-1',
      coordinatorTerminalHandle: 'terminal-coordinator',
      sourceWorkerTerminalHandle: 'terminal-old',
      launchReplacement: async () => {
        events.push('launch')
        return { terminalHandle: 'terminal-new' }
      },
      callRpc,
      persist,
      now: () => 10
    })

    expect(events).toEqual([
      'orchestration.workerStop',
      'terminal.close',
      'launch',
      'orchestration.taskUpdate',
      'orchestration.dispatch',
      'persist'
    ])
    expect(callRpc).toHaveBeenNthCalledWith(3, 'orchestration.taskUpdate', {
      id: 'orca-task-1',
      status: 'ready',
      run: 'run-1',
      callerTerminalHandle: 'terminal-coordinator'
    })
    expect(callRpc).toHaveBeenNthCalledWith(4, 'orchestration.dispatch', {
      task: 'orca-task-1',
      to: 'terminal-new',
      from: 'terminal-coordinator',
      inject: true,
      run: 'run-1'
    })
    expect(result.dispatch.orchestrationDispatchId).toBe('ctx-new')
    expect(result.ledger.revision).toBe(2)
  })

  it('never launches a second writer when the exact old PTY stop is unproven', async () => {
    const launchReplacement = vi.fn()
    const callRpc = vi.fn(async (method: string) =>
      method === 'terminal.close'
        ? { close: { handle: 'terminal-old', ptyKilled: false, ptyStopVerdict: 'live' } }
        : successfulRpc(method)
    )

    const promise = replaceBarkosCodexDispatchAuthority({
      ledger: ledger(),
      dispatchId: 'dispatch-1',
      coordinatorTerminalHandle: 'terminal-coordinator',
      sourceWorkerTerminalHandle: 'terminal-old',
      launchReplacement,
      callRpc,
      persist: vi.fn()
    })
    await expect(promise).rejects.toMatchObject({
      code: 'invalid-rpc-response',
      stage: 'failover-terminal-close',
      effects: 'applied'
    } satisfies Partial<BarkosOrchestrationAdapterError>)
    expect(launchReplacement).not.toHaveBeenCalled()
  })

  it('rebinds a replacement lead before it mutates and redispatches its Run', async () => {
    const callRpc = vi.fn(async (method: string) => successfulRpc(method))
    await replaceBarkosCodexDispatchAuthority({
      ledger: ledger(),
      dispatchId: 'dispatch-1',
      coordinatorTerminalHandle: 'terminal-old',
      sourceWorkerTerminalHandle: 'terminal-old',
      rebindCoordinator: true,
      launchReplacement: async () => ({ terminalHandle: 'terminal-new' }),
      callRpc,
      persist: async (value) => value
    })

    expect(callRpc).toHaveBeenNthCalledWith(3, 'orchestration.runUse', {
      id: 'run-1',
      from: 'terminal-new'
    })
    expect(callRpc).toHaveBeenNthCalledWith(4, 'orchestration.taskUpdate', {
      id: 'orca-task-1',
      status: 'ready',
      run: 'run-1',
      callerTerminalHandle: 'terminal-new'
    })
    expect(callRpc).toHaveBeenNthCalledWith(5, 'orchestration.dispatch', {
      task: 'orca-task-1',
      to: 'terminal-new',
      from: 'terminal-new',
      inject: true,
      run: 'run-1'
    })
  })

  it('leaves an applied-effect error when work-ledger durability fails after replacement', async () => {
    const promise = replaceBarkosCodexDispatchAuthority({
      ledger: ledger(),
      dispatchId: 'dispatch-1',
      coordinatorTerminalHandle: 'terminal-coordinator',
      sourceWorkerTerminalHandle: 'terminal-old',
      launchReplacement: async () => ({ terminalHandle: 'terminal-new' }),
      callRpc: async (method) => successfulRpc(method),
      persist: async () => {
        throw new Error('disk-full')
      }
    })
    await expect(promise).rejects.toMatchObject({
      code: 'persistence-failed',
      stage: 'failover-dispatch-commit',
      effects: 'applied'
    } satisfies Partial<BarkosOrchestrationAdapterError>)
  })
})
