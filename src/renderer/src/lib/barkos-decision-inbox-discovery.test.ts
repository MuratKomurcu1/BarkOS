import { describe, expect, it } from 'vitest'
import type { BarkosWorkLedger } from '../../../shared/barkos/work-ledger'
import { discoverBarkosDecisionRequests } from './barkos-decision-inbox-discovery'

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
            status: 'running',
            workspacePolicy: 'worktree',
            preferredEnvironmentId: null,
            risk: 'high',
            approvalPolicy: 'none',
            orchestrationTaskId: 'orca-task',
            createdAt: 2,
            updatedAt: 3
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
        status: 'dispatched',
        reason: 'Grace owns the implementation.',
        matchedCapabilities: ['coding'],
        activeLoadAtAssignment: 0,
        assignedAt: 3,
        approvedAt: 3
      }
    ],
    dispatches: [
      {
        id: 'build-dispatch',
        assignmentId: 'build-assignment',
        taskId: 'build-release',
        workerId: 'grace',
        attempt: 1,
        state: 'running',
        workspaceId: 'workspace-main',
        executionHostId: 'local',
        orchestrationRunId: 'run-release',
        orchestrationTaskId: 'orca-task',
        orchestrationDispatchId: 'orca-dispatch',
        memoryDelivery: null,
        stop: null,
        error: null,
        createdAt: 3,
        startedAt: 3,
        finishedAt: null
      }
    ],
    evidence: [],
    approvalGates: [],
    revision: 1,
    createdAt: 1,
    updatedAt: 3
  }
}

function message(overrides: Record<string, unknown>) {
  return {
    id: 'message-question',
    run_id: 'run-release',
    from_handle: 'dispatch:orca-dispatch',
    to_handle: 'run:run-release',
    subject: 'Question',
    body: 'Which database?',
    type: 'question',
    priority: 'normal',
    thread_id: 'message-question',
    payload: JSON.stringify({
      taskId: 'orca-task',
      dispatchId: 'orca-dispatch',
      question: 'Which database?',
      options: ['PostgreSQL', 'SQLite']
    }),
    read: 0,
    sequence: 1,
    created_at: '2026-08-17 12:00:00',
    delivered_at: null,
    sender_pane_key: null,
    ...overrides
  }
}

describe('BarkOS decision inbox discovery', () => {
  it('maps exact task, assignment, dispatch, worker, risk, and source identities', () => {
    const result = discoverBarkosDecisionRequests({
      ledger: ledger(),
      runId: 'run-release',
      gateListResponse: {
        runId: 'run-release',
        gates: [
          {
            id: 'gate-migration',
            run_id: 'run-release',
            task_id: 'orca-task',
            question: 'Proceed with migration?',
            options: JSON.stringify(['Approve', 'Reject']),
            status: 'pending',
            resolution: null,
            created_at: '2026-08-17 11:00:00',
            resolved_at: null
          }
        ]
      },
      messageListResponse: {
        runId: 'run-release',
        messages: [
          message({}),
          message({
            id: 'message-escalation',
            subject: 'Build is blocked',
            body: 'Registry credentials are unavailable.',
            type: 'escalation',
            priority: 'urgent'
          }),
          message({
            id: 'message-duplicate-gate',
            body: 'Proceed with migration?',
            type: 'decision_gate',
            payload: JSON.stringify({
              taskId: 'orca-task',
              dispatchId: 'orca-dispatch',
              question: 'Proceed with migration?'
            })
          }),
          message({
            id: 'message-foreign',
            payload: JSON.stringify({ taskId: 'orca-task', dispatchId: 'foreign-dispatch' })
          })
        ]
      },
      now: 2_000_000_000_000
    })

    expect(result.requests).toHaveLength(3)
    expect(result.skipped).toBe(1)
    expect(result.requests.find((request) => request.sourceKind === 'question')).toMatchObject({
      taskId: 'build-release',
      assignmentId: 'build-assignment',
      dispatchId: 'build-dispatch',
      requestedByWorkerId: 'grace',
      risk: 'high',
      executionHostId: 'local',
      orchestrationRunId: 'run-release',
      orchestrationTaskId: 'orca-task',
      orchestrationDispatchId: 'orca-dispatch',
      options: ['PostgreSQL', 'SQLite']
    })
    expect(result.requests.find((request) => request.sourceKind === 'gate')).toMatchObject({
      orchestrationGateId: 'gate-migration',
      orchestrationMessageId: null,
      priority: 'high'
    })
    expect(result.requests.find((request) => request.sourceKind === 'escalation')).toMatchObject({
      question: 'Build is blocked',
      details: 'Registry credentials are unavailable.',
      priority: 'urgent'
    })
  })

  it('imports a remotely resolved gate as immutable audit history', () => {
    const result = discoverBarkosDecisionRequests({
      ledger: ledger(),
      runId: 'run-release',
      gateListResponse: {
        runId: 'run-release',
        gates: [
          {
            id: 'gate-resolved',
            run_id: 'run-release',
            task_id: 'orca-task',
            question: 'Deploy?',
            options: '[]',
            status: 'resolved',
            resolution: 'Deploy after backup.',
            created_at: '2026-08-17 11:00:00',
            resolved_at: '2026-08-17 11:05:00'
          }
        ]
      },
      messageListResponse: { runId: 'run-release', messages: [] },
      now: 2_000_000_000_000
    })

    expect(result.requests[0]).toMatchObject({
      status: 'resolved',
      resolution: 'Deploy after backup.',
      proposedResolution: 'Deploy after backup.'
    })
  })

  it('rejects cross-Run responses instead of importing ambiguous data', () => {
    expect(() =>
      discoverBarkosDecisionRequests({
        ledger: ledger(),
        runId: 'run-release',
        gateListResponse: { runId: 'other-run', gates: [] },
        messageListResponse: { runId: 'run-release', messages: [] }
      })
    ).toThrow('does not match')
  })
})
