import type { StateCreator } from 'zustand'
import type { BarkosProviderCapacityLedger } from '../../../../shared/barkos/provider-capacity'
import { createEmptyBarkosProviderCapacityLedger } from '../../../../shared/barkos/provider-capacity-ledger'
import type { AppState } from '../types'

export type BarkosProviderCapacityLoadState = 'idle' | 'loading' | 'ready' | 'saving' | 'error'

export type BarkosProviderCapacitySlice = {
  barkosProviderCapacity: BarkosProviderCapacityLedger | null
  barkosProviderCapacityLoadState: BarkosProviderCapacityLoadState
  barkosProviderCapacityRequestedCompanyId: string | null
  barkosProviderCapacityError: string | null
  loadBarkosProviderCapacity: (companyId: string) => Promise<void>
  saveBarkosProviderCapacity: (
    ledger: BarkosProviderCapacityLedger
  ) => Promise<BarkosProviderCapacityLedger>
  clearBarkosProviderCapacityError: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const createBarkosProviderCapacitySlice: StateCreator<
  AppState,
  [],
  [],
  BarkosProviderCapacitySlice
> = (set, get) => ({
  barkosProviderCapacity: null,
  barkosProviderCapacityLoadState: 'idle',
  barkosProviderCapacityRequestedCompanyId: null,
  barkosProviderCapacityError: null,
  loadBarkosProviderCapacity: async (companyId) => {
    const state = get()
    if (
      state.barkosProviderCapacityLoadState === 'loading' &&
      state.barkosProviderCapacityRequestedCompanyId === companyId
    ) {
      return
    }
    const company = state.barkosCompany
    if (!company || company.id !== companyId) {
      return
    }
    set({
      barkosProviderCapacity: null,
      barkosProviderCapacityLoadState: 'loading',
      barkosProviderCapacityRequestedCompanyId: companyId,
      barkosProviderCapacityError: null
    })
    try {
      const loaded = await window.api.barkosProviderCapacity.load()
      if (
        get().barkosCompany?.id !== companyId ||
        get().barkosProviderCapacityRequestedCompanyId !== companyId
      ) {
        return
      }
      let ledger = loaded
      if (!ledger) {
        const initial = createEmptyBarkosProviderCapacityLedger(companyId, company.createdAt)
        try {
          ledger = await window.api.barkosProviderCapacity.save(initial)
        } catch (error) {
          ledger = await window.api.barkosProviderCapacity.load()
          if (!ledger) {
            throw error
          }
        }
      }
      if (ledger.companyId !== companyId || ledger.companyCreatedAt !== company.createdAt) {
        throw new Error('BarkOS provider capacity does not match the active company')
      }
      set({
        barkosProviderCapacity: ledger,
        barkosProviderCapacityLoadState: 'ready',
        barkosProviderCapacityRequestedCompanyId: companyId,
        barkosProviderCapacityError: null
      })
    } catch (error) {
      if (
        get().barkosCompany?.id !== companyId ||
        get().barkosProviderCapacityRequestedCompanyId !== companyId
      ) {
        return
      }
      set({
        barkosProviderCapacity: null,
        barkosProviderCapacityLoadState: 'error',
        barkosProviderCapacityRequestedCompanyId: companyId,
        barkosProviderCapacityError: errorMessage(error)
      })
    }
  },
  saveBarkosProviderCapacity: async (ledger) => {
    const company = get().barkosCompany
    if (
      !company ||
      ledger.companyId !== company.id ||
      ledger.companyCreatedAt !== company.createdAt
    ) {
      throw new Error('BarkOS provider capacity does not match the active company')
    }
    const durableLedger = get().barkosProviderCapacity
    set({ barkosProviderCapacityLoadState: 'saving', barkosProviderCapacityError: null })
    try {
      const saved = await window.api.barkosProviderCapacity.save(ledger)
      set({
        barkosProviderCapacity: saved,
        barkosProviderCapacityLoadState: 'ready',
        barkosProviderCapacityRequestedCompanyId: company.id,
        barkosProviderCapacityError: null
      })
      return saved
    } catch (error) {
      set({
        barkosProviderCapacity: durableLedger,
        barkosProviderCapacityLoadState: 'error',
        barkosProviderCapacityError: errorMessage(error)
      })
      throw error
    }
  },
  clearBarkosProviderCapacityError: () => set({ barkosProviderCapacityError: null })
})
