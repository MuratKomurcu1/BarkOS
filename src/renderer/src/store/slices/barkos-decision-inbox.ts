import type { StateCreator } from 'zustand'
import {
  createEmptyBarkosDecisionInbox,
  type BarkosDecisionInbox
} from '../../../../shared/barkos/decision-inbox'
import type { AppState } from '../types'

export type BarkosDecisionInboxLoadState = 'idle' | 'loading' | 'ready' | 'saving' | 'error'

export type BarkosDecisionInboxSlice = {
  barkosDecisionInbox: BarkosDecisionInbox | null
  barkosDecisionInboxLoadState: BarkosDecisionInboxLoadState
  barkosDecisionInboxRequestedCompanyId: string | null
  barkosDecisionInboxError: string | null
  loadBarkosDecisionInbox: (companyId: string) => Promise<void>
  syncBarkosDecisionInbox: (companyId: string) => Promise<BarkosDecisionInbox | null>
  saveBarkosDecisionInbox: (inbox: BarkosDecisionInbox) => Promise<BarkosDecisionInbox>
  resolveBarkosSideEffectApproval: (
    requestId: string,
    decision: 'approved' | 'rejected'
  ) => Promise<BarkosDecisionInbox>
  clearBarkosDecisionInboxError: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const createBarkosDecisionInboxSlice: StateCreator<
  AppState,
  [],
  [],
  BarkosDecisionInboxSlice
> = (set, get) => ({
  barkosDecisionInbox: null,
  barkosDecisionInboxLoadState: 'idle',
  barkosDecisionInboxRequestedCompanyId: null,
  barkosDecisionInboxError: null,
  loadBarkosDecisionInbox: async (companyId) => {
    const state = get()
    if (
      state.barkosDecisionInboxLoadState === 'loading' &&
      state.barkosDecisionInboxRequestedCompanyId === companyId
    ) {
      return
    }
    const company = state.barkosCompany
    if (!company || company.id !== companyId) {
      return
    }
    set({
      barkosDecisionInbox: null,
      barkosDecisionInboxLoadState: 'loading',
      barkosDecisionInboxRequestedCompanyId: companyId,
      barkosDecisionInboxError: null
    })
    try {
      const loaded = await window.api.barkosDecisionInbox.load()
      if (
        get().barkosCompany?.id !== companyId ||
        get().barkosDecisionInboxRequestedCompanyId !== companyId
      ) {
        return
      }
      let inbox = loaded
      if (!inbox) {
        const initial = createEmptyBarkosDecisionInbox(companyId, company.createdAt)
        try {
          inbox = await window.api.barkosDecisionInbox.save(initial)
        } catch (error) {
          inbox = await window.api.barkosDecisionInbox.load()
          if (!inbox) {
            throw error
          }
        }
      }
      if (inbox.companyId !== companyId || inbox.companyCreatedAt !== company.createdAt) {
        throw new Error('BarkOS decision inbox does not match the active company')
      }
      set({
        barkosDecisionInbox: inbox,
        barkosDecisionInboxLoadState: 'ready',
        barkosDecisionInboxRequestedCompanyId: companyId,
        barkosDecisionInboxError: null
      })
    } catch (error) {
      if (
        get().barkosCompany?.id !== companyId ||
        get().barkosDecisionInboxRequestedCompanyId !== companyId
      ) {
        return
      }
      set({
        barkosDecisionInbox: null,
        barkosDecisionInboxLoadState: 'error',
        barkosDecisionInboxRequestedCompanyId: companyId,
        barkosDecisionInboxError: errorMessage(error)
      })
    }
  },
  syncBarkosDecisionInbox: async (companyId) => {
    const company = get().barkosCompany
    if (!company || company.id !== companyId) {
      return null
    }
    const inbox = await window.api.barkosDecisionInbox.load()
    if (!inbox) {
      return null
    }
    if (inbox.companyId !== company.id || inbox.companyCreatedAt !== company.createdAt) {
      throw new Error('BarkOS decision inbox does not match the active company')
    }
    if (get().barkosCompany?.id === companyId) {
      set({ barkosDecisionInbox: inbox, barkosDecisionInboxError: null })
    }
    return inbox
  },
  saveBarkosDecisionInbox: async (inbox) => {
    const company = get().barkosCompany
    if (
      !company ||
      inbox.companyId !== company.id ||
      inbox.companyCreatedAt !== company.createdAt
    ) {
      throw new Error('BarkOS decision inbox does not match the active company')
    }
    set({ barkosDecisionInboxLoadState: 'saving', barkosDecisionInboxError: null })
    try {
      const saved = await window.api.barkosDecisionInbox.save(inbox)
      set({
        barkosDecisionInbox: saved,
        barkosDecisionInboxLoadState: 'ready',
        barkosDecisionInboxRequestedCompanyId: company.id,
        barkosDecisionInboxError: null
      })
      return saved
    } catch (error) {
      set({
        barkosDecisionInboxLoadState: 'error',
        barkosDecisionInboxError: errorMessage(error)
      })
      throw error
    }
  },
  resolveBarkosSideEffectApproval: async (requestId, decision) => {
    const company = get().barkosCompany
    if (!company) {
      throw new Error('BarkOS company is not ready')
    }
    const inbox = await window.api.barkosDecisionInbox.resolveSideEffect(requestId, decision)
    if (inbox.companyId !== company.id || inbox.companyCreatedAt !== company.createdAt) {
      throw new Error('BarkOS decision inbox does not match the active company')
    }
    set({
      barkosDecisionInbox: inbox,
      barkosDecisionInboxLoadState: 'ready',
      barkosDecisionInboxRequestedCompanyId: company.id,
      barkosDecisionInboxError: null
    })
    return inbox
  },
  clearBarkosDecisionInboxError: () => set({ barkosDecisionInboxError: null })
})
