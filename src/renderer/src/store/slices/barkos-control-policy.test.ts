import { create } from 'zustand'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBarkosCompany } from '../../../../shared/barkos/company'
import {
  createDefaultBarkosControlPolicy,
  updateBarkosControlPolicy,
  type BarkosControlPolicy
} from '../../../../shared/barkos/control-policy'
import type { AppState } from '../types'
import { createBarkosCompanySlice } from './barkos-company'
import { createBarkosControlPolicySlice } from './barkos-control-policy'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship reliable work.',
  leadName: 'Ada',
  now: 1
})
const companyLoad = vi.fn()
const policyLoad = vi.fn()
const policySave = vi.fn()

function createTestStore() {
  return create<AppState>()(
    (...args) =>
      ({
        ...createBarkosCompanySlice(...args),
        ...createBarkosControlPolicySlice(...args)
      }) as unknown as AppState
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
  policyLoad.mockReset()
  policySave.mockReset()
  vi.stubGlobal('window', {
    api: {
      barkosCompany: { load: companyLoad },
      barkosControlPolicy: { load: policyLoad, save: policySave }
    }
  })
})

describe('BarkOS control policy slice', () => {
  it('creates safe defaults when no durable policy exists', async () => {
    policyLoad.mockResolvedValue(null)
    policySave.mockImplementation(async (value: BarkosControlPolicy) => value)
    const store = createTestStore()
    store.setState({ barkosCompany: company, barkosCompanyLoadState: 'ready' })

    const loaded = await store.getState().loadBarkosControlPolicy(company.id)

    expect(policySave).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: company.id,
        companyCreatedAt: company.createdAt,
        executionState: 'running',
        revision: 0
      })
    )
    expect(loaded).toEqual(store.getState().barkosControlPolicy)
    expect(store.getState().barkosControlPolicyLoadState).toBe('ready')
  })

  it('re-reads when another client creates revision zero first', async () => {
    const raced = createDefaultBarkosControlPolicy(company.id, company.createdAt, 2)
    policyLoad.mockResolvedValueOnce(null).mockResolvedValueOnce(raced)
    policySave.mockRejectedValue(new Error('revision-conflict'))
    const store = createTestStore()
    store.setState({ barkosCompany: company, barkosCompanyLoadState: 'ready' })

    expect(await store.getState().loadBarkosControlPolicy(company.id)).toEqual(raced)
    expect(store.getState()).toMatchObject({
      barkosControlPolicy: raced,
      barkosControlPolicyLoadState: 'ready',
      barkosControlPolicyError: null
    })
  })

  it('keeps the durable policy visible when an update fails', async () => {
    const initial = createDefaultBarkosControlPolicy(company.id, company.createdAt, 2)
    policySave.mockRejectedValue(new Error('disk-full'))
    const store = createTestStore()
    store.setState({
      barkosCompany: company,
      barkosCompanyLoadState: 'ready',
      barkosControlPolicy: initial,
      barkosControlPolicyLoadState: 'ready'
    })

    await expect(
      store.getState().updateBarkosControlPolicySettings({
        executionState: 'paused',
        maxConcurrentDispatches: 4,
        maxActiveAssignmentsPerWorker: 2,
        maxDispatchesPerObjective: 100
      })
    ).rejects.toThrow('disk-full')
    expect(store.getState()).toMatchObject({
      barkosControlPolicy: initial,
      barkosControlPolicyLoadState: 'error',
      barkosControlPolicyError: 'disk-full'
    })
  })

  it('rejects a policy from another company generation', async () => {
    const stale = createDefaultBarkosControlPolicy(company.id, company.createdAt + 1, 2)
    policyLoad.mockResolvedValue(stale)
    const store = createTestStore()
    store.setState({ barkosCompany: company, barkosCompanyLoadState: 'ready' })

    expect(await store.getState().loadBarkosControlPolicy(company.id)).toBeNull()
    expect(store.getState()).toMatchObject({
      barkosControlPolicy: null,
      barkosControlPolicyLoadState: 'error',
      barkosControlPolicyError: expect.stringContaining('active company generation')
    })
  })

  it('drops a load that settles after the company generation changes', async () => {
    let resolveLoad: ((policy: BarkosControlPolicy) => void) | undefined
    policyLoad.mockImplementation(
      () =>
        new Promise<BarkosControlPolicy>((resolve) => {
          resolveLoad = resolve
        })
    )
    const store = createTestStore()
    store.setState({ barkosCompany: company, barkosCompanyLoadState: 'ready' })

    const load = store.getState().loadBarkosControlPolicy(company.id)
    store.setState({
      barkosCompany: {
        ...company,
        createdAt: company.createdAt + 1,
        updatedAt: company.updatedAt + 1
      },
      barkosControlPolicy: null,
      barkosControlPolicyLoadState: 'idle'
    })
    resolveLoad?.(createDefaultBarkosControlPolicy(company.id, company.createdAt, 2))

    await expect(load).resolves.toBeNull()
    expect(store.getState()).toMatchObject({
      barkosControlPolicy: null,
      barkosControlPolicyLoadState: 'idle'
    })
  })

  it('persists monotonic user updates', async () => {
    const initial = createDefaultBarkosControlPolicy(company.id, company.createdAt, 2)
    const expected = updateBarkosControlPolicy({
      policy: initial,
      updates: {
        executionState: 'paused',
        maxConcurrentDispatches: 3,
        maxActiveAssignmentsPerWorker: 1,
        maxDispatchesPerObjective: 50
      },
      now: initial.updatedAt + 1
    })
    policySave.mockImplementation(async (value: BarkosControlPolicy) => value)
    const store = createTestStore()
    store.setState({
      barkosCompany: company,
      barkosCompanyLoadState: 'ready',
      barkosControlPolicy: initial,
      barkosControlPolicyLoadState: 'ready'
    })

    const saved = await store.getState().updateBarkosControlPolicySettings({
      executionState: 'paused',
      maxConcurrentDispatches: 3,
      maxActiveAssignmentsPerWorker: 1,
      maxDispatchesPerObjective: 50
    })

    expect(saved).toMatchObject({
      ...expected,
      updatedAt: expect.any(Number)
    })
    expect(saved.revision).toBe(1)
  })
})
