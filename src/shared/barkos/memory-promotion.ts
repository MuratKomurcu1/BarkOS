import type { BarkosCompany } from './company'
import { containsBarkosCredentialLikeContent } from './memory-content-policy'
import {
  BARKOS_MAX_MEMORY_CANDIDATES,
  nextBarkosMemoryVaultRevision,
  type BarkosMemoryCandidate,
  type BarkosMemoryEntry,
  type BarkosMemoryScope,
  type BarkosMemoryVault
} from './memory-vault'
import type { BarkosEvidenceManifest, BarkosWorkLedger } from './work-ledger'

function memoryCandidateContent(manifest: BarkosEvidenceManifest): string {
  const testSummary =
    manifest.tests.length > 0
      ? `${manifest.tests.filter((test) => test.status === 'passed').length}/${manifest.tests.length} recorded tests passed.`
      : 'No test result was recorded.'
  const safeDiffSummary =
    manifest.diffSummary && !containsBarkosCredentialLikeContent(manifest.diffSummary)
      ? manifest.diffSummary
      : null
  const safeRisks = manifest.risks.filter((risk) => !containsBarkosCredentialLikeContent(risk))
  const omittedCredentialLikeText =
    safeDiffSummary !== manifest.diffSummary || safeRisks.length !== manifest.risks.length
  const sections = [
    'The user accepted the evidence for this completed task.',
    safeDiffSummary ? `Evidence summary: ${safeDiffSummary}` : null,
    testSummary,
    `${manifest.changedFiles.length} changed file record(s) were attached.`,
    safeRisks.length > 0 ? `Recorded risks: ${safeRisks.join('; ')}` : null,
    omittedCredentialLikeText
      ? 'Credential-like evidence text was omitted from this memory proposal.'
      : null
  ].filter((section): section is string => section !== null)
  return sections.join('\n').slice(0, 8_000).trim()
}

export function reconcileAcceptedEvidenceMemoryCandidates(args: {
  vault: BarkosMemoryVault
  company: BarkosCompany
  ledger: BarkosWorkLedger
  now?: number
}): BarkosMemoryVault {
  if (
    args.vault.companyId !== args.company.id ||
    args.vault.companyCreatedAt !== args.company.createdAt ||
    args.ledger.companyId !== args.company.id
  ) {
    throw new Error('BarkOS memory reconciliation requires one company boundary')
  }
  const knownEvidence = new Set([
    ...args.vault.candidates.map((candidate) => candidate.source.evidenceId),
    ...args.vault.entries.map((entry) => entry.source.evidenceId)
  ])
  const candidates = [...args.vault.candidates]
  const tasks = new Map(
    args.ledger.plans.flatMap((plan) => plan.tasks).map((task) => [task.id, task])
  )
  const assignments = new Map(
    args.ledger.assignments.map((assignment) => [assignment.id, assignment])
  )
  const dispatches = new Map(args.ledger.dispatches.map((dispatch) => [dispatch.id, dispatch]))
  const workers = new Map(args.company.workers.map((worker) => [worker.id, worker]))
  for (const manifest of args.ledger.evidence) {
    if (
      manifest.status !== 'accepted' ||
      manifest.reviewedAt === null ||
      knownEvidence.has(manifest.id)
    ) {
      continue
    }
    const task = tasks.get(manifest.taskId)
    const assignment = assignments.get(manifest.assignmentId)
    const dispatch = dispatches.get(manifest.dispatchId)
    const worker = assignment ? workers.get(assignment.workerId) : undefined
    if (!task || !assignment || !dispatch || !worker || dispatch.workerId !== worker.id) {
      continue
    }
    candidates.push({
      id: manifest.id,
      status: 'pending',
      scope: { kind: 'project', targetId: dispatch.workspaceId },
      title: containsBarkosCredentialLikeContent(task.title) ? 'Verified task outcome' : task.title,
      content: memoryCandidateContent(manifest),
      source: {
        kind: 'accepted-evidence',
        evidenceId: manifest.id,
        taskId: task.id,
        assignmentId: assignment.id,
        dispatchId: dispatch.id,
        workerId: worker.id,
        roleId: worker.roleId,
        workspaceId: dispatch.workspaceId,
        capturedAt: manifest.reviewedAt
      },
      confidence: 80,
      expiresAt: null,
      createdAt: manifest.reviewedAt,
      lastSeenAt: Math.max(args.now ?? Date.now(), manifest.reviewedAt),
      resolvedAt: null,
      promotedMemoryId: null
    })
    knownEvidence.add(manifest.id)
  }
  if (candidates.length === args.vault.candidates.length) {
    return args.vault
  }
  return nextBarkosMemoryVaultRevision(
    args.vault,
    {
      entries: args.vault.entries,
      candidates: candidates.slice(-BARKOS_MAX_MEMORY_CANDIDATES)
    },
    args.now ?? Date.now()
  )
}

