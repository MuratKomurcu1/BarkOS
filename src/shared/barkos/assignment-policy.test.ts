import { describe, expect, it } from 'vitest'
import type { BarkosCompany } from './company'
import type { BarkosAssignment, BarkosTask } from './work-ledger'
import { selectBarkosWorkerForTask } from './assignment-policy'

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
        mission: 'Plan work.',
        capabilities: ['planning'],
        definitionOfDone: ['Plan is reviewed.'],
        instructions: null
      },
      {
        id: 'engineer',
        name: 'Engineer',
        mission: 'Build and verify.',
        capabilities: ['Coding', 'Testing'],
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
        preferredEnvironmentId: 'build-host',
        workspacePolicy: 'inherit',
        status: 'available'
      },
      {
        id: 'linus',
        name: 'Linus',
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

function task(overrides: Partial<BarkosTask> = {}): BarkosTask {
  return {
    id: 'build-release',
    objectiveId: 'ship-release',
    planId: 'release-plan',
    title: 'Build release',
    spec: 'Implement and verify the release.',
    requiredCapabilities: ['coding', 'testing'],
    dependencyIds: [],
    status: 'ready',
    workspacePolicy: 'worktree',
    preferredEnvironmentId: 'build-host',
    risk: 'medium',
    approvalPolicy: 'none',
    orchestrationTaskId: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

function assignment(workerId: string, overrides: Partial<BarkosAssignment> = {}): BarkosAssignment {
  return {
    id: `${workerId}-assignment`,
    taskId: 'other-task',
    workerId,
    status: 'dispatched',
    reason: 'Existing work.',
    matchedCapabilities: ['coding'],
    activeLoadAtAssignment: 0,
    assignedAt: 1,
    approvedAt: 1,
    ...overrides
  }
}

describe('BarkOS assignment policy', () => {
  it('matches capabilities case-insensitively and prefers the requested environment on a tie', () => {
    expect(
      selectBarkosWorkerForTask({ company: company(), task: task(), assignments: [] })
    ).toMatchObject({
      ok: true,
      workerId: 'grace',
      matchedCapabilities: ['coding', 'testing'],
      activeAssignments: 0,
      environmentMatched: true
    })
  })

  it('prefers the lower active load before environment affinity', () => {
    expect(
      selectBarkosWorkerForTask({
        company: company(),
        task: task(),
        assignments: [assignment('grace')]
      })
    ).toMatchObject({ ok: true, workerId: 'linus', activeAssignments: 0 })
  })

  it('excludes the previous worker when selecting a reassignment target', () => {
    expect(
      selectBarkosWorkerForTask({
        company: company(),
        task: task(),
        assignments: [],
        excludedWorkerIds: ['grace']
      })
    ).toMatchObject({ ok: true, workerId: 'linus' })
  })

  it('excludes paused and offline workers', () => {
    const value = company()
    value.workers[1].status = 'paused'
    value.workers[2].status = 'offline'

    expect(selectBarkosWorkerForTask({ company: value, task: task(), assignments: [] })).toEqual({
      ok: false,
      reason: 'capabilities-uncovered',
      consideredWorkerIds: ['ada'],
      missingCapabilities: ['coding', 'testing']
    })
  })

  it('refuses partial capability coverage instead of silently assigning', () => {
    expect(
      selectBarkosWorkerForTask({
        company: company(),
        task: task({ requiredCapabilities: ['coding', 'security'] }),
        assignments: []
      })
    ).toMatchObject({
      ok: false,
      reason: 'capabilities-uncovered',
      missingCapabilities: ['security']
    })
  })

  it('enforces the active assignment ceiling', () => {
    const assignments = [
      assignment('grace'),
      assignment('grace', { id: 'grace-assignment-2' }),
      assignment('linus'),
      assignment('linus', { id: 'linus-assignment-2' })
    ]

    expect(
      selectBarkosWorkerForTask({ company: company(), task: task(), assignments })
    ).toMatchObject({ ok: false, reason: 'no-worker-capacity' })
  })

  it('does not create a second active assignment for the same task', () => {
    expect(
      selectBarkosWorkerForTask({
        company: company(),
        task: task(),
        assignments: [assignment('grace', { taskId: 'build-release' })]
      })
    ).toEqual({
      ok: false,
      reason: 'task-already-assigned',
      consideredWorkerIds: ['grace'],
      missingCapabilities: []
    })
  })
})
