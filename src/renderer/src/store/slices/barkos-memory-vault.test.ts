import { create } from 'zustand'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBarkosCompany } from '../../../../shared/barkos/company'
import { createEmptyBarkosMemoryVault } from '../../../../shared/barkos/memory-vault'
import type { AppState } from '../types'
import { createBarkosCompanySlice } from './barkos-company'
import { createBarkosDecisionInboxSlice } from './barkos-decision-inbox'
import { createBarkosMemoryVaultSlice } from './barkos-memory-vault'
import { createBarkosWorkLedgerSlice } from './barkos-work-ledger'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship.',
  leadName: 'Ada',
  now: 1
})
const vaultLoad = vi.fn()
const vaultSave = vi.fn()

function createTestStore() {
  return create<AppState>()(
    (...args) =>
      ({
        ...createBarkosCompanySlice(...args),
        ...createBarkosDecisionInboxSlice(...args),
        ...createBarkosMemoryVaultSlice(...args),
        ...createBarkosWorkLedgerSlice(...args)
      }) as unknown as AppState
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { api: { barkosMemoryVault: { load: vaultLoad, save: vaultSave } } })
})

describe('BarkOS memory vault slice', () => {
  it('loads the company generation and creates revision zero when absent', async () => {
    const initial = createEmptyBarkosMemoryVault(company.id, company.createdAt, 2)
    vaultLoad.mockResolvedValue(null)
    vaultSave.mockResolvedValue(initial)
    const store = createTestStore()
    store.setState({ barkosCompany: company, barkosCompanyLoadState: 'ready' })
    await store.getState().loadBarkosMemoryVault(company.id)
    expect(vaultSave).toHaveBeenCalledWith(expect.objectContaining({ revision: 0 }))
    expect(store.getState()).toMatchObject({
      barkosMemoryVault: initial,
      barkosMemoryVaultLoadState: 'ready',
      barkosMemoryVaultRequestedCompanyId: company.id
    })
  })

  it('keeps the durable snapshot when a later save fails', async () => {
    const initial = createEmptyBarkosMemoryVault(company.id, company.createdAt, 2)
    vaultSave.mockRejectedValue(new Error('disk-full'))
    const store = createTestStore()
    store.setState({
      barkosCompany: company,
      barkosCompanyLoadState: 'ready',
      barkosMemoryVault: initial,
      barkosMemoryVaultLoadState: 'ready'
    })
    await expect(
      store.getState().saveBarkosMemoryVault({ ...initial, revision: 1, updatedAt: 3 })
    ).rejects.toThrow('disk-full')
    expect(store.getState()).toMatchObject({
      barkosMemoryVault: initial,
      barkosMemoryVaultLoadState: 'error',
      barkosMemoryVaultError: 'disk-full'
    })
  })
})
