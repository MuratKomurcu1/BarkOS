import {
  BARKOS_MAX_DECISION_REQUESTS,
  barkosDecisionResponseSchema,
  parseBarkosDecisionInbox,
  parseBarkosDecisionRequest,
  type BarkosDecisionInbox,
  type BarkosDecisionRequest,
  type BarkosDecisionResolutionKind
} from './decision-inbox-contract'

export * from './decision-inbox-contract'

function nextInbox(
  inbox: BarkosDecisionInbox,
  requests: BarkosDecisionRequest[],
  now: number
): BarkosDecisionInbox {
  return parseBarkosDecisionInbox({
    ...inbox,
    revision: inbox.revision + 1,
    requests,
    updatedAt: Math.max(now, inbox.updatedAt + 1)
  })
}

export function mergeBarkosDecisionRequests(args: {
  inbox: BarkosDecisionInbox
  discovered: BarkosDecisionRequest[]
  now?: number
}): BarkosDecisionInbox {
  const discovered = args.discovered.map(parseBarkosDecisionRequest)
  const existingById = new Map(args.inbox.requests.map((request) => [request.id, request]))
  let changed = false
  for (const observed of discovered) {
    const existing = existingById.get(observed.id)
    if (!existing) {
      existingById.set(observed.id, observed)
      changed = true
      continue
    }
    if (existing.status === 'resolving' || existing.status === 'resolution-uncertain') {
      continue
    }
    const reconciled =
      observed.sourceKind === 'gate' && observed.status !== 'pending'
        ? observed
        : { ...existing, lastSeenAt: Math.max(existing.lastSeenAt, observed.lastSeenAt) }
    if (JSON.stringify(reconciled) !== JSON.stringify(existing)) {
      existingById.set(observed.id, reconciled)
      changed = true
    }
  }
  if (!changed) {
    return args.inbox
  }
  const requests = [...existingById.values()]
    .toSorted((left, right) => right.createdAt - left.createdAt)
    .slice(0, BARKOS_MAX_DECISION_REQUESTS)
  return nextInbox(args.inbox, requests, args.now ?? Date.now())
}

export function beginBarkosDecisionResolution(args: {
  inbox: BarkosDecisionInbox
  requestId: string
  kind: BarkosDecisionResolutionKind
  resolution: string
  now?: number
}): BarkosDecisionInbox {
  const proposedResolution = barkosDecisionResponseSchema.parse(args.resolution)
  const requests = args.inbox.requests.map((request) => {
    if (request.id !== args.requestId) {
      return request
    }
    if (request.status !== 'pending') {
      throw new Error('BarkOS decision request is no longer pending')
    }
    return parseBarkosDecisionRequest({
      ...request,
      status: 'resolving',
      resolutionKind: args.kind,
      proposedResolution
    })
  })
  if (!requests.some((request) => request.id === args.requestId)) {
    throw new Error('BarkOS decision request was not found')
  }
  return nextInbox(args.inbox, requests, args.now ?? Date.now())
}

export function completeBarkosDecisionResolution(args: {
  inbox: BarkosDecisionInbox
  requestId: string
  now?: number
}): BarkosDecisionInbox {
  const now = args.now ?? Date.now()
  return updateResolvingRequest(args.inbox, args.requestId, now, (request) => ({
    ...request,
    status: 'resolved',
    resolution: request.proposedResolution,
    resolvedAt: now
  }))
}

export function markBarkosDecisionResolutionUncertain(args: {
  inbox: BarkosDecisionInbox
  requestId: string
  now?: number
}): BarkosDecisionInbox {
  const now = args.now ?? Date.now()
  return updateResolvingRequest(args.inbox, args.requestId, now, (request) => ({
    ...request,
    status: 'resolution-uncertain'
  }))
}

export function recoverInterruptedBarkosDecisionResolutions(
  inbox: BarkosDecisionInbox,
  now = Date.now()
): BarkosDecisionInbox {
  let changed = false
  const requests = inbox.requests.map((request) => {
    if (request.status !== 'resolving') {
      return request
    }
    changed = true
    return parseBarkosDecisionRequest({ ...request, status: 'resolution-uncertain' })
  })
  return changed ? nextInbox(inbox, requests, now) : inbox
}

function updateResolvingRequest(
  inbox: BarkosDecisionInbox,
  requestId: string,
  now: number,
  update: (request: BarkosDecisionRequest) => BarkosDecisionRequest
): BarkosDecisionInbox {
  let found = false
  const requests = inbox.requests.map((request) => {
    if (request.id !== requestId) {
      return request
    }
    found = true
    if (request.status !== 'resolving') {
      throw new Error('BarkOS decision request is not resolving')
    }
    return parseBarkosDecisionRequest(update(request))
  })
  if (!found) {
    throw new Error('BarkOS decision request was not found')
  }
  return nextInbox(inbox, requests, now)
}
