import { describe, expect, it } from 'vitest'
import { createBarkosCompany } from './company'
import { BarkosCompanyMigrationError, migrateBarkosCompanySnapshot } from './company-migrations'

function versionZeroSnapshot(): Record<string, unknown> {
  const company = createBarkosCompany({
    name: 'BarkOS Labs',
    mission: 'Ship dependable systems.',
    leadName: 'Ada',
    now: 1
  })
  return {
    ...company,
    schemaVersion: 0,
    roles: company.roles.map(({ instructions: _instructions, ...role }) => role),
    workers: company.workers.map(
      ({ preferredEnvironmentId: _environment, status: _status, ...worker }) => worker
    )
  }
}

describe('BarkOS company snapshot migrations', () => {
  it('migrates a strict version-zero snapshot one step to the current contract', () => {
    const result = migrateBarkosCompanySnapshot(versionZeroSnapshot())

    expect(result.migratedFromVersion).toBe(0)
    expect(result.company).toMatchObject({
      schemaVersion: 1,
      roles: [{ instructions: null }],
      workers: [{ preferredEnvironmentId: null, status: 'available' }]
    })
  })

  it('validates current snapshots without reporting a migration', () => {
    const company = createBarkosCompany({
      name: 'Current',
      mission: 'Keep the current contract.',
      leadName: 'Grace',
      now: 2
    })

    expect(migrateBarkosCompanySnapshot(company)).toEqual({
      company,
      migratedFromVersion: null
    })
  })

  it('rejects unknown legacy fields instead of carrying them into the current snapshot', () => {
    expect(() =>
      migrateBarkosCompanySnapshot({ ...versionZeroSnapshot(), providerToken: 'secret' })
    ).toThrow(BarkosCompanyMigrationError)
  })

  it('rejects future versions without attempting a downgrade', () => {
    try {
      migrateBarkosCompanySnapshot({ ...versionZeroSnapshot(), schemaVersion: 99 })
    } catch (error) {
      expect(error).toMatchObject({ code: 'unsupported-version', version: 99 })
      return
    }
    throw new Error('Expected an unsupported-version migration error')
  })
})
