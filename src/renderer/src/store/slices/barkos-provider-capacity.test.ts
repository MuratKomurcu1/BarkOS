import { create } from 'zustand'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBarkosCompany } from '../../../../shared/barkos/company'
import { createEmptyBarkosProviderCapacityLedger } from '../../../../shared/barkos/provider-capacity-ledger'
import type { AppState } from '../types'
import { createBarkosCompanySlice } from './barkos-company'
import { createBarkosProviderCapacitySlice } from './barkos-provider-capacity'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship.',
  leadName: 'Ada',
  now: 1
})
const capacityLoad = vi.fn()
const capacitySave = vi.fn()

function createTestStore() {
  return create<AppState>()(
    (...args) =>
      ({
        ...createBarkosCompanySlice(...args),
        ...createBarkosProviderCapacitySlice(...args)
      }) as unknown as AppState
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', {
    api: { barkosProviderCapacity: { load: capacityLoad, save: capacitySave } }
  })
})

describe('BarkOS provider capacity slice', () => {
  it('loads the company generation and creates revision zero when absent', async () => {
    const initial = createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 2)
    capacityLoad.mockResolvedValue(null)
    capacitySave.mockResolvedValue(initial)
    const store = createTestStore()
    store.setState({ barkosCompany: company, barkosCompanyLoadState: 'ready' })

    await store.getState().loadBarkosProviderCapacity(company.id)

    expect(capacitySave).toHaveBeenCalledWith(expect.objectContaining({ revision: 0 }))
    expect(store.getState()).toMatchObject({
      barkosProviderCapacity: initial,
      barkosProviderCapacityLoadState: 'ready',
      barkosProviderCapacityRequestedCompanyId: company.id
    })
  })

  it('keeps the durable snapshot when a later save fails', async () => {
    const initial = createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 2)
    capacitySave.mockRejectedValue(new Error('disk-full'))
    const store = createTestStore()
    store.setState({
      barkosCompany: company,
      barkosCompanyLoadState: 'ready',
      barkosProviderCapacity: initial,
      barkosProviderCapacityLoadState: 'ready'
    })

    await expect(
      store.getState().saveBarkosProviderCapacity({ ...initial, revision: 1, updatedAt: 3 })
    ).rejects.toThrow('disk-full')
    expect(store.getState()).toMatchObject({
      barkosProviderCapacity: initial,
      barkosProviderCapacityLoadState: 'error',
      barkosProviderCapacityError: 'disk-full'
    })
  })
})
