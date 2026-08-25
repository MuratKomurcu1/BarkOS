import { describe, expect, it } from 'vitest'
import { createBarkosCompany } from './company'
import { selectBarkosMemoryContext } from './memory-context'
import {
  promoteBarkosMemoryCandidate,
  reconcileAcceptedEvidenceMemoryCandidates,
  rejectBarkosMemoryCandidate,
  revokeBarkosMemoryEntry
} from './memory-promotion'
import { createEmptyBarkosMemoryVault, parseBarkosMemoryVault } from './memory-vault'
import { parseBarkosWorkLedger, type BarkosWorkLedger } from './work-ledger'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship reliable systems.',
  leadName: 'Ada',
  now: 1
})

function acceptedLedger(): BarkosWorkLedger {
  return parseBarkosWorkLedger({
    schemaVersion: 5,
    companyId: company.id,
    objectives: [
      {
        id: 'ship-release',
        companyId: company.id,
        title: 'Ship release',
        brief: 'Build it.',
        status: 'completed',
        activePlanId: 'release-plan',
        orchestrationBinding: { runId: 'run-release', runtimeEnvironmentId: null },
        createdByWorkerId: 'ada',
        createdAt: 1,
        updatedAt: 8
      }
    ],
    plans: [
      {
        id: 'release-plan',
        objectiveId: 'ship-release',
        version: 1,
        status: 'completed',
        createdByWorkerId: 'ada',
        createdAt: 2,
        approvedAt: 2,
        tasks: [
          {
            id: 'build-release',
            objectiveId: 'ship-release',
            planId: 'release-plan',
            title: 'Build release',
            spec: 'Implement the release.',
            requiredCapabilities: [],
            dependencyIds: [],
            status: 'completed',
            workspacePolicy: 'worktree',
            preferredEnvironmentId: null,
            risk: 'medium',
            approvalPolicy: 'none',
            orchestrationTaskId: 'orca-task-release',
            createdAt: 2,
            updatedAt: 8
          }
        ]
      }
    ],
    assignments: [
      {
        id: 'build-assignment',
        taskId: 'build-release',
        workerId: 'ada',
        status: 'completed',
        reason: 'Ada owns delivery.',
        matchedCapabilities: [],
        activeLoadAtAssignment: 0,
        assignedAt: 3,
        approvedAt: 3
      }
    ],
    dispatches: [
      {
        id: 'build-dispatch',
        assignmentId: 'build-assignment',
        taskId: 'build-release',
        workerId: 'ada',
        attempt: 1,
        state: 'succeeded',
        workspaceId: 'workspace-a',
        executionHostId: 'local',
        orchestrationRunId: 'run-release',
        orchestrationTaskId: 'orca-task-release',
        orchestrationDispatchId: 'orca-dispatch-release',
        memoryDelivery: null,
        stop: null,
        error: null,
        createdAt: 4,
        startedAt: 4,
        finishedAt: 7
      }
    ],
    evidence: [
      {
        id: 'build-evidence',
        taskId: 'build-release',
        assignmentId: 'build-assignment',
        dispatchId: 'build-dispatch',
        status: 'accepted',
        tests: [
          { command: 'pnpm test', status: 'passed', summary: 'All tests passed.', durationMs: 10 }
        ],
        changedFiles: [{ path: 'src/app.ts', change: 'modified', summary: null }],
        diffSummary: 'Added the release guard.',
        terminalExcerpts: [],
        screenshots: [],
        risks: [],
        unresolvedDecisions: [],
        producedAt: 7,
        reviewedAt: 8
      }
    ],
    approvalGates: [],
    revision: 1,
    createdAt: 1,
    updatedAt: 8
  })
}

function candidateVault() {
  return reconcileAcceptedEvidenceMemoryCandidates({
    vault: createEmptyBarkosMemoryVault(company.id, company.createdAt, 1),
    company,
    ledger: acceptedLedger(),
    now: 9
  })
}

