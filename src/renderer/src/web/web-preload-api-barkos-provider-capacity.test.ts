import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBarkosCompany } from '../../../shared/barkos/company'
import {
  createEmptyBarkosProviderCapacityLedger,
  replaceBarkosProviderCapacityObservations,
  upsertBarkosProviderFailoverAudit
} from '../../../shared/barkos/provider-capacity-ledger'
import {
  appendBarkosProviderFailoverSelection,
  createBarkosProviderFailoverAudit
} from '../../../shared/barkos/provider-failover-policy'
import { installApi } from './web-preload-api-test-harness'

describe('web BarkOS provider capacity preload API', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists a versioned company-scoped ledger and enforces revisions', async () => {
    const { api, storage } = await installApi('Linux')
    const company = createBarkosCompany({
      name: 'BarkOS Web',
      mission: 'Keep capacity local.',
      leadName: 'Ada',
      now: 1
    })
    await api.barkosCompany.save(company)
    expect(await api.barkosProviderCapacity.load()).toBeNull()

    const empty = createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 2)
    await api.barkosProviderCapacity.save(empty)
    const next = replaceBarkosProviderCapacityObservations({
      ledger: empty,
      company,
      accounts: [],
      now: 3
    })
    await api.barkosProviderCapacity.save(next)

    expect(await api.barkosProviderCapacity.load()).toEqual(next)
    expect(storage.getItem(`barkos.web.provider-capacity.v1.${company.id}`)).toContain(
      '"schemaVersion":1'
    )
    await expect(api.barkosProviderCapacity.save(next)).rejects.toThrow('does not follow')
  })

  it('resets a stored ledger when the company generation changes', async () => {
    const { api } = await installApi('Linux')
    const company = createBarkosCompany({
      name: 'BarkOS Web',
      mission: 'Reset stale capacity.',
      leadName: 'Ada',
      now: 1
    })
    await api.barkosCompany.save(company)
    await api.barkosProviderCapacity.save(
      createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 2)
    )
    await api.barkosCompany.save({ ...company, createdAt: 10, updatedAt: 10 })

    expect(await api.barkosProviderCapacity.load()).toMatchObject({
      companyId: company.id,
      companyCreatedAt: 10,
      revision: 0,
      accounts: []
    })
  })

  it('freezes an interrupted selection once when the web process reloads it', async () => {
    const { api } = await installApi('Linux')
    const company = createBarkosCompany({
      name: 'BarkOS Web Recovery',
      mission: 'Recover interrupted account changes.',
      leadName: 'Ada',
      now: 1
    })
    await api.barkosCompany.save(company)
    const selected = appendBarkosProviderFailoverSelection({
      audit: createBarkosProviderFailoverAudit({
        id: 'failover-build',
        taskId: 'build-release',
        assignmentId: 'assignment-build',
        dispatchId: 'dispatch-build',
        workerId: company.leadWorkerId,
        provider: 'codex',
        executionHostId: 'local',
        runtimeLane: { kind: 'host' },
        now: 3
      }),
      account: {
        provider: 'codex',
        accountId: 'account-b',
        executionHostId: 'local',
        runtimeLane: { kind: 'host' }
      },
      conversationMode: 'unknown',
      now: 4
    })
    const persisted = upsertBarkosProviderFailoverAudit({
      ledger: createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 1),
      company,
      audit: selected,
      now: 4
    })
    await api.barkosProviderCapacity.save(persisted)

    const recovered = await api.barkosProviderCapacity.load()

    expect(recovered).toMatchObject({
      revision: persisted.revision + 1,
      failovers: [{ state: 'uncertain', stopReason: 'ambiguous-side-effect' }]
    })
    expect(await api.barkosProviderCapacity.load()).toEqual(recovered)
  })
})
