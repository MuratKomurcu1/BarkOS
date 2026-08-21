import { describe, expect, it } from 'vitest'
import { createEmptyBarkosWorkLedger } from './work-ledger'
import {
  barkosObjectivePlanInputSchema,
  createBarkosObjectivePlan,
  type BarkosObjectivePlanInput
} from './objective-planner'

function input(): BarkosObjectivePlanInput {
  return {
    title: 'Ship release',
    brief: 'Prepare and verify the next release.',
    createdByWorkerId: 'ada',
    tasks: [
      {
        draftId: 'task-1',
        title: 'Design release',
        spec: 'Define the release contract.',
        requiredCapabilities: ['planning'],
        dependencyDraftIds: [],
        workspacePolicy: 'inherit',
        preferredEnvironmentId: null,
        risk: 'low',
        approvalPolicy: 'none'
      },
      {
        draftId: 'task-2',
        title: 'Build release',
        spec: 'Implement and verify the approved contract.',
        requiredCapabilities: ['coding', 'testing'],
        dependencyDraftIds: ['task-1'],
        workspacePolicy: 'worktree',
        preferredEnvironmentId: 'build-host',
        risk: 'medium',
        approvalPolicy: 'before-dispatch'
      }
    ]
  }
}

describe('BarkOS objective planner', () => {
  it('creates an approved dependency-aware plan without starting execution', () => {
    const result = createBarkosObjectivePlan({
      ledger: createEmptyBarkosWorkLedger('barkos-labs', 1),
      input: input(),
      now: 2
    })

    expect(result.revision).toBe(1)
    expect(result.objectives[0]).toMatchObject({
      id: 'ship-release',
      status: 'planned',
      activePlanId: 'ship-release-plan',
      orchestrationBinding: null
    })
    expect(result.plans[0]).toMatchObject({ status: 'approved', approvedAt: 2 })
    expect(result.plans[0].tasks).toMatchObject([
      {
        id: 'ship-release-design-release',
        status: 'ready',
        dependencyIds: [],
        orchestrationTaskId: null
      },
      {
        id: 'ship-release-build-release',
        status: 'blocked',
        dependencyIds: ['ship-release-design-release'],
        orchestrationTaskId: null
      }
    ])
    expect(result.assignments).toEqual([])
    expect(result.dispatches).toEqual([])
  })

  it('creates stable unique ids when labels repeat', () => {
    const first = createBarkosObjectivePlan({
      ledger: createEmptyBarkosWorkLedger('barkos-labs', 1),
      input: input(),
      now: 2
    })
    const duplicate = input()
    duplicate.tasks[1].title = 'Design release'
    const result = createBarkosObjectivePlan({ ledger: first, input: duplicate, now: 3 })

    expect(result.objectives[1].id).toBe('ship-release-2')
    expect(result.plans[1].tasks.map((task) => task.id)).toEqual([
      'ship-release-2-design-release',
      'ship-release-2-design-release-2'
    ])
  })

  it('persists mandatory approval for high-risk work', () => {
    const draft = input()
    draft.tasks[0].risk = 'high'
    draft.tasks[0].approvalPolicy = 'none'

    const result = createBarkosObjectivePlan({
      ledger: createEmptyBarkosWorkLedger('barkos-labs', 1),
      input: draft,
      now: 2
    })

    expect(result.plans[0].tasks[0].approvalPolicy).toBe('before-dispatch')
  })

  it('rejects missing, duplicate, and cyclic draft dependencies', () => {
    const missing = input()
    missing.tasks[1].dependencyDraftIds = ['missing-task']
    expect(barkosObjectivePlanInputSchema.safeParse(missing).success).toBe(false)

    const duplicate = input()
    duplicate.tasks[1].draftId = 'task-1'
    expect(barkosObjectivePlanInputSchema.safeParse(duplicate).success).toBe(false)

    const cyclic = input()
    cyclic.tasks[0].dependencyDraftIds = ['task-2']
    expect(barkosObjectivePlanInputSchema.safeParse(cyclic).success).toBe(false)
  })

  it('rejects unknown fields instead of carrying credentials into task state', () => {
    expect(
      barkosObjectivePlanInputSchema.safeParse({ ...input(), providerToken: 'secret' }).success
    ).toBe(false)
  })
})
