import { describe, expect, it } from 'vitest'
import { createBarkosCompany } from './company'
import { createEmptyBarkosMemoryVault, parseBarkosMemoryVault } from './memory-vault'
import { createBarkosBackupBundle, parseBarkosBackupImport } from './backup-bundle'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship dependable systems.',
  leadName: 'Ada',
  now: 1
})

describe('BarkOS backup bundle', () => {
  it('binds the independently versioned memory vault to the company generation', () => {
    const bundle = createBarkosBackupBundle({
      company,
      memoryVault: createEmptyBarkosMemoryVault(company.id, company.createdAt, 2),
      now: 3
    })

    expect(bundle).toMatchObject({
      kind: 'barkos-backup',
      schemaVersion: 1,
      exportedAt: 3,
      company: { id: company.id },
      memoryVault: { companyId: company.id, companyCreatedAt: company.createdAt }
    })
    expect(() =>
      createBarkosBackupBundle({
        company,
        memoryVault: createEmptyBarkosMemoryVault('other-company', 2, 2),
        now: 3
      })
    ).toThrow('does not match')
  })

  it('imports legacy company-only JSON with an empty memory vault', () => {
    const bundle = parseBarkosBackupImport(company, 4)

    expect(bundle.company).toEqual(company)
    expect(bundle.memoryVault).toMatchObject({
      companyId: company.id,
      companyCreatedAt: company.createdAt,
      entries: [],
      candidates: []
    })
  })

  it('rejects credential-like memory instead of exporting it', () => {
    const empty = createEmptyBarkosMemoryVault(company.id, company.createdAt, 2)
    const unsafe = parseBarkosMemoryVault({
      ...empty,
      candidates: [
        {
          id: 'unsafe-evidence',
          status: 'pending',
          scope: { kind: 'company', targetId: null },
          title: 'Unsafe value',
          content: 'api_key=super-secret-value',
          source: {
            kind: 'accepted-evidence',
            evidenceId: 'unsafe-evidence',
            taskId: 'unsafe-task',
            assignmentId: 'unsafe-assignment',
            dispatchId: 'unsafe-dispatch',
            workerId: company.leadWorkerId,
            roleId: company.workers[0].roleId,
            workspaceId: 'workspace-main',
            capturedAt: 2
          },
          confidence: 80,
          expiresAt: null,
          createdAt: 2,
          lastSeenAt: 2,
          resolvedAt: null,
          promotedMemoryId: null
        }
      ]
    })

    expect(() => createBarkosBackupBundle({ company, memoryVault: unsafe, now: 3 })).toThrow(
      'credential-like content'
    )
  })

  it('does not reinterpret an invalid backup envelope as legacy company JSON', () => {
    const backup = createBarkosBackupBundle({
      company,
      memoryVault: createEmptyBarkosMemoryVault(company.id, company.createdAt, 2),
      now: 3
    })

    expect(() =>
      parseBarkosBackupImport({
        ...backup,
        memoryVault: { ...backup.memoryVault, companyCreatedAt: 99 }
      })
    ).toThrow('does not match its company generation')
  })
})
