import { describe, expect, it } from 'vitest'
import type { BarkosTask } from './work-ledger'
import { barkosTaskRequiresDispatchApproval, reviewBarkosTaskAuthority } from './task-authority'

function task(
  risk: BarkosTask['risk'],
  approvalPolicy: BarkosTask['approvalPolicy'] = 'none'
): BarkosTask {
  return {
    id: 'ship-release',
    objectiveId: 'release',
    planId: 'release-plan',
    title: 'Ship release',
    spec: 'Build, test, and ship the release.',
    requiredCapabilities: [],
    dependencyIds: [],
    status: 'ready',
    workspacePolicy: 'inherit',
    preferredEnvironmentId: null,
    risk,
    approvalPolicy,
    orchestrationTaskId: 'task-release',
    createdAt: 1,
    updatedAt: 1
  }
}

describe('BarkOS task authority review', () => {
  it('lets low and medium risk work dispatch directly unless explicitly protected', () => {
    expect(barkosTaskRequiresDispatchApproval(task('low'))).toBe(false)
    expect(barkosTaskRequiresDispatchApproval(task('medium'))).toBe(false)
    expect(barkosTaskRequiresDispatchApproval(task('low', 'before-dispatch'))).toBe(true)
  })

  it('always protects high and critical risk work', () => {
    expect(reviewBarkosTaskAuthority(task('high'))).toMatchObject({
      instructionDelivery: 'exact-task-spec',
      risk: 'high',
      dispatchApprovalRequired: true,
      externalActionsRequireApproval: true,
      destructiveActionsRequireApproval: true
    })
    expect(barkosTaskRequiresDispatchApproval(task('critical'))).toBe(true)
  })
})
