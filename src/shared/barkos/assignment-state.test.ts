import { describe, expect, it } from 'vitest'
import type { BarkosCompany } from './company'
import { assignReadyBarkosTask, decideBarkosDispatchGate } from './assignment-state'
import { createEmptyBarkosWorkLedger, parseBarkosWorkLedger } from './work-ledger'

function company(): BarkosCompany {
  return {
    schemaVersion: 1,
    id: 'barkos-labs',
    name: 'BarkOS Labs',
    mission: 'Ship dependable work.',
    leadWorkerId: 'ada',
    roles: [
      {
        id: 'lead',
        name: 'Lead',
        mission: 'Coordinate work.',
        capabilities: ['planning'],
        definitionOfDone: ['Evidence is reviewed.'],
        instructions: null
      },
      {
        id: 'engineer',
        name: 'Engineer',
        mission: 'Build and verify.',
        capabilities: ['coding', 'testing'],
        definitionOfDone: ['Tests pass.'],
        instructions: null
      }
    ],
    workers: [
      {
        id: 'ada',
        name: 'Ada',
        roleId: 'lead',
        agentId: 'codex',
        model: null,
        preferredEnvironmentId: null,
        workspacePolicy: 'inherit',
        status: 'available'
      },
      {
        id: 'grace',
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
}

function materializedLedger(approvalPolicy: 'none' | 'before-dispatch' = 'none') {
  const empty = createEmptyBarkosWorkLedger('barkos-labs', 1)
  return parseBarkosWorkLedger({
    ...empty,
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
            spec: 'Implement and test the release.',
            requiredCapabilities: ['coding', 'testing'],
            dependencyIds: [],
            status: 'ready',
            workspacePolicy: 'worktree',
            preferredEnvironmentId: null,
            risk: 'medium',
            approvalPolicy,
            orchestrationTaskId: 'task-build',
            createdAt: 1,
            updatedAt: 2
          }
        ],
        createdAt: 1,
        approvedAt: 1
      }
    ],
    revision: 2,
    updatedAt: 2
  })
}

describe('BarkOS assignment state', () => {
  it('records the explicit policy-selected assignment without dispatching it', () => {
    const result = assignReadyBarkosTask({
      ledger: materializedLedger(),
      company: company(),
      taskId: 'build-release',
      now: 3
    })

    expect(result.assignment).toMatchObject({
      workerId: 'grace',
      status: 'approved',
      matchedCapabilities: ['coding', 'testing'],
      activeLoadAtAssignment: 0,
      approvedAt: 3
    })
    expect(result.ledger).toMatchObject({ revision: 3, dispatches: [], approvalGates: [] })
    expect(result.ledger.plans[0].tasks[0].status).toBe('ready')
  })

  it('creates and resolves a separate gate for protected dispatch', () => {
    const assigned = assignReadyBarkosTask({
      ledger: materializedLedger('before-dispatch'),
      company: company(),
      taskId: 'build-release',
      now: 3
    })

    expect(assigned.ledger.approvalGates[0]).toMatchObject({
      assignmentId: assigned.assignment.id,
      kind: 'dispatch',
      status: 'pending',
      resolution: null
    })

    const approved = decideBarkosDispatchGate({
      ledger: assigned.ledger,
      assignmentId: assigned.assignment.id,
      decision: 'approved',
      resolution: 'Approved from the BarkOS objective board.',
      now: 4
    })
    expect(approved.approvalGates[0]).toMatchObject({
      status: 'approved',
      resolvedBy: 'user',
      resolvedAt: 4
    })
    expect(approved.assignments[0].status).toBe('approved')
  })

  it('creates a mandatory dispatch gate for high risk work', () => {
    const value = materializedLedger()
    value.plans[0].tasks[0].risk = 'high'

    const assigned = assignReadyBarkosTask({
      ledger: value,
      company: company(),
      taskId: 'build-release',
      now: 3
    })

    expect(assigned.ledger.approvalGates[0]).toMatchObject({
      assignmentId: assigned.assignment.id,
      kind: 'dispatch',
      status: 'pending'
    })
  })

  it('rejects the assignment when the user rejects its dispatch gate', () => {
    const assigned = assignReadyBarkosTask({
      ledger: materializedLedger('before-dispatch'),
      company: company(),
      taskId: 'build-release',
      now: 3
    })

    const rejected = decideBarkosDispatchGate({
      ledger: assigned.ledger,
      assignmentId: assigned.assignment.id,
      decision: 'rejected',
      resolution: 'Risk needs to be reduced first.',
      now: 4
    })

    expect(rejected.assignments[0].status).toBe('rejected')
    expect(rejected.approvalGates[0].status).toBe('rejected')
    expect(rejected.plans[0].tasks[0].status).toBe('ready')
  })

  it('does not assign a task before Orca materialization', () => {
    const ledger = materializedLedger()
    ledger.plans[0].tasks[0].orchestrationTaskId = null

    expect(() =>
      assignReadyBarkosTask({ ledger, company: company(), taskId: 'build-release', now: 3 })
    ).toThrow('must be prepared in BarkOS')
  })

  it('keeps bounded assignment and gate ids unique for long task ids', () => {
    const firstLedger = materializedLedger('before-dispatch')
    firstLedger.plans[0].tasks[0].id = `task-${'a'.repeat(55)}`
    const taskId = firstLedger.plans[0].tasks[0].id
    const first = assignReadyBarkosTask({
      ledger: firstLedger,
      company: company(),
      taskId,
      now: 3
    })
    const rejected = decideBarkosDispatchGate({
      ledger: first.ledger,
      assignmentId: first.assignment.id,
      decision: 'rejected',
      resolution: 'Use another assignment.',
      now: 4
    })
    const second = assignReadyBarkosTask({
      ledger: rejected,
      company: company(),
      taskId,
      now: 5
    })

    expect(second.assignment.id).not.toBe(first.assignment.id)
    expect(second.ledger.approvalGates[1].id).not.toBe(first.ledger.approvalGates[0].id)
    expect(second.assignment.id.length).toBeLessThanOrEqual(64)
    expect(second.ledger.approvalGates[1].id.length).toBeLessThanOrEqual(64)
  })
})
