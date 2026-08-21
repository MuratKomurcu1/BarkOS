import type { StateCreator } from 'zustand'
import {
  createDefaultBarkosControlPolicy,
  parseBarkosControlPolicyForCompany,
  updateBarkosControlPolicy,
  type BarkosControlPolicy,
  type BarkosControlPolicyUpdates
} from '../../../../shared/barkos/control-policy'
import type { AppState } from '../types'

export type BarkosControlPolicyLoadState = 'idle' | 'loading' | 'ready' | 'saving' | 'error'

export type BarkosControlPolicySlice = {
  barkosControlPolicy: BarkosControlPolicy | null
  barkosControlPolicyLoadState: BarkosControlPolicyLoadState
  barkosControlPolicyRequestedCompanyId: string | null
  barkosControlPolicyError: string | null
  loadBarkosControlPolicy: (companyId: string) => Promise<BarkosControlPolicy | null>
  saveBarkosControlPolicy: (policy: BarkosControlPolicy) => Promise<BarkosControlPolicy>
  updateBarkosControlPolicySettings: (
    updates: BarkosControlPolicyUpdates
  ) => Promise<BarkosControlPolicy>
  clearBarkosControlPolicyError: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isCurrentCompanyGeneration(
  state: AppState,
  companyId: string,
  createdAt: number
): boolean {
  return state.barkosCompany?.id === companyId && state.barkosCompany.createdAt === createdAt
}

export const createBarkosControlPolicySlice: StateCreator<
  AppState,
  [],
  [],
  BarkosControlPolicySlice
> = (set, get) => ({
  barkosControlPolicy: null,
  barkosControlPolicyLoadState: 'idle',
  barkosControlPolicyRequestedCompanyId: null,
  barkosControlPolicyError: null,
  loadBarkosControlPolicy: async (companyId) => {
    const company = get().barkosCompany
    if (!company || company.id !== companyId) {
      return null
    }
    const companyCreatedAt = company.createdAt
    set({
      barkosControlPolicyLoadState: 'loading',
      barkosControlPolicyRequestedCompanyId: companyId,
      barkosControlPolicyError: null
    })
    try {
      let policy = await window.api.barkosControlPolicy.load()
      if (
        !isCurrentCompanyGeneration(get(), companyId, companyCreatedAt) ||
        get().barkosControlPolicyRequestedCompanyId !== companyId
      ) {
        return null
      }
      if (!policy) {
        const initial = createDefaultBarkosControlPolicy(company.id, company.createdAt)
        try {
          policy = await window.api.barkosControlPolicy.save(initial)
        } catch (error) {
          policy = await window.api.barkosControlPolicy.load()
          if (!policy) {
            throw error
          }
        }
      }
      const validated = parseBarkosControlPolicyForCompany(policy, company)
      set({
        barkosControlPolicy: validated,
        barkosControlPolicyLoadState: 'ready',
        barkosControlPolicyRequestedCompanyId: companyId,
        barkosControlPolicyError: null
      })
      return validated
    } catch (error) {
      if (
        isCurrentCompanyGeneration(get(), companyId, companyCreatedAt) &&
        get().barkosControlPolicyRequestedCompanyId === companyId
      ) {
        set({
          barkosControlPolicyLoadState: 'error',
          barkosControlPolicyError: errorMessage(error)
        })
      }
      return null
    }
  },
  saveBarkosControlPolicy: async (policy) => {
    const company = get().barkosCompany
    if (!company) {
      throw new Error('BarkOS company is not ready')
    }
    parseBarkosControlPolicyForCompany(policy, company)
    const durablePolicy = get().barkosControlPolicy
    set({ barkosControlPolicyLoadState: 'saving', barkosControlPolicyError: null })
    try {
      const saved = await window.api.barkosControlPolicy.save(policy)
      const validated = parseBarkosControlPolicyForCompany(saved, company)
      if (!isCurrentCompanyGeneration(get(), company.id, company.createdAt)) {
        return validated
      }
      set({
        barkosControlPolicy: validated,
        barkosControlPolicyLoadState: 'ready',
        barkosControlPolicyRequestedCompanyId: company.id,
        barkosControlPolicyError: null
      })
      return validated
    } catch (error) {
      if (isCurrentCompanyGeneration(get(), company.id, company.createdAt)) {
        set({
          barkosControlPolicy: durablePolicy,
          barkosControlPolicyLoadState: 'error',
          barkosControlPolicyError: errorMessage(error)
        })
      }
      throw error
    }
  },
  updateBarkosControlPolicySettings: async (updates) => {
    const policy = get().barkosControlPolicy
    if (!policy || get().barkosControlPolicyLoadState !== 'ready') {
      throw new Error('BarkOS control policy is not ready')
    }
    return get().saveBarkosControlPolicy(
      updateBarkosControlPolicy({ policy, updates, now: Date.now() })
    )
  },
  clearBarkosControlPolicyError: () => set({ barkosControlPolicyError: null })
})
