import { describe, expect, it } from 'vitest'
import type { BarkosCompany } from './company'
import {
  createEmptyBarkosWorkLedger,
  safeParseBarkosWorkLedger,
  type BarkosWorkLedger
} from './work-ledger'
import { safeParseBarkosWorkLedgerForCompany } from './work-ledger-company'

function company(): BarkosCompany {
  return {
    schemaVersion: 1,
    id: 'barkos-labs',
    name: 'BarkOS Labs',
    mission: 'Ship dependable systems.',
    leadWorkerId: 'ada',
    roles: [
      {
        id: 'lead',
        name: 'Lead',
        mission: 'Plan and review.',
        capabilities: ['planning'],
        definitionOfDone: ['Evidence is accepted.'],
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
      }
    ],
    createdAt: 1,
    updatedAt: 1
  }
}

function ledger(): BarkosWorkLedger {
  return {
    schemaVersion: 5,
    companyId: 'barkos-labs',
    objectives: [
      {
        id: 'ship-release',
        companyId: 'barkos-labs',
        title: 'Ship release',
        brief: 'Prepare and verify the next release.',
        status: 'active',
        activePlanId: 'release-plan',
        orchestrationBinding: { runId: 'run_release', runtimeEnvironmentId: null },
        createdByWorkerId: 'ada',
        createdAt: 1,
        updatedAt: 9
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
            id: 'design-release',
            objectiveId: 'ship-release',
            planId: 'release-plan',
            title: 'Design release',
            spec: 'Define the release contract.',
            requiredCapabilities: ['planning'],
            dependencyIds: [],
            status: 'completed',
            workspacePolicy: 'inherit',
            preferredEnvironmentId: null,
            risk: 'low',
            approvalPolicy: 'none',
            orchestrationTaskId: 'task_design',
            createdAt: 2,
            updatedAt: 7
          },
          {
            id: 'build-release',
            objectiveId: 'ship-release',
            planId: 'release-plan',
            title: 'Build release',
            spec: 'Implement the approved release contract.',
            requiredCapabilities: ['planning'],
            dependencyIds: ['design-release'],
            status: 'ready',
            workspacePolicy: 'worktree',
            preferredEnvironmentId: null,
            risk: 'medium',
            approvalPolicy: 'before-dispatch',
            orchestrationTaskId: null,
            createdAt: 2,
            updatedAt: 8
          }
        ],
        createdAt: 2,
        approvedAt: 3
      }
    ],
    assignments: [
      {
        id: 'design-assignment',
        taskId: 'design-release',
        workerId: 'ada',
        status: 'completed',
        reason: 'Lead owns planning and has no active work.',
        matchedCapabilities: ['planning'],
        activeLoadAtAssignment: 0,
        assignedAt: 3,
        approvedAt: 3
      }
    ],
    dispatches: [
      {
        id: 'design-dispatch',
        assignmentId: 'design-assignment',
        taskId: 'design-release',
        workerId: 'ada',
        attempt: 1,
        state: 'succeeded',
        workspaceId: 'main',
        executionHostId: 'local',
        orchestrationRunId: 'run_release',
        orchestrationTaskId: 'task_design',
        orchestrationDispatchId: 'ctx_design',
        memoryDelivery: null,
        stop: null,
        error: null,
        createdAt: 4,
        startedAt: 4,
        finishedAt: 6
      }
    ],
    evidence: [
      {
        id: 'design-evidence',
        taskId: 'design-release',
        assignmentId: 'design-assignment',
        dispatchId: 'design-dispatch',
        status: 'accepted',
        tests: [
          {
            command: 'pnpm test',
            status: 'passed',
            summary: 'All focused tests passed.',
            durationMs: 500
          }
        ],
        changedFiles: [],
        diffSummary: 'Defined the verified release contract.',
        terminalExcerpts: [],
        screenshots: [],
        risks: [],
        unresolvedDecisions: [],
        producedAt: 6,
        reviewedAt: 7
      }
    ],
    approvalGates: [],
    revision: 0,
    createdAt: 1,
    updatedAt: 9
  }
}

