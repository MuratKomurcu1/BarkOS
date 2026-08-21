import {
  BARKOS_MAX_DECISION_REQUESTS,
  parseBarkosDecisionInbox,
  parseBarkosDecisionRequest,
  type BarkosDecisionInbox,
  type BarkosDecisionRequest,
  type BarkosDecisionResolutionKind,
  type BarkosSideEffectCategory
} from './decision-inbox'

export const BARKOS_SIDE_EFFECT_APPROVAL_TTL_MS = 30 * 60 * 1_000

function nextInbox(
  inbox: BarkosDecisionInbox,
  requests: BarkosDecisionRequest[],
  now: number
): BarkosDecisionInbox {
  return parseBarkosDecisionInbox({
    ...inbox,
    revision: inbox.revision + 1,
    requests: requests
      .toSorted((left, right) => right.createdAt - left.createdAt)
      .slice(0, BARKOS_MAX_DECISION_REQUESTS),
    updatedAt: Math.max(now, inbox.updatedAt + 1)
  })
}

export function appendBarkosSideEffectApproval(args: {
  inbox: BarkosDecisionInbox
  request: BarkosDecisionRequest
  now: number
}): BarkosDecisionInbox {
  const request = parseBarkosDecisionRequest(args.request)
  if (request.sourceKind !== 'side-effect') {
    throw new Error('BarkOS side-effect approval requires a side-effect request')
  }
  if (args.inbox.requests.some((entry) => entry.id === request.id)) {
    throw new Error('BarkOS side-effect approval request already exists')
  }
  return nextInbox(args.inbox, [request, ...args.inbox.requests], args.now)
}

export function resolveBarkosSideEffectApproval(args: {
  inbox: BarkosDecisionInbox
  requestId: string
  kind: Extract<BarkosDecisionResolutionKind, 'approved' | 'rejected'>
  resolution: string
  now: number
}): BarkosDecisionInbox {
  let found = false
  const requests = args.inbox.requests.map((request) => {
    if (request.id !== args.requestId) {
      return request
    }
    found = true
    if (request.sourceKind !== 'side-effect' || !request.sideEffect) {
      throw new Error('BarkOS request is not a side-effect approval')
    }
    if (request.status !== 'pending' || request.sideEffect.expiresAt <= args.now) {
      throw new Error('BarkOS side-effect approval is no longer pending')
    }
    return parseBarkosDecisionRequest({
      ...request,
      status: 'resolved',
      resolutionKind: args.kind,
      proposedResolution: args.resolution,
      resolution: args.resolution,
      resolvedAt: args.now
    })
  })
  if (!found) {
    throw new Error('BarkOS side-effect approval was not found')
  }
  return nextInbox(args.inbox, requests, args.now)
}

export function consumeBarkosSideEffectApproval(args: {
  inbox: BarkosDecisionInbox
  requestId: string
  now: number
}): BarkosDecisionInbox {
  let found = false
  const requests = args.inbox.requests.map((request) => {
    if (request.id !== args.requestId) {
      return request
    }
    found = true
    if (
      request.sourceKind !== 'side-effect' ||
      !request.sideEffect ||
      request.status !== 'resolved' ||
      request.resolutionKind !== 'approved' ||
      request.sideEffect.consumedAt !== null
    ) {
      throw new Error('BarkOS side-effect approval is not available')
    }
    return parseBarkosDecisionRequest({
      ...request,
      sideEffect: { ...request.sideEffect, consumedAt: args.now }
    })
  })
  if (!found) {
    throw new Error('BarkOS side-effect approval was not found')
  }
  return nextInbox(args.inbox, requests, args.now)
}

export function expireBarkosSideEffectApproval(args: {
  inbox: BarkosDecisionInbox
  requestId: string
  now: number
}): BarkosDecisionInbox {
  let found = false
  const requests = args.inbox.requests.map((request) => {
    if (request.id !== args.requestId) {
      return request
    }
    found = true
    if (request.sourceKind !== 'side-effect' || request.status !== 'pending') {
      throw new Error('BarkOS side-effect approval cannot expire')
    }
    return parseBarkosDecisionRequest({ ...request, status: 'expired', resolvedAt: args.now })
  })
  if (!found) {
    throw new Error('BarkOS side-effect approval was not found')
  }
  return nextInbox(args.inbox, requests, args.now)
}

export function createBarkosSideEffectApprovalRequest(args: {
  id: string
  taskId: string
  assignmentId: string
  dispatchId: string
  workerId: string
  executionHostId: string
  orchestrationRunId: string
  orchestrationTaskId: string
  orchestrationDispatchId: string
  paneKey: string
  categories: BarkosSideEffectCategory[]
  toolName: string
  toolInputSha256: string
  summary: string
  sequence: number
  now: number
}): BarkosDecisionRequest {
  const categoryText = args.categories.join(', ')
  return parseBarkosDecisionRequest({
    id: `${args.id}:${args.sequence}`,
    sourceKind: 'side-effect',
    status: 'pending',
    resolutionKind: null,
    taskId: args.taskId,
    assignmentId: args.assignmentId,
    dispatchId: args.dispatchId,
    requestedByWorkerId: args.workerId,
    risk: args.categories.includes('destructive') ? 'critical' : 'high',
    executionHostId: args.executionHostId,
    orchestrationRunId: args.orchestrationRunId,
    orchestrationTaskId: args.orchestrationTaskId,
    orchestrationDispatchId: args.orchestrationDispatchId,
    orchestrationMessageId: null,
    orchestrationGateId: null,
    question: `Allow ${args.toolName} to perform this ${categoryText} action?`,
    details: args.summary,
    options: [],
    priority: args.categories.includes('destructive') ? 'urgent' : 'high',
    sideEffect: {
      categories: args.categories,
      toolName: args.toolName,
      toolInputSha256: args.toolInputSha256,
      summary: args.summary,
      paneKey: args.paneKey,
      expiresAt: args.now + BARKOS_SIDE_EFFECT_APPROVAL_TTL_MS,
      consumedAt: null
    },
    proposedResolution: null,
    resolution: null,
    createdAt: args.now,
    lastSeenAt: args.now,
    resolvedAt: null
  })
}