describe('BarkOS memory vault', () => {
  it('creates one idempotent project-scoped candidate from accepted evidence', () => {
    const vault = candidateVault()
    expect(vault.candidates).toHaveLength(1)
    expect(vault.candidates[0]).toMatchObject({
      id: 'build-evidence',
      status: 'pending',
      scope: { kind: 'project', targetId: 'workspace-a' },
      source: { evidenceId: 'build-evidence', taskId: 'build-release', workerId: 'ada' }
    })
    expect(
      reconcileAcceptedEvidenceMemoryCandidates({
        vault,
        company,
        ledger: acceptedLedger(),
        now: 10
      })
    ).toBe(vault)
  })

  it('does not copy credential-like evidence text into a proposal', () => {
    const ledger = acceptedLedger()
    ledger.evidence[0].diffSummary = 'api_key=super-secret-value'
    const vault = reconcileAcceptedEvidenceMemoryCandidates({
      vault: createEmptyBarkosMemoryVault(company.id, company.createdAt, 1),
      company,
      ledger,
      now: 9
    })
    expect(vault.candidates[0].content).not.toContain('super-secret-value')
    expect(vault.candidates[0].content).toContain('Credential-like evidence text was omitted')
  })

  it('requires explicit promotion and preserves rejection audit', () => {
    const promoted = promoteBarkosMemoryCandidate({
      vault: candidateVault(),
      candidateId: 'build-evidence',
      now: 10
    })
    expect(promoted.entries[0]).toMatchObject({ status: 'active', promotedBy: 'user' })
    expect(promoted.candidates[0]).toMatchObject({
      status: 'promoted',
      promotedMemoryId: 'build-evidence'
    })

    const rejected = rejectBarkosMemoryCandidate(candidateVault(), 'build-evidence', 11)
    expect(rejected.candidates[0]).toMatchObject({ status: 'rejected', resolvedAt: 11 })
  })

  it('promotes reviewed scope, confidence, and expiry only within evidence provenance', () => {
    const promoted = promoteBarkosMemoryCandidate({
      vault: candidateVault(),
      candidateId: 'build-evidence',
      scope: { kind: 'task', targetId: 'build-release' },
      confidence: 65,
      expiresAt: 100,
      contradictsMemoryIds: [],
      now: 10
    })

    expect(promoted.entries[0]).toMatchObject({
      scope: { kind: 'task', targetId: 'build-release' },
      confidence: 65,
      expiresAt: 100
    })
    expect(promoted.candidates[0]).toMatchObject({
      scope: { kind: 'task', targetId: 'build-release' },
      confidence: 65,
      expiresAt: 100
    })
    expect(() =>
      promoteBarkosMemoryCandidate({
        vault: candidateVault(),
        candidateId: 'build-evidence',
        scope: { kind: 'task', targetId: 'another-task' },
        now: 10
      })
    ).toThrow('must match the accepted evidence provenance')
  })

  it('injects only relevant, active, unexpired, non-sensitive memory within budget', () => {
    const promoted = promoteBarkosMemoryCandidate({
      vault: candidateVault(),
      candidateId: 'build-evidence',
      now: 10
    })
    const selection = selectBarkosMemoryContext({
      vault: promoted,
      company,
      worker: company.workers[0],
      workspaceId: 'workspace-a',
      now: 11
    })
    expect(selection.selectedMemoryIds).toEqual(['build-evidence'])
    expect(selection.text).toContain('reference only')
    expect(
      selectBarkosMemoryContext({
        vault: promoted,
        company,
        worker: company.workers[0],
        workspaceId: 'workspace-b',
        now: 11
      }).text
    ).toBeNull()

    const sensitive = parseBarkosMemoryVault({
      ...promoted,
      entries: [{ ...promoted.entries[0], content: 'api_key=super-secret-value' }]
    })
    expect(
      selectBarkosMemoryContext({
        vault: sensitive,
        company,
        worker: company.workers[0],
        workspaceId: 'workspace-a',
        now: 11
      })
    ).toMatchObject({ text: null, omittedSensitive: 1 })
  })

  it('aynı kapsamdaki hafızayı görev metnine göre sıralar', () => {
    const promoted = promoteBarkosMemoryCandidate({
      vault: candidateVault(),
      candidateId: 'build-evidence',
      now: 10
    })
    const second = {
      ...promoted.entries[0],
      id: 'database-memory',
      title: 'Veritabanı geçişi',
      content: 'PostgreSQL şema geçişinde transaction kullan.',
      confidence: 60,
      promotedAt: 9
    }
    const first = {
      ...promoted.entries[0],
      title: 'Arayüz kuralı',
      content: 'React bileşenlerinde erişilebilir etiketleri koru.',
      confidence: 95
    }
    const selection = selectBarkosMemoryContext({
      vault: parseBarkosMemoryVault({ ...promoted, entries: [first, second] }),
      company,
      worker: company.workers[0],
      workspaceId: 'workspace-a',
      query: 'PostgreSQL veritabanı şemasını güncelle',
      now: 11
    })

    expect(selection.selectedMemoryIds).toEqual(['database-memory', 'build-evidence'])
  })

  it('revokes active memory without deleting its provenance', () => {
    const promoted = promoteBarkosMemoryCandidate({
      vault: candidateVault(),
      candidateId: 'build-evidence',
      now: 10
    })
    const revoked = revokeBarkosMemoryEntry(promoted, 'build-evidence', 12)
    expect(revoked.entries[0]).toMatchObject({ status: 'revoked', revokedAt: 12 })
    expect(revoked.entries[0].source.evidenceId).toBe('build-evidence')
  })

  it('supersedes an explicit same-scope contradiction and excludes expired memory', () => {
    const first = promoteBarkosMemoryCandidate({
      vault: candidateVault(),
      candidateId: 'build-evidence',
      now: 10
    })
    const secondCandidate = {
      ...first.candidates[0],
      id: 'replacement-evidence',
      status: 'pending' as const,
      source: { ...first.candidates[0].source, evidenceId: 'replacement-evidence' },
      createdAt: 11,
      lastSeenAt: 11,
      resolvedAt: null,
      promotedMemoryId: null
    }
    const withContradiction = parseBarkosMemoryVault({
      ...first,
      candidates: [...first.candidates, secondCandidate]
    })
    const replaced = promoteBarkosMemoryCandidate({
      vault: withContradiction,
      candidateId: secondCandidate.id,
      contradictsMemoryIds: ['build-evidence'],
      now: 12
    })
    expect(replaced.entries).toEqual([
      expect.objectContaining({
        id: 'build-evidence',
        status: 'superseded',
        supersededByMemoryId: 'replacement-evidence'
      }),
      expect.objectContaining({
        id: 'replacement-evidence',
        status: 'active',
        contradictsMemoryIds: ['build-evidence']
      })
    ])

    const expired = parseBarkosMemoryVault({
      ...first,
      entries: [{ ...first.entries[0], expiresAt: 12 }]
    })
    expect(
      selectBarkosMemoryContext({
        vault: expired,
        company,
        worker: company.workers[0],
        workspaceId: 'workspace-a',
        now: 12
      })
    ).toMatchObject({ text: null, omittedExpired: 1 })
  })
})