function issueMessages(value: unknown): string[] {
  const result = safeParseBarkosWorkLedger(value)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe('BarkOS work ledger contract', () => {
  it('accepts a dependency-aware plan with accepted evidence', () => {
    expect(safeParseBarkosWorkLedgerForCompany(ledger(), company()).success).toBe(true)
  })

  it('creates a bounded empty ledger for a company', () => {
    expect(createEmptyBarkosWorkLedger('barkos-labs', 42)).toEqual({
      schemaVersion: 5,
      companyId: 'barkos-labs',
      objectives: [],
      plans: [],
      assignments: [],
      dispatches: [],
      evidence: [],
      approvalGates: [],
      revision: 0,
      createdAt: 42,
      updatedAt: 42
    })
  })

  it('rejects missing dependencies and dependency cycles', () => {
    const missing = structuredClone(ledger())
    missing.plans[0].tasks[1].dependencyIds = ['unknown-task']
    expect(issueMessages(missing)).toContain('Invalid task dependency')

    const cyclic = structuredClone(ledger())
    cyclic.plans[0].tasks[0].dependencyIds = ['build-release']
    expect(
      issueMessages(cyclic).some((message) => message.startsWith('Task dependency cycle:'))
    ).toBe(true)
  })

  it('requires accepted evidence before a task can be completed', () => {
    const value = structuredClone(ledger())
    value.evidence[0].status = 'rejected'

    expect(issueMessages(value)).toContain('Completed task has no accepted evidence')
    expect(issueMessages(value)).toContain('Completed assignment has no accepted evidence')
  })

  it('rejects inconsistent, empty, or duplicate submitted evidence', () => {
    const inconsistent = structuredClone(ledger())
    inconsistent.evidence[0].reviewedAt = null
    expect(issueMessages(inconsistent)).toContain('Evidence review state is inconsistent')

    const empty = structuredClone(ledger())
    empty.evidence[0] = {
      ...empty.evidence[0],
      tests: [],
      diffSummary: null
    }
    expect(issueMessages(empty)).toContain('Submitted evidence has no bounded artifacts')

    const duplicate = structuredClone(ledger())
    duplicate.evidence.push({ ...duplicate.evidence[0], id: 'duplicate-evidence' })
    expect(issueMessages(duplicate)).toContain('Dispatch has multiple evidence manifests')
  })

  it('enforces approval state before dispatch', () => {
    const value = structuredClone(ledger())
    value.assignments.push({
      id: 'build-assignment',
      taskId: 'build-release',
      workerId: 'ada',
      status: 'dispatched',
      reason: 'Lead is available.',
      matchedCapabilities: ['planning'],
      activeLoadAtAssignment: 0,
      assignedAt: 8,
      approvedAt: 8
    })

    expect(issueMessages(value)).toContain(
      'Assignment was dispatched without its required approval'
    )
  })

  it('rejects inconsistent gate resolution and foreign workers', () => {
    const value = structuredClone(ledger())
    value.approvalGates.push({
      id: 'build-gate',
      taskId: 'build-release',
      assignmentId: null,
      kind: 'dispatch',
      status: 'approved',
      question: 'Dispatch this task?',
      requestedByWorkerId: 'outsider',
      resolution: null,
      resolvedBy: 'user',
      createdAt: 8,
      resolvedAt: 9
    })

    expect(issueMessages(value)).toContain('Approval gate resolution state is inconsistent')
    const companyResult = safeParseBarkosWorkLedgerForCompany(value, company())
    expect(companyResult.success).toBe(false)
    expect(companyResult.error?.issues.map((issue) => issue.message)).toContain(
      'Approval requester is not a company worker'
    )
  })

  it('rejects unknown fields so credentials cannot enter task state', () => {
    expect(safeParseBarkosWorkLedger({ ...ledger(), providerToken: 'secret' }).success).toBe(false)
  })

  it('rejects duplicate and mismatched Orca identity bindings', () => {
    const duplicateTask = structuredClone(ledger())
    duplicateTask.plans[0].tasks[1].orchestrationTaskId = 'task_design'
    expect(
      issueMessages(duplicateTask).some((message) =>
        message.startsWith('Duplicate orchestration Task binding')
      )
    ).toBe(true)

    const mismatchedDispatch = structuredClone(ledger())
    mismatchedDispatch.dispatches[0].orchestrationRunId = 'run_other'
    expect(issueMessages(mismatchedDispatch)).toContain(
      'Dispatch orchestration binding does not match its Objective and Task'
    )
  })
})
