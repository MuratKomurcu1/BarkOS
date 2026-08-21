import { describe, expect, it } from 'vitest'
import { createBarkosCompany } from './company'
import {
  beginBarkosDecisionResolution,
  completeBarkosDecisionResolution,
  createEmptyBarkosDecisionInbox,
  markBarkosDecisionResolutionUncertain,
  mergeBarkosDecisionRequests,
  parseBarkosDecisionInbox,
  parseBarkosDecisionInboxForCompany,
  parseBarkosDecisionRequest,
  recoverInterruptedBarkosDecisionResolutions,
  type BarkosDecisionRequest
} from './decision-inbox'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship reliable work.',
  leadName: 'Ada',
  now: 1
})

function request(overrides: Partial<BarkosDecisionRequest> = {}): BarkosDecisionRequest {
  return parseBarkosDecisionRequest({
    id: 'question:run-1:message-1',
    sourceKind: 'question',
    status: 'pending',
    resolutionKind: null,
    taskId: 'task-1',
    assignmentId: 'assignment-1',
    dispatchId: 'dispatch-1',
    requestedByWorkerId: company.leadWorkerId,
    risk: 'high',
    executionHostId: 'local',
    orchestrationRunId: 'run-1',
    orchestrationTaskId: 'orca-task-1',
    orchestrationDispatchId: 'orca-dispatch-1',
    orchestrationMessageId: 'message-1',
    orchestrationGateId: null,
    question: 'Proceed?',
    details: null,
    options: ['Yes', 'No'],
    priority: 'high',
    proposedResolution: null,
    resolution: null,
    createdAt: 2,
    lastSeenAt: 2,
    resolvedAt: null,
    ...overrides
  })
}

describe('BarkOS decision inbox contract', () => {
  it('migrates version one snapshots without changing their existing requests', () => {
    const current = createEmptyBarkosDecisionInbox(company.id, company.createdAt, 1)
    const migrated = parseBarkosDecisionInbox({ ...current, schemaVersion: 1 })

    expect(migrated).toEqual({ ...current, schemaVersion: 2 })
  })

  it('persists a two-phase audited resolution', () => {
    const empty = createEmptyBarkosDecisionInbox(company.id, company.createdAt, 1)
    const discovered = mergeBarkosDecisionRequests({
      inbox: empty,
      discovered: [request()],
      now: 2
    })
    const resolving = beginBarkosDecisionResolution({
      inbox: discovered,
      requestId: request().id,
      kind: 'approved',
      resolution: 'Approved by the user.',
      now: 3
    })
    const resolved = completeBarkosDecisionResolution({
      inbox: resolving,
      requestId: request().id,
      now: 4
    })

    expect(resolved.requests[0]).toMatchObject({
      status: 'resolved',
      resolutionKind: 'approved',
      proposedResolution: 'Approved by the user.',
      resolution: 'Approved by the user.',
      resolvedAt: 4
    })
    expect(resolved.revision).toBe(3)
  })

  it('records an uncertain mutation outcome without making it retryable', () => {
    const inbox = mergeBarkosDecisionRequests({
      inbox: createEmptyBarkosDecisionInbox(company.id, company.createdAt, 1),
      discovered: [request()],
      now: 2
    })
    const resolving = beginBarkosDecisionResolution({
      inbox,
      requestId: request().id,
      kind: 'answered',
      resolution: 'Use PostgreSQL.',
      now: 3
    })
    const uncertain = markBarkosDecisionResolutionUncertain({
      inbox: resolving,
      requestId: request().id,
      now: 4
    })

    expect(uncertain.requests[0]).toMatchObject({
      status: 'resolution-uncertain',
      proposedResolution: 'Use PostgreSQL.',
      resolution: null
    })
    expect(() =>
      beginBarkosDecisionResolution({
        inbox: uncertain,
        requestId: request().id,
        kind: 'answered',
        resolution: 'Retry',
        now: 5
      })
    ).toThrow('no longer pending')
  })

  it('recovers an interrupted mutation as uncertain without retrying it', () => {
    const inbox = mergeBarkosDecisionRequests({
      inbox: createEmptyBarkosDecisionInbox(company.id, company.createdAt, 1),
      discovered: [request()],
      now: 2
    })
    const resolving = beginBarkosDecisionResolution({
      inbox,
      requestId: request().id,
      kind: 'answered',
      resolution: 'Use PostgreSQL.',
      now: 3
    })

    const recovered = recoverInterruptedBarkosDecisionResolutions(resolving, 4)

    expect(recovered.requests[0]).toMatchObject({
      status: 'resolution-uncertain',
      proposedResolution: 'Use PostgreSQL.'
    })
    expect(recovered.revision).toBe(resolving.revision + 1)
  })

  it('preserves local uncertain state during remote discovery', () => {
    const inbox = mergeBarkosDecisionRequests({
      inbox: createEmptyBarkosDecisionInbox(company.id, company.createdAt, 1),
      discovered: [request()],
      now: 2
    })
    const uncertain = markBarkosDecisionResolutionUncertain({
      inbox: beginBarkosDecisionResolution({
        inbox,
        requestId: request().id,
        kind: 'rejected',
        resolution: 'Rejected.',
        now: 3
      }),
      requestId: request().id,
      now: 4
    })
    const merged = mergeBarkosDecisionRequests({
      inbox: uncertain,
      discovered: [request({ lastSeenAt: 8 })],
      now: 8
    })

    expect(merged).toBe(uncertain)
  })

  it('rejects source identifier ambiguity, invalid audit state, and another company', () => {
    expect(() =>
      parseBarkosDecisionRequest({ ...request(), orchestrationGateId: 'gate-1' })
    ).toThrow()
    expect(() =>
      parseBarkosDecisionRequest({ ...request(), status: 'resolved', resolution: 'Yes' })
    ).toThrow()
    const inbox = createEmptyBarkosDecisionInbox(company.id, company.createdAt, 1)
    const other = createBarkosCompany({
      name: 'Other',
      mission: 'Keep decisions isolated.',
      leadName: 'Grace',
      now: 1
    })
    expect(() => parseBarkosDecisionInboxForCompany(inbox, other)).toThrow('does not match')
  })
})
