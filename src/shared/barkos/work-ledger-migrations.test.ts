import { describe, expect, it } from 'vitest'
import { createEmptyBarkosWorkLedger } from './work-ledger'
import {
  BarkosWorkLedgerMigrationError,
  migrateBarkosWorkLedgerSnapshot
} from './work-ledger-migrations'

function versionZeroSnapshot(): Record<string, unknown> {
  const {
    approvalGates: _approvalGates,
    revision: _revision,
    ...ledger
  } = createEmptyBarkosWorkLedger('barkos-labs', 1)
  return { ...ledger, schemaVersion: 0 }
}

function versionOneSnapshot() {
  return {
    schemaVersion: 1,
    companyId: 'barkos-labs',
    objectives: [
      {
        id: 'ship-release',
        companyId: 'barkos-labs',
        title: 'Ship release',
        brief: 'Build the release.',
        status: 'planned',
        activePlanId: 'release-plan',
        createdByWorkerId: 'ada',
        createdAt: 1,
        updatedAt: 1
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
            id: 'build-release',
            objectiveId: 'ship-release',
            planId: 'release-plan',
            title: 'Build release',
            spec: 'Implement the release.',
            requiredCapabilities: ['coding'],
            dependencyIds: [],
            status: 'ready',
            workspacePolicy: 'worktree',
            preferredEnvironmentId: null,
            risk: 'medium',
            approvalPolicy: 'none',
            createdAt: 1,
            updatedAt: 1
          }
        ],
        createdAt: 1,
        approvedAt: 1
      }
    ],
    assignments: [],
    dispatches: [],
    evidence: [],
    approvalGates: [],
    createdAt: 1,
    updatedAt: 1
  }
}

function versionTwoHighRiskAssignmentSnapshot(): Record<string, unknown> {
  const snapshot = versionOneSnapshot()
  return {
    ...snapshot,
    schemaVersion: 2,
    revision: 0,
    objectives: snapshot.objectives.map((objective) => ({
      ...objective,
      status: 'active',
      orchestrationBinding: { runId: 'run-release', runtimeEnvironmentId: null }
    })),
    plans: snapshot.plans.map((plan) => ({
      ...plan,
      status: 'active',
      tasks: plan.tasks.map((task) => ({
        ...task,
        risk: 'high',
        orchestrationTaskId: 'task-build'
      }))
    })),
    assignments: [
      {
        id: 'assignment-build',
        taskId: 'build-release',
        workerId: 'grace',
        status: 'approved',
        reason: 'Capability match.',
        matchedCapabilities: ['coding'],
        activeLoadAtAssignment: 0,
        assignedAt: 2,
        approvedAt: 2
      }
    ]
  }
}

function versionThreeDispatchSnapshot(): Record<string, unknown> {
  const snapshot = versionTwoHighRiskAssignmentSnapshot()
  return {
    ...snapshot,
    schemaVersion: 3,
    dispatches: [
      {
        id: 'dispatch-assignment-build-1',
        assignmentId: 'assignment-build',
        taskId: 'build-release',
        workerId: 'grace',
        attempt: 1,
        state: 'failed',
        workspaceId: 'workspace-main',
        executionHostId: 'local',
        orchestrationRunId: null,
        orchestrationTaskId: null,
        orchestrationDispatchId: null,
        error: 'Worker unavailable.',
        createdAt: 3,
        startedAt: null,
        finishedAt: 4
      }
    ]
  }
}

function versionFourDispatchSnapshot(): Record<string, unknown> {
  const snapshot = versionThreeDispatchSnapshot()
  return {
    ...snapshot,
    schemaVersion: 4,
    dispatches: (snapshot.dispatches as Record<string, unknown>[]).map((dispatch) => ({
      ...dispatch,
      memoryDelivery: null
    }))
  }
}

describe('BarkOS work-ledger migrations', () => {
  it('adds explicit approval state while migrating version zero', () => {
    expect(migrateBarkosWorkLedgerSnapshot(versionZeroSnapshot())).toEqual({
      ledger: createEmptyBarkosWorkLedger('barkos-labs', 1),
      migratedFromVersion: 0
    })
  })

  it('validates current snapshots without reporting a migration', () => {
    const ledger = createEmptyBarkosWorkLedger('barkos-labs', 2)
    expect(migrateBarkosWorkLedgerSnapshot(ledger)).toEqual({ ledger, migratedFromVersion: null })
  })

  it('adds durable Orca bindings and an optimistic revision to version one', () => {
    const result = migrateBarkosWorkLedgerSnapshot(versionOneSnapshot())

    expect(result.migratedFromVersion).toBe(1)
    expect(result.ledger).toMatchObject({
      schemaVersion: 5,
      revision: 0,
      objectives: [{ orchestrationBinding: null }],
      plans: [{ tasks: [{ orchestrationTaskId: null }] }]
    })
  })

  it('protects pending high-risk assignments while migrating version two', () => {
    const result = migrateBarkosWorkLedgerSnapshot(versionTwoHighRiskAssignmentSnapshot())

    expect(result.migratedFromVersion).toBe(2)
    expect(result.ledger.plans[0].tasks[0].approvalPolicy).toBe('before-dispatch')
    expect(result.ledger.approvalGates[0]).toMatchObject({
      assignmentId: 'assignment-build',
      kind: 'dispatch',
      status: 'pending',
      requestedByWorkerId: 'ada'
    })
  })

  it('adds an empty memory-delivery receipt slot while migrating version three', () => {
    const result = migrateBarkosWorkLedgerSnapshot(versionThreeDispatchSnapshot())

    expect(result.migratedFromVersion).toBe(3)
    expect(result.ledger.dispatches[0].memoryDelivery).toBeNull()
  })

  it('adds an empty stop record slot while migrating version four', () => {
    const result = migrateBarkosWorkLedgerSnapshot(versionFourDispatchSnapshot())

    expect(result.migratedFromVersion).toBe(4)
    expect(result.ledger.dispatches[0].stop).toBeNull()
  })

  it('rejects unknown legacy fields instead of carrying secrets forward', () => {
    expect(() =>
      migrateBarkosWorkLedgerSnapshot({ ...versionZeroSnapshot(), providerToken: 'secret' })
    ).toThrow(BarkosWorkLedgerMigrationError)
  })

  it('rejects future versions without downgrading them', () => {
    try {
      migrateBarkosWorkLedgerSnapshot({ ...versionZeroSnapshot(), schemaVersion: 99 })
    } catch (error) {
      expect(error).toMatchObject({ code: 'unsupported-version', version: 99 })
      return
    }
    throw new Error('Expected an unsupported-version migration error')
  })
})
