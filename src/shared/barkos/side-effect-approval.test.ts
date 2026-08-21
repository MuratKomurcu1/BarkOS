import { describe, expect, it } from 'vitest'
import { createEmptyBarkosDecisionInbox } from './decision-inbox'
import {
  BARKOS_SIDE_EFFECT_APPROVAL_TTL_MS,
  appendBarkosSideEffectApproval,
  consumeBarkosSideEffectApproval,
  createBarkosSideEffectApprovalRequest,
  expireBarkosSideEffectApproval,
  resolveBarkosSideEffectApproval
} from './side-effect-approval'

const NOW = 10
const HASH = 'a'.repeat(64)

function pendingInbox() {
  const inbox = createEmptyBarkosDecisionInbox('company-1', 1, 1)
  return appendBarkosSideEffectApproval({
    inbox,
    request: createBarkosSideEffectApprovalRequest({
      id: `side-effect:dispatch-1:${HASH}`,
      taskId: 'task-1',
      assignmentId: 'assignment-1',
      dispatchId: 'dispatch-1',
      workerId: 'worker-1',
      executionHostId: 'local',
      orchestrationRunId: 'run-1',
      orchestrationTaskId: 'orca-task-1',
      orchestrationDispatchId: 'orca-dispatch-1',
      paneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
      categories: ['destructive'],
      toolName: 'Bash',
      toolInputSha256: HASH,
      summary: 'Bash: rm -rf build',
      sequence: 1,
      now: NOW
    }),
    now: NOW
  })
}

describe('BarkOS side-effect approvals', () => {
  it('records an exact action binding with a bounded lifetime', () => {
    const request = pendingInbox().requests[0]

    expect(request).toMatchObject({
      sourceKind: 'side-effect',
      status: 'pending',
      dispatchId: 'dispatch-1',
      orchestrationDispatchId: 'orca-dispatch-1',
      sideEffect: {
        categories: ['destructive'],
        toolName: 'Bash',
        toolInputSha256: HASH,
        expiresAt: NOW + BARKOS_SIDE_EFFECT_APPROVAL_TTL_MS,
        consumedAt: null
      }
    })
  })

  it('consumes an approval exactly once', () => {
    const pending = pendingInbox()
    const approved = resolveBarkosSideEffectApproval({
      inbox: pending,
      requestId: pending.requests[0].id,
      kind: 'approved',
      resolution: 'Approved.',
      now: NOW + 1
    })
    const consumed = consumeBarkosSideEffectApproval({
      inbox: approved,
      requestId: approved.requests[0].id,
      now: NOW + 2
    })

    expect(consumed.requests[0].sideEffect?.consumedAt).toBe(NOW + 2)
    expect(() =>
      consumeBarkosSideEffectApproval({
        inbox: consumed,
        requestId: consumed.requests[0].id,
        now: NOW + 3
      })
    ).toThrow('not available')
  })

  it('persists rejection and expiry as terminal audit states', () => {
    const pending = pendingInbox()
    const rejected = resolveBarkosSideEffectApproval({
      inbox: pending,
      requestId: pending.requests[0].id,
      kind: 'rejected',
      resolution: 'Rejected.',
      now: NOW + 1
    })
    const expired = expireBarkosSideEffectApproval({
      inbox: pending,
      requestId: pending.requests[0].id,
      now: NOW + BARKOS_SIDE_EFFECT_APPROVAL_TTL_MS
    })

    expect(rejected.requests[0]).toMatchObject({
      status: 'resolved',
      resolutionKind: 'rejected'
    })
    expect(expired.requests[0]).toMatchObject({ status: 'expired', resolvedAt: NOW + 1_800_000 })
  })
})
