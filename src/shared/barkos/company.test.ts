import { describe, expect, it } from 'vitest'
import {
  BARKOS_COMPANY_SCHEMA_VERSION,
  addBarkosRole,
  addBarkosWorker,
  createBarkosCompany,
  parseBarkosCompany,
  safeParseBarkosCompany,
  setBarkosCompanyLead,
  updateBarkosCompanyProfile,
  updateBarkosRole,
  updateBarkosWorker,
  type BarkosCompany
} from './company'

function company(overrides: Partial<BarkosCompany> = {}): BarkosCompany {
  return {
    schemaVersion: BARKOS_COMPANY_SCHEMA_VERSION,
    id: 'barkos-labs',
    name: 'BarkOS Labs',
    mission: 'Build reliable products with evidence-backed AI workers.',
    leadWorkerId: 'ada',
    roles: [
      {
        id: 'lead',
        name: 'Lead',
        mission: 'Plan work and protect the delivery contract.',
        capabilities: ['planning', 'delegation'],
        definitionOfDone: ['Every task is settled with evidence.'],
        instructions: null
      }
    ],
    workers: [
      {
        id: 'ada',
        name: 'Ada',
        roleId: 'lead',
        agentId: 'codex',
        model: null,
        preferredEnvironmentId: null,
        workspacePolicy: 'inherit',
        status: 'available'
      }
    ],
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  }
}

describe('BarkOS company contract', () => {
  it('creates a valid first company and normalizes Turkish labels for ids', () => {
    expect(
      createBarkosCompany({
        name: 'Çözüm Şirketi',
        mission: 'Build dependable software.',
        leadName: 'Işıl Önder',
        now: 42
      })
    ).toMatchObject({
      id: 'cozum-sirketi',
      leadWorkerId: 'isil-onder',
      createdAt: 42,
      updatedAt: 42,
      workers: [{ id: 'isil-onder', roleId: 'lead', agentId: 'codex' }]
    })
  })

  it('parses a valid company snapshot', () => {
    expect(parseBarkosCompany(company())).toEqual(company())
  })

  it('rejects a worker whose role does not exist', () => {
    const value = company({
      workers: [{ ...company().workers[0], roleId: 'missing-role' }]
    })

    const result = safeParseBarkosCompany(value)

    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => issue.path.join('.') === 'workers.0.roleId')).toBe(
      true
    )
  })

  it('rejects an unknown lead worker', () => {
    const result = safeParseBarkosCompany(company({ leadWorkerId: 'missing-worker' }))

    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => issue.path.join('.') === 'leadWorkerId')).toBe(true)
  })

  it('rejects duplicate role and worker ids', () => {
    const value = company({
      roles: [...company().roles, { ...company().roles[0] }],
      workers: [...company().workers, { ...company().workers[0] }]
    })

    const result = safeParseBarkosCompany(value)

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining(['Duplicate role id: lead', 'Duplicate worker id: ada'])
    )
  })

  it('rejects timestamps that move backwards', () => {
    const result = safeParseBarkosCompany(company({ createdAt: 2, updatedAt: 1 }))

    expect(result.success).toBe(false)
    expect(result.error?.issues.some((issue) => issue.path.join('.') === 'updatedAt')).toBe(true)
  })

  it('rejects unknown fields so secrets cannot silently enter snapshots', () => {
    const result = safeParseBarkosCompany({ ...company(), providerToken: 'secret' })

    expect(result.success).toBe(false)
  })

  it('updates company profile fields without changing stable identity', () => {
    const updated = updateBarkosCompanyProfile(
      company(),
      { name: 'Renamed Labs', mission: 'A new mission.' },
      10
    )

    expect(updated).toMatchObject({
      id: 'barkos-labs',
      name: 'Renamed Labs',
      mission: 'A new mission.',
      updatedAt: 10
    })
  })

  it('adds roles and workers with collision-safe stable ids', () => {
    const withRole = addBarkosRole(
      company(),
      {
        name: 'Lead',
        mission: 'Support the company lead.',
        capabilities: ['review'],
        definitionOfDone: ['Reviews are settled.'],
        instructions: null
      },
      2
    )
    const withWorker = addBarkosWorker(
      withRole,
      {
        name: 'Ada',
        roleId: 'lead-2',
        agentId: 'claude',
        model: null,
        preferredEnvironmentId: null,
        workspacePolicy: 'folder-compatible',
        status: 'paused'
      },
      3
    )

    expect(withRole.roles.at(-1)?.id).toBe('lead-2')
    expect(withWorker.workers.at(-1)).toMatchObject({ id: 'ada-2', roleId: 'lead-2' })
  })

  it('edits role and worker contracts and promotes an existing lead', () => {
    const original = company({
      roles: [
        ...company().roles,
        {
          id: 'engineer',
          name: 'Engineer',
          mission: 'Build.',
          capabilities: ['coding'],
          definitionOfDone: ['Tests pass.'],
          instructions: null
        }
      ],
      workers: [
        ...company().workers,
        {
          id: 'grace',
          name: 'Grace',
          roleId: 'engineer',
          agentId: 'codex',
          model: null,
          preferredEnvironmentId: null,
          workspacePolicy: 'inherit',
          status: 'available'
        }
      ]
    })
    const roleUpdated = updateBarkosRole(
      original,
      'engineer',
      {
        name: 'Senior Engineer',
        mission: 'Build and review.',
        capabilities: ['coding', 'review'],
        definitionOfDone: ['Tests and review pass.'],
        instructions: 'Prefer small changes.'
      },
      2
    )
    const workerUpdated = updateBarkosWorker(
      roleUpdated,
      'grace',
      {
        name: 'Grace Hopper',
        roleId: 'engineer',
        agentId: 'codex',
        model: null,
        preferredEnvironmentId: null,
        workspacePolicy: 'inherit',
        status: 'busy'
      },
      3
    )
    const leadUpdated = setBarkosCompanyLead(workerUpdated, 'grace', 4)

    expect(leadUpdated.roles[1]).toMatchObject({ id: 'engineer', name: 'Senior Engineer' })
    expect(leadUpdated.workers[1]).toMatchObject({ id: 'grace', name: 'Grace Hopper' })
    expect(leadUpdated.leadWorkerId).toBe('grace')
  })
})
