import { describe, expect, it } from 'vitest'
import { createBarkosCompany } from './company'
import {
  createDefaultBarkosControlPolicy,
  evaluateBarkosDispatchControl,
  parseBarkosControlPolicyForCompany,
  updateBarkosControlPolicy
} from './control-policy'
import { createEmptyBarkosWorkLedger, type BarkosWorkLedger } from './work-ledger'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship dependable work.',
  leadName: 'Ada',
  now: 1
})

function dispatchLedger(): BarkosWorkLedger {
  return {
    ...createEmptyBarkosWorkLedger(company.id, 1),
    objectives: [
      {
        id: 'ship-release',
        companyId: company.id,
        title: 'Ship release',
        brief: 'Ship a verified release.',
        status: 'active',
        activePlanId: 'release-plan',
        orchestrationBinding: { runId: 'run-release', runtimeEnvironmentId: null },
        createdByWorkerId: company.leadWorkerId,
        createdAt: 1,
        updatedAt: 1
      }
    ],
    plans: [
      {
        id: 'release-plan',
        objectiveId: 'ship-release',
        version: 1,
        status: 'active',
        createdByWorkerId: company.leadWorkerId,
        tasks: [
          {
            id: 'verify-release',
            objectiveId: 'ship-release',
            planId: 'release-plan',
            title: 'Verify release',
            spec: 'Run verification.',
            requiredCapabilities: [],
            dependencyIds: [],
            status: 'ready',
            workspacePolicy: 'inherit',
            preferredEnvironmentId: null,
            risk: 'low',
            approvalPolicy: 'none',
            orchestrationTaskId: 'task-verify',
            createdAt: 1,
            updatedAt: 1
          }
        ],
        createdAt: 1,
        approvedAt: 1
      }
    ]
  }
}

describe('BarkOS control policy', () => {
  it('creates bounded running defaults for an exact company generation', () => {
    const policy = createDefaultBarkosControlPolicy(company.id, company.createdAt, 2)
    expect(policy).toMatchObject({
      executionState: 'running',
      maxConcurrentDispatches: 4,
      maxActiveAssignmentsPerWorker: 2,
      maxDispatchesPerObjective: 100,
      revision: 0
    })
    expect(parseBarkosControlPolicyForCompany(policy, company)).toEqual(policy)
  })

  it('updates the policy with a monotonic revision and timestamp', () => {
    const policy = createDefaultBarkosControlPolicy(company.id, company.createdAt, 5)
    const updated = updateBarkosControlPolicy({
      policy,
      updates: {
        executionState: 'paused',
        maxConcurrentDispatches: 6,
        maxActiveAssignmentsPerWorker: 3,
        maxDispatchesPerObjective: 120
      },
      now: 4
    })
    expect(updated).toMatchObject({ executionState: 'paused', revision: 1, updatedAt: 6 })
  })

  it('blocks dispatch while paused or at a concurrency limit', () => {
    const ledger = dispatchLedger()
    const running = createDefaultBarkosControlPolicy(company.id, company.createdAt, 2)
    const paused = updateBarkosControlPolicy({
      policy: running,
      updates: { ...running, executionState: 'paused' }
    })
    expect(
      evaluateBarkosDispatchControl({ policy: paused, ledger, taskId: 'verify-release' })
    ).toEqual(expect.objectContaining({ allowed: false, reason: 'paused' }))

    ledger.dispatches.push({
      id: 'active-dispatch',
      assignmentId: 'active-assignment',
      taskId: 'verify-release',
      workerId: company.leadWorkerId,
      attempt: 1,
      state: 'running',
      workspaceId: 'main',
      executionHostId: 'local',
      orchestrationRunId: 'run-release',
      orchestrationTaskId: 'task-verify',
      orchestrationDispatchId: 'dispatch-active',
      memoryDelivery: null,
      stop: null,
      error: null,
      createdAt: 2,
      startedAt: 2,
      finishedAt: null
    })
    const limited = updateBarkosControlPolicy({
      policy: running,
      updates: { ...running, maxConcurrentDispatches: 1 }
    })
    expect(
      evaluateBarkosDispatchControl({ policy: limited, ledger, taskId: 'verify-release' })
    ).toEqual(
      expect.objectContaining({
        allowed: false,
        reason: 'concurrency-limit',
        activeDispatches: 1
      })
    )
  })

  it('counts settled attempts against the objective dispatch budget', () => {
    const ledger = dispatchLedger()
    ledger.dispatches.push({
      id: 'failed-dispatch',
      assignmentId: 'failed-assignment',
      taskId: 'verify-release',
      workerId: company.leadWorkerId,
      attempt: 1,
      state: 'failed',
      workspaceId: 'main',
      executionHostId: 'local',
      orchestrationRunId: null,
      orchestrationTaskId: 'task-verify',
      orchestrationDispatchId: null,
      memoryDelivery: null,
      stop: null,
      error: 'failed',
      createdAt: 2,
      startedAt: null,
      finishedAt: 3
    })
    const current = createDefaultBarkosControlPolicy(company.id, company.createdAt, 2)
    const policy = updateBarkosControlPolicy({
      policy: current,
      updates: { ...current, maxDispatchesPerObjective: 1 }
    })
    expect(evaluateBarkosDispatchControl({ policy, ledger, taskId: 'verify-release' })).toEqual(
      expect.objectContaining({
        allowed: false,
        reason: 'objective-budget-exhausted',
        objectiveDispatches: 1
      })
    )
  })

  it('fails closed for a different company or unknown task', () => {
    const policy = createDefaultBarkosControlPolicy(company.id, company.createdAt, 2)
    const ledger = dispatchLedger()
    expect(evaluateBarkosDispatchControl({ policy, ledger, taskId: 'missing-task' })).toEqual(
      expect.objectContaining({ allowed: false, reason: 'scope-mismatch' })
    )
    expect(() =>
      parseBarkosControlPolicyForCompany(policy, {
        ...company,
        createdAt: company.createdAt + 1,
        updatedAt: company.updatedAt + 1
      })
    ).toThrow('active company generation')
  })
})
