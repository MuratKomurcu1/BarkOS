import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createBarkosCompany } from '../../shared/barkos/company'
import {
  beginBarkosDecisionResolution,
  createEmptyBarkosDecisionInbox,
  parseBarkosDecisionInbox,
  parseBarkosDecisionRequest
} from '../../shared/barkos/decision-inbox'
import {
  BARKOS_DECISION_INBOX_SNAPSHOT_MAX_BYTES,
  BarkosDecisionInboxStore,
  BarkosDecisionInboxStoreError
} from './decision-inbox-store'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship reliable work.',
  leadName: 'Ada',
  now: 1
})

let userDataPath: string

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'barkos-decision-inbox-'))
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

function nextInbox() {
  const empty = createEmptyBarkosDecisionInbox(company.id, company.createdAt, 1)
  return parseBarkosDecisionInbox({
    ...empty,
    revision: 1,
    requests: [
      parseBarkosDecisionRequest({
        id: 'gate:run-1:gate-1',
        sourceKind: 'gate',
        status: 'pending',
        resolutionKind: null,
        taskId: 'task-1',
        assignmentId: null,
        dispatchId: null,
        requestedByWorkerId: null,
        risk: 'critical',
        executionHostId: null,
        orchestrationRunId: 'run-1',
        orchestrationTaskId: 'orca-task-1',
        orchestrationDispatchId: null,
        orchestrationMessageId: null,
        orchestrationGateId: 'gate-1',
        question: 'Apply migration?',
        details: null,
        options: [],
        priority: 'urgent',
        proposedResolution: null,
        resolution: null,
        createdAt: 2,
        lastSeenAt: 2,
        resolvedAt: null
      })
    ],
    updatedAt: 2
  })
}

describe('BarkOS decision inbox store', () => {
  it('stores private durable snapshots and enforces revisions', () => {
    const store = new BarkosDecisionInboxStore(userDataPath)
    expect(store.load(company)).toBeNull()
    const saved = store.save(nextInbox(), company)
    expect(store.load(company)).toEqual(saved)

    const snapshotPath = join(userDataPath, 'barkos', 'decision-inboxes', `${company.id}.json`)
    if (process.platform !== 'win32') {
      expect(statSync(snapshotPath).mode & 0o777).toBe(0o600)
    }
    expect(captureStoreError(() => store.save(saved, company)).code).toBe('snapshot-conflict')
  })

  it('resets audit state for a new company generation', () => {
    const store = new BarkosDecisionInboxStore(userDataPath)
    store.save(nextInbox(), company)
    const recreated = { ...company, createdAt: 10, updatedAt: 10 }

    const loaded = store.load(recreated)

    expect(loaded).toMatchObject({ companyCreatedAt: 10, revision: 0, requests: [] })
  })

  it('recovers an interrupted resolution once on process restart', () => {
    const writer = new BarkosDecisionInboxStore(userDataPath)
    const pending = nextInbox()
    const resolving = beginBarkosDecisionResolution({
      inbox: pending,
      requestId: pending.requests[0].id,
      kind: 'approved',
      resolution: 'Approved by the user.',
      now: 3
    })
    writer.save(resolving, company)

    const reader = new BarkosDecisionInboxStore(userDataPath)
    const recovered = reader.load(company)

    expect(recovered?.requests[0]).toMatchObject({ status: 'resolution-uncertain' })
    expect(recovered?.revision).toBe(resolving.revision + 1)
    expect(reader.load(company)).toEqual(recovered)
  })

  it('rejects future, malformed, and oversized snapshots', () => {
    const store = new BarkosDecisionInboxStore(userDataPath)
    store.save(nextInbox(), company)
    const snapshotPath = join(userDataPath, 'barkos', 'decision-inboxes', `${company.id}.json`)
    const current = JSON.parse(readFileSync(snapshotPath, 'utf8'))
    writeFileSync(snapshotPath, JSON.stringify({ ...current, schemaVersion: 999 }))
    expect(captureStoreError(() => store.load(company)).code).toBe('snapshot-version-unsupported')

    writeFileSync(snapshotPath, '{invalid')
    expect(captureStoreError(() => store.load(company)).code).toBe('snapshot-invalid')

    writeFileSync(snapshotPath, 'x'.repeat(BARKOS_DECISION_INBOX_SNAPSHOT_MAX_BYTES + 1))
    expect(captureStoreError(() => store.load(company)).code).toBe('snapshot-too-large')
  })
})

function captureStoreError(action: () => unknown): BarkosDecisionInboxStoreError {
  try {
    action()
  } catch (error) {
    if (error instanceof BarkosDecisionInboxStoreError) {
      return error
    }
    throw error
  }
  throw new Error('Expected BarkosDecisionInboxStoreError')
}
