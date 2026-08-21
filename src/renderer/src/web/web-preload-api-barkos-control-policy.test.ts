import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBarkosCompany } from '../../../shared/barkos/company'
import {
  createDefaultBarkosControlPolicy,
  updateBarkosControlPolicy
} from '../../../shared/barkos/control-policy'
import { installApi } from './web-preload-api-test-harness'

describe('web BarkOS control policy preload API', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persists a company-generation policy and enforces revisions', async () => {
    const { api, storage } = await installApi('Linux')
    const company = createBarkosCompany({
      name: 'BarkOS Web',
      mission: 'Keep control local.',
      leadName: 'Ada',
      now: 1
    })
    await api.barkosCompany.save(company)
    expect(await api.barkosControlPolicy.load()).toBeNull()

    const initial = createDefaultBarkosControlPolicy(company.id, company.createdAt, 2)
    await api.barkosControlPolicy.save(initial)
    const updated = updateBarkosControlPolicy({
      policy: initial,
      updates: {
        executionState: 'paused',
        maxConcurrentDispatches: 3,
        maxActiveAssignmentsPerWorker: 1,
        maxDispatchesPerObjective: 50
      },
      now: 3
    })
    await api.barkosControlPolicy.save(updated)

    expect(await api.barkosControlPolicy.load()).toEqual(updated)
    expect(storage.getItem(`barkos.web.control-policy.v1.${company.id}`)).toContain(
      '"executionState":"paused"'
    )
    await expect(api.barkosControlPolicy.save(updated)).rejects.toThrow('does not follow')
  })

  it('resets a stale company generation to safe defaults', async () => {
    const { api } = await installApi('Linux')
    const company = createBarkosCompany({
      name: 'BarkOS Web',
      mission: 'Reset stale control state.',
      leadName: 'Ada',
      now: 1
    })
    await api.barkosCompany.save(company)
    await api.barkosControlPolicy.save(
      createDefaultBarkosControlPolicy(company.id, company.createdAt, 2)
    )
    await api.barkosCompany.save({ ...company, createdAt: 10, updatedAt: 10 })

    expect(await api.barkosControlPolicy.load()).toMatchObject({
      companyCreatedAt: 10,
      executionState: 'running',
      revision: 0
    })
  })
})