function sameScope(left: BarkosMemoryScope, right: BarkosMemoryScope): boolean {
  return left.kind === right.kind && left.targetId === right.targetId
}

export function barkosMemoryCandidateScope(
  candidate: BarkosMemoryCandidate,
  kind: BarkosMemoryScope['kind']
): BarkosMemoryScope {
  switch (kind) {
    case 'company':
      return { kind, targetId: null }
    case 'role':
      return { kind, targetId: candidate.source.roleId }
    case 'worker':
      return { kind, targetId: candidate.source.workerId }
    case 'project':
      return { kind, targetId: candidate.source.workspaceId }
    case 'task':
      return { kind, targetId: candidate.source.taskId }
  }
}

export type BarkosMemoryPromotionSettings = {
  scope: BarkosMemoryScope
  confidence: number
  expiresAt: number | null
  contradictsMemoryIds: string[]
}

export function promoteBarkosMemoryCandidate(args: {
  vault: BarkosMemoryVault
  candidateId: string
  scope?: BarkosMemoryScope
  confidence?: number
  expiresAt?: number | null
  contradictsMemoryIds?: string[]
  now?: number
}): BarkosMemoryVault {
  const candidate = args.vault.candidates.find((entry) => entry.id === args.candidateId)
  if (!candidate || candidate.status !== 'pending') {
    throw new Error('BarkOS memory candidate is not pending')
  }
  if (args.vault.entries.some((entry) => entry.id === candidate.id)) {
    throw new Error('BarkOS memory entry already exists')
  }
  const scope = args.scope ?? candidate.scope
  const allowedScope = barkosMemoryCandidateScope(candidate, scope.kind)
  if (!sameScope(scope, allowedScope)) {
    throw new Error('BarkOS memory scope must match the accepted evidence provenance')
  }
  const confidence = args.confidence ?? candidate.confidence
  if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
    throw new Error('BarkOS memory confidence must be an integer from 0 to 100')
  }
  const expiresAt = args.expiresAt === undefined ? candidate.expiresAt : args.expiresAt
  const contradictionIds = [...new Set(args.contradictsMemoryIds ?? [])]
  const contradictions = contradictionIds.map((id) => {
    const entry = args.vault.entries.find((item) => item.id === id)
    if (!entry || entry.status !== 'active' || !sameScope(entry.scope, scope)) {
      throw new Error(`BarkOS contradiction ${id} is not active in the same scope`)
    }
    return entry
  })
  const now = args.now ?? Date.now()
  if (expiresAt !== null && expiresAt <= now) {
    throw new Error('BarkOS memory candidate has expired')
  }
  const memory: BarkosMemoryEntry = {
    id: candidate.id,
    status: 'active',
    scope,
    title: candidate.title,
    content: candidate.content,
    source: candidate.source,
    confidence,
    expiresAt,
    contradictsMemoryIds: contradictionIds,
    supersededByMemoryId: null,
    promotedBy: 'user',
    createdAt: candidate.createdAt,
    promotedAt: now,
    revokedAt: null
  }
  return nextBarkosMemoryVaultRevision(
    args.vault,
    {
      entries: [
        ...args.vault.entries.map((entry) =>
          contradictions.includes(entry)
            ? { ...entry, status: 'superseded' as const, supersededByMemoryId: memory.id }
            : entry
        ),
        memory
      ],
      candidates: args.vault.candidates.map((entry) =>
        entry.id === candidate.id
          ? {
              ...entry,
              status: 'promoted' as const,
              scope,
              confidence,
              expiresAt,
              resolvedAt: now,
              promotedMemoryId: memory.id
            }
          : entry
      )
    },
    now
  )
}

export function rejectBarkosMemoryCandidate(
  vault: BarkosMemoryVault,
  candidateId: string,
  now = Date.now()
): BarkosMemoryVault {
  const candidate = vault.candidates.find((entry) => entry.id === candidateId)
  if (!candidate || candidate.status !== 'pending') {
    throw new Error('BarkOS memory candidate is not pending')
  }
  return nextBarkosMemoryVaultRevision(
    vault,
    {
      entries: vault.entries,
      candidates: vault.candidates.map((entry) =>
        entry.id === candidateId
          ? { ...entry, status: 'rejected' as const, resolvedAt: now }
          : entry
      )
    },
    now
  )
}

export function revokeBarkosMemoryEntry(
  vault: BarkosMemoryVault,
  memoryId: string,
  now = Date.now()
): BarkosMemoryVault {
  const memory = vault.entries.find((entry) => entry.id === memoryId)
  if (!memory || memory.status !== 'active') {
    throw new Error('BarkOS memory entry is not active')
  }
  return nextBarkosMemoryVaultRevision(
    vault,
    {
      entries: vault.entries.map((entry) =>
        entry.id === memoryId ? { ...entry, status: 'revoked' as const, revokedAt: now } : entry
      ),
      candidates: vault.candidates
    },
    now
  )
}
