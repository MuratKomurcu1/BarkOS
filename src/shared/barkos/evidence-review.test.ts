import { describe, expect, it } from 'vitest'
import type { BarkosWorkLedger } from './work-ledger'
import { reviewBarkosEvidence, submitBarkosEvidence } from './evidence-review'

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
            id: 'design-release',
            objectiveId: 'ship-release',
            planId: 'release-plan',
            title: 'Design release',
            spec: 'Define and verify the release contract.',
            requiredCapabilities: ['planning'],
            dependencyIds: [],
            status: 'running',
            workspacePolicy: 'inherit',
            preferredEnvironmentId: null,
            risk: 'low',
            approvalPolicy: 'none',
            orchestrationTaskId: 'task_design',
            createdAt: 2,
            updatedAt: 3
          },
          {
            id: 'build-release',
            objectiveId: 'ship-release',
            planId: 'release-plan',
            title: 'Build release',
            spec: 'Build the approved release.',
            requiredCapabilities: ['coding'],
            dependencyIds: ['design-release'],
            status: 'blocked',
            workspacePolicy: 'worktree',
            preferredEnvironmentId: null,
            risk: 'medium',
            approvalPolicy: 'none',
            orchestrationTaskId: 'task_build',
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
        id: 'design-assignment',
        taskId: 'design-release',
        workerId: 'ada',
        status: 'dispatched',
        reason: 'Ada owns the release design.',
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
        state: 'running',
        workspaceId: 'main',
        executionHostId: 'local',
        orchestrationRunId: 'run_release',
        orchestrationTaskId: 'task_design',
        orchestrationDispatchId: 'ctx_design',
        memoryDelivery: null,
        stop: null,
        error: null,
        createdAt: 3,
        startedAt: 4,
        finishedAt: null
      }
    ],
    evidence: [],
    approvalGates: [],
    revision: 0,
    createdAt: 1,
    updatedAt: 4
  }
}

const capture = {
  tests: [
    {
      command: 'pnpm test',
      status: 'passed' as const,
      summary: 'Focused tests passed.',
      durationMs: 420
    }
  ],
  changedFiles: [
    {
      path: 'src/release.ts',
      change: 'modified' as const,
      summary: 'Defined the release contract.'
    }
  ],
  diffSummary: 'Added a verified release contract.',
  terminalExcerpts: [],
  screenshots: [],
  risks: ['The downstream implementation is still pending.'],
  unresolvedDecisions: []
}

function submittedLedger(): BarkosWorkLedger {
  return submitBarkosEvidence({
    ledger: ledger(),
    manifestId: 'design-evidence',
    dispatchId: 'design-dispatch',
    capture,
    now: 5
  })
}

describe('BarkOS evidence review', () => {
  it('settles a running dispatch and moves its task to review', () => {
    const result = submittedLedger()

    expect(result.revision).toBe(1)
    expect(result.dispatches[0]).toMatchObject({ state: 'succeeded', finishedAt: 5 })
    expect(result.plans[0].tasks[0].status).toBe('review')
    expect(result.evidence[0]).toMatchObject({
      id: 'design-evidence',
      status: 'submitted',
      taskId: 'design-release',
      assignmentId: 'design-assignment',
      producedAt: 5,
      reviewedAt: null
    })
  })

  it('accepts evidence, completes the assignment, and unlocks dependent work', () => {
    const result = reviewBarkosEvidence({
      ledger: submittedLedger(),
      evidenceId: 'design-evidence',
      decision: 'accepted',
      now: 6
    })

    expect(result.revision).toBe(2)
    expect(result.evidence[0]).toMatchObject({ status: 'accepted', reviewedAt: 6 })
    expect(result.assignments[0].status).toBe('completed')
    expect(result.plans[0].tasks.map((task) => task.status)).toEqual(['completed', 'ready'])
    expect(result.objectives[0].status).toBe('active')
  })

  it('completes the plan and objective when the last task evidence is accepted', () => {
    const value = submittedLedger()
    value.plans[0].tasks = [value.plans[0].tasks[0]]

    const result = reviewBarkosEvidence({
      ledger: value,
      evidenceId: 'design-evidence',
      decision: 'accepted',
      now: 6
    })

    expect(result.plans[0].status).toBe('completed')
    expect(result.objectives[0].status).toBe('completed')
  })

  it('rejects evidence and returns the task to the ready queue', () => {
    const result = reviewBarkosEvidence({
      ledger: submittedLedger(),
      evidenceId: 'design-evidence',
      decision: 'rejected',
      now: 6
    })

    expect(result.evidence[0]).toMatchObject({ status: 'rejected', reviewedAt: 6 })
    expect(result.assignments[0].status).toBe('rejected')
    expect(result.plans[0].tasks[0].status).toBe('ready')
  })

  it('rejects empty, duplicate, and repeated evidence transitions', () => {
    expect(() =>
      submitBarkosEvidence({
        ledger: ledger(),
        manifestId: 'empty-evidence',
        dispatchId: 'design-dispatch',
        capture: {
          tests: [],
          changedFiles: [],
          diffSummary: null,
          terminalExcerpts: [],
          screenshots: [],
          risks: [],
          unresolvedDecisions: []
        },
        now: 5
      })
    ).toThrow(expect.objectContaining({ code: 'evidence-empty' }))

    const submitted = submittedLedger()
    expect(() =>
      submitBarkosEvidence({
        ledger: submitted,
        manifestId: 'second-evidence',
        dispatchId: 'design-dispatch',
        capture,
        now: 6
      })
    ).toThrow(expect.objectContaining({ code: 'dispatch-not-running' }))

    const accepted = reviewBarkosEvidence({
      ledger: submitted,
      evidenceId: 'design-evidence',
      decision: 'accepted',
      now: 6
    })
    expect(() =>
      reviewBarkosEvidence({
        ledger: accepted,
        evidenceId: 'design-evidence',
        decision: 'accepted',
        now: 7
      })
    ).toThrow(expect.objectContaining({ code: 'evidence-not-submitted' }))
  })
})
