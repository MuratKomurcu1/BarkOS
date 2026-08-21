import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createEmptyBarkosWorkLedger,
  type BarkosWorkLedger
} from '../../../shared/barkos/work-ledger'
import { parseBarkosDecisionRequest } from '../../../shared/barkos/decision-inbox'
import type { BarkosWorkerSessionBinding } from '../../../shared/barkos/worker-session'

const callRuntimeRpc = vi.hoisted(() => vi.fn())

vi.mock('../runtime/runtime-rpc-client', () => ({ callRuntimeRpc }))

import {
  refreshBarkosDecisionRequestsOnRuntime,
  resolveBarkosDecisionRequestOnRuntime
} from './barkos-decision-inbox-runtime'

function ledger(): BarkosWorkLedger {
  return {
    ...createEmptyBarkosWorkLedger('barkos-labs', 1),
    objectives: [
      {
        id: 'ship-release',
        companyId: 'barkos-labs',
        title: 'Ship release',
        brief: 'Ship a verified release.',
        status: 'draft',
        activePlanId: null,
        orchestrationBinding: { runId: 'run-release', runtimeEnvironmentId: null },
        createdByWorkerId: 'ada',
        createdAt: 1,
        updatedAt: 1
      }
    ]
  }
}

function coordinator(): BarkosWorkerSessionBinding {
  return {
    workerId: 'ada',
    agent: 'codex',
    targetId: '5:localworkspace-main',
    workspaceId: 'workspace-main',
    workspaceKind: 'worktree',
    executionHostId: 'local',
    tabId: 'tab-lead',
    state: 'created',
    launchedAt: 1
  }
}

function gateRequest() {
  return parseBarkosDecisionRequest({
    id: 'gate:run-release:gate-release',
    sourceKind: 'gate',
    status: 'pending',
    resolutionKind: null,
    taskId: 'build-release',
    assignmentId: null,
    dispatchId: null,
    requestedByWorkerId: null,
    risk: 'high',
    executionHostId: null,
    orchestrationRunId: 'run-release',
    orchestrationTaskId: 'orca-task',
    orchestrationDispatchId: null,
    orchestrationMessageId: null,
    orchestrationGateId: 'gate-release',
    question: 'Deploy?',
    details: null,
    options: [],
    priority: 'high',
    proposedResolution: null,
    resolution: null,
    createdAt: 1,
    lastSeenAt: 1,
    resolvedAt: null
  })
}

beforeEach(() => callRuntimeRpc.mockReset())

describe('BarkOS decision inbox runtime', () => {
  it('reads only the coordinator’s current Run without rebinding it', async () => {
    callRuntimeRpc
      .mockResolvedValueOnce({ run: { id: 'run-release' } })
      .mockResolvedValueOnce({ runId: 'run-release', gates: [] })
      .mockResolvedValueOnce({ runId: 'run-release', messages: [] })

    const result = await refreshBarkosDecisionRequestsOnRuntime({
      ledger: ledger(),
      coordinator: coordinator(),
      coordinatorTerminalHandle: 'term-lead',
      now: 2
    })

    expect(result).toEqual({ requests: [], currentRunId: 'run-release', skipped: 0 })
    expect(callRuntimeRpc).toHaveBeenCalledWith(
      { kind: 'local' },
      'orchestration.check',
      {
        terminal: 'term-lead',
        run: 'run-release',
        all: true,
        types: 'question,decision_gate,escalation'
      },
      { timeoutMs: 10_000 }
    )
    expect(callRuntimeRpc.mock.calls.some(([, method]) => method === 'orchestration.runUse')).toBe(
      false
    )
  })

  it('resolves an exact gate through the current Run authority', async () => {
    callRuntimeRpc.mockResolvedValueOnce({ run: { id: 'run-release' } }).mockResolvedValueOnce({
      gate: { id: 'gate-release', status: 'resolved', resolution: 'Deploy after backup.' }
    })

    await resolveBarkosDecisionRequestOnRuntime({
      ledger: ledger(),
      request: gateRequest(),
      resolution: 'Deploy after backup.',
      coordinator: coordinator(),
      coordinatorTerminalHandle: 'term-lead'
    })

    expect(callRuntimeRpc).toHaveBeenLastCalledWith(
      { kind: 'local' },
      'orchestration.gateResolve',
      {
        id: 'gate-release',
        resolution: 'Deploy after backup.',
        from: 'term-lead',
        run: 'run-release'
      },
      { timeoutMs: 15_000 }
    )
  })

  it('does not mutate when the request belongs to another current Run', async () => {
    callRuntimeRpc.mockResolvedValueOnce({ run: { id: 'other-run' } })

    await expect(
      resolveBarkosDecisionRequestOnRuntime({
        ledger: ledger(),
        request: gateRequest(),
        resolution: 'Deploy.',
        coordinator: coordinator(),
        coordinatorTerminalHandle: 'term-lead'
      })
    ).rejects.toThrow('current Orca Run')
    expect(callRuntimeRpc).toHaveBeenCalledTimes(1)
  })
})
