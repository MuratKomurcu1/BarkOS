import type { StateCreator } from 'zustand'
import {
  createEmptyBarkosMemoryVault,
  type BarkosMemoryVault
} from '../../../../shared/barkos/memory-vault'
import type { AppState } from '../types'

export type BarkosMemoryVaultLoadState = 'idle' | 'loading' | 'ready' | 'saving' | 'error'

export type BarkosMemoryVaultSlice = {
  barkosMemoryVault: BarkosMemoryVault | null
  barkosMemoryVaultLoadState: BarkosMemoryVaultLoadState
  barkosMemoryVaultRequestedCompanyId: string | null
  barkosMemoryVaultError: string | null
  loadBarkosMemoryVault: (companyId: string) => Promise<void>
  saveBarkosMemoryVault: (vault: BarkosMemoryVault) => Promise<BarkosMemoryVault>
  clearBarkosMemoryVaultError: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const createBarkosMemoryVaultSlice: StateCreator<
  AppState,
  [],
  [],
  BarkosMemoryVaultSlice
> = (set, get) => ({
  barkosMemoryVault: null,
  barkosMemoryVaultLoadState: 'idle',
  barkosMemoryVaultRequestedCompanyId: null,
  barkosMemoryVaultError: null,
  loadBarkosMemoryVault: async (companyId) => {
    const state = get()
    if (
      state.barkosMemoryVaultLoadState === 'loading' &&
      state.barkosMemoryVaultRequestedCompanyId === companyId
    ) {
      return
    }
    const company = state.barkosCompany
    if (!company || company.id !== companyId) {
      return
    }
    set({
      barkosMemoryVault: null,
      barkosMemoryVaultLoadState: 'loading',
      barkosMemoryVaultRequestedCompanyId: companyId,
      barkosMemoryVaultError: null
    })
    try {
      let vault = await window.api.barkosMemoryVault.load()
      if (
        get().barkosCompany?.id !== companyId ||
        get().barkosMemoryVaultRequestedCompanyId !== companyId
      ) {
        return
      }
      if (!vault) {
        const initial = createEmptyBarkosMemoryVault(companyId, company.createdAt)
        try {
          vault = await window.api.barkosMemoryVault.save(initial)
        } catch (error) {
          vault = await window.api.barkosMemoryVault.load()
          if (!vault) {
            throw error
          }
        }
      }
      if (vault.companyId !== companyId || vault.companyCreatedAt !== company.createdAt) {
        throw new Error('BarkOS memory vault does not match the active company')
      }
      set({
        barkosMemoryVault: vault,
        barkosMemoryVaultLoadState: 'ready',
        barkosMemoryVaultRequestedCompanyId: companyId,
        barkosMemoryVaultError: null
      })
    } catch (error) {
      if (
        get().barkosCompany?.id !== companyId ||
        get().barkosMemoryVaultRequestedCompanyId !== companyId
      ) {
        return
      }
      set({
        barkosMemoryVault: null,
        barkosMemoryVaultLoadState: 'error',
        barkosMemoryVaultRequestedCompanyId: companyId,
        barkosMemoryVaultError: errorMessage(error)
      })
    }
  },
  saveBarkosMemoryVault: async (vault) => {
    const company = get().barkosCompany
    if (
      !company ||
      vault.companyId !== company.id ||
      vault.companyCreatedAt !== company.createdAt
    ) {
      throw new Error('BarkOS memory vault does not match the active company')
    }
    set({ barkosMemoryVaultLoadState: 'saving', barkosMemoryVaultError: null })
    try {
      const saved = await window.api.barkosMemoryVault.save(vault)
      set({
        barkosMemoryVault: saved,
        barkosMemoryVaultLoadState: 'ready',
        barkosMemoryVaultRequestedCompanyId: company.id,
        barkosMemoryVaultError: null
      })
      return saved
    } catch (error) {
      set({ barkosMemoryVaultLoadState: 'error', barkosMemoryVaultError: errorMessage(error) })
      throw error
    }
  },
  clearBarkosMemoryVaultError: () => set({ barkosMemoryVaultError: null })
})
