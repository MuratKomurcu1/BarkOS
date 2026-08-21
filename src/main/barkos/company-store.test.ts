import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  BARKOS_COMPANY_SNAPSHOT_MAX_BYTES,
  BarkosCompanyStore,
  BarkosCompanyStoreError
} from './company-store'
import { BARKOS_COMPANY_SCHEMA_VERSION, type BarkosCompany } from '../../shared/barkos/company'

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
        capabilities: ['planning'],
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

function versionZeroCompany(): Record<string, unknown> {
  const current = company()
  return {
    ...current,
    schemaVersion: 0,
    roles: current.roles.map(({ instructions: _instructions, ...role }) => role),
    workers: current.workers.map(
      ({ preferredEnvironmentId: _environment, status: _status, ...worker }) => worker
    )
  }
}

let userDataPath: string

function captureStoreError(action: () => unknown): BarkosCompanyStoreError {
  try {
    action()
  } catch (error) {
    if (error instanceof BarkosCompanyStoreError) {
      return error
    }
    throw error
  }
  throw new Error('Expected BarkosCompanyStoreError')
}

beforeEach(() => {
  userDataPath = mkdtempSync(join(tmpdir(), 'barkos-company-store-'))
})

afterEach(() => {
  rmSync(userDataPath, { recursive: true, force: true })
})

describe('BarkOS company store', () => {
  it('returns null before the first company is saved', () => {
    expect(new BarkosCompanyStore(userDataPath).load()).toBeNull()
  })

  it('round-trips a validated company through a private local file', () => {
    const store = new BarkosCompanyStore(userDataPath)

    expect(store.save(company())).toEqual(company())
    expect(store.load()).toEqual(company())

    if (process.platform !== 'win32') {
      expect(statSync(join(userDataPath, 'barkos', 'company.json')).mode & 0o777).toBe(0o600)
    }
  })

  it('migrates a legacy snapshot and keeps a private pre-migration backup', () => {
    const store = new BarkosCompanyStore(userDataPath)
    const snapshotPath = join(userDataPath, 'barkos', 'company.json')
    store.save(company())
    writeFileSync(snapshotPath, JSON.stringify(versionZeroCompany()), 'utf8')

    expect(store.load()).toEqual(company())
    expect(JSON.parse(readFileSync(snapshotPath, 'utf8'))).toEqual(company())
    const backupPath = join(
      userDataPath,
      'barkos',
      'migration-backups',
      'company-v0-before-v1.json'
    )
    expect(JSON.parse(readFileSync(backupPath, 'utf8'))).toEqual(versionZeroCompany())
    if (process.platform !== 'win32') {
      expect(statSync(backupPath).mode & 0o777).toBe(0o600)
    }
  })

  it('rejects snapshots from a future schema version without rewriting them', () => {
    const store = new BarkosCompanyStore(userDataPath)
    const snapshotPath = join(userDataPath, 'barkos', 'company.json')
    const future = { ...company(), schemaVersion: BARKOS_COMPANY_SCHEMA_VERSION + 1 }
    store.save(company())
    writeFileSync(snapshotPath, JSON.stringify(future), 'utf8')

    expect(captureStoreError(() => store.load()).code).toBe('snapshot-version-unsupported')
    expect(JSON.parse(readFileSync(snapshotPath, 'utf8'))).toEqual(future)
  })

  it('does not replace a valid snapshot when the next value is invalid', () => {
    const store = new BarkosCompanyStore(userDataPath)
    store.save(company())

    expect(() => store.save({ ...company(), leadWorkerId: 'missing' })).toThrow()
    expect(store.load()).toEqual(company())
  })

  it('reports malformed persisted data instead of silently resetting the company', () => {
    const path = join(userDataPath, 'barkos', 'company.json')
    new BarkosCompanyStore(userDataPath).save(company())
    writeFileSync(path, '{invalid', 'utf8')

    expect(captureStoreError(() => new BarkosCompanyStore(userDataPath).load()).code).toBe(
      'snapshot-invalid'
    )
  })

  it('rejects oversized snapshots before reading them into memory', () => {
    const path = join(userDataPath, 'barkos', 'company.json')
    new BarkosCompanyStore(userDataPath).save(company())
    writeFileSync(path, 'x'.repeat(BARKOS_COMPANY_SNAPSHOT_MAX_BYTES + 1), 'utf8')

    expect(captureStoreError(() => new BarkosCompanyStore(userDataPath).load()).code).toBe(
      'snapshot-too-large'
    )
  })

  it('stores only the strict public company contract', () => {
    const store = new BarkosCompanyStore(userDataPath)
    store.save(company())

    expect(() => store.save({ ...company(), providerToken: 'secret' })).toThrow()
    expect(readFileSync(join(userDataPath, 'barkos', 'company.json'), 'utf8')).not.toContain(
      'secret'
    )
  })

  it('archives the current snapshot without deleting its contents', () => {
    const store = new BarkosCompanyStore(userDataPath)
    store.save(company())

    expect(store.archive(42)).toEqual(company())
    expect(store.load()).toBeNull()
    expect(existsSync(join(userDataPath, 'barkos', 'company.json'))).toBe(false)
    const archiveDir = join(userDataPath, 'barkos', 'archive')
    expect(readdirSync(archiveDir)).toEqual(['company-42.json'])
    expect(JSON.parse(readFileSync(join(archiveDir, 'company-42.json'), 'utf8'))).toEqual(company())
  })

  it('keeps same-millisecond archives collision safe', () => {
    const store = new BarkosCompanyStore(userDataPath)
    store.save(company())
    store.archive(42)
    store.save(company({ id: 'second-company' }))
    store.archive(42)

    expect(readdirSync(join(userDataPath, 'barkos', 'archive')).toSorted()).toEqual([
      'company-42-1.json',
      'company-42.json'
    ])
  })
})
