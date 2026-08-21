import type { StateCreator } from 'zustand'
import type { BarkosBackupBundle } from '../../../../shared/barkos/backup-bundle'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import type { BarkosWorkerSessionBinding } from '../../../../shared/barkos/worker-session'
import type { AppState } from '../types'
import {
  barkosControlPolicyStateForCompany,
  emptyBarkosControlPolicyState
} from './barkos-control-policy-state'
import {
  barkosProviderCapacityStateForCompany,
  emptyBarkosProviderCapacityState
} from './barkos-provider-capacity-state'

export type BarkosCompanyLoadState = 'idle' | 'loading' | 'ready' | 'saving' | 'error'
export type BarkosCompanyFileAction = 'idle' | 'archiving' | 'exporting' | 'importing'
export type BarkosWorkerSessionLoadState = 'idle' | 'loading' | 'ready' | 'saving' | 'error'

export type BarkosCompanySlice = {
  barkosCompany: BarkosCompany | null
  barkosCompanyLoadState: BarkosCompanyLoadState
  barkosCompanyFileAction: BarkosCompanyFileAction
  barkosWorkerSessions: Record<string, BarkosWorkerSessionBinding>
  barkosWorkerSessionLoadState: BarkosWorkerSessionLoadState
  barkosWorkerSessionRequestedCompanyId: string | null
  barkosWorkerSessionError: string | null
  barkosCompanyError: string | null
  loadBarkosCompany: () => Promise<void>
  saveBarkosCompany: (company: BarkosCompany) => Promise<BarkosCompany>
  archiveBarkosCompany: () => Promise<BarkosCompany | null>
  exportBarkosCompany: () => Promise<'cancelled' | 'exported'>
  pickBarkosCompanyImport: () => Promise<BarkosBackupBundle | null>
  importBarkosCompanyBackup: (backup: BarkosBackupBundle) => Promise<BarkosBackupBundle>
  loadBarkosWorkerSessions: (companyId: string) => Promise<void>
  recordBarkosWorkerSession: (binding: BarkosWorkerSessionBinding) => Promise<void>
  clearBarkosWorkerSessionError: () => void
  clearBarkosCompanyError: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export const createBarkosCompanySlice: StateCreator<AppState, [], [], BarkosCompanySlice> = (
  set,
  get
) => ({
  barkosCompany: null,
  barkosCompanyLoadState: 'idle',
  barkosCompanyFileAction: 'idle',
  barkosWorkerSessions: {},
  barkosWorkerSessionLoadState: 'idle',
  barkosWorkerSessionRequestedCompanyId: null,
  barkosWorkerSessionError: null,
  barkosCompanyError: null,
  loadBarkosCompany: async () => {
    if (get().barkosCompanyLoadState === 'loading') {
      return
    }
    set({ barkosCompanyLoadState: 'loading', barkosCompanyError: null })
    try {
      const company = await window.api.barkosCompany.load()
      set({
        barkosCompany: company,
        barkosCompanyLoadState: 'ready',
        barkosWorkerSessions: {},
        barkosWorkerSessionLoadState: 'idle',
        barkosWorkerSessionRequestedCompanyId: null,
        barkosWorkerSessionError: null,
        ...barkosControlPolicyStateForCompany(get(), company),
        barkosDecisionInbox:
          get().barkosDecisionInbox?.companyId === company?.id &&
          get().barkosDecisionInbox?.companyCreatedAt === company?.createdAt
            ? get().barkosDecisionInbox
            : null,
        barkosDecisionInboxLoadState:
          get().barkosDecisionInbox?.companyId === company?.id &&
          get().barkosDecisionInbox?.companyCreatedAt === company?.createdAt
            ? get().barkosDecisionInboxLoadState
            : 'idle',
        barkosDecisionInboxRequestedCompanyId:
          get().barkosDecisionInbox?.companyId === company?.id &&
          get().barkosDecisionInbox?.companyCreatedAt === company?.createdAt
            ? (company?.id ?? null)
            : null,
        barkosDecisionInboxError: null,
        barkosMemoryVault:
          get().barkosMemoryVault?.companyId === company?.id &&
          get().barkosMemoryVault?.companyCreatedAt === company?.createdAt
            ? get().barkosMemoryVault
            : null,
        barkosMemoryVaultLoadState:
          get().barkosMemoryVault?.companyId === company?.id &&
          get().barkosMemoryVault?.companyCreatedAt === company?.createdAt
            ? get().barkosMemoryVaultLoadState
            : 'idle',
        barkosMemoryVaultRequestedCompanyId:
          get().barkosMemoryVault?.companyId === company?.id &&
          get().barkosMemoryVault?.companyCreatedAt === company?.createdAt
            ? (company?.id ?? null)
            : null,
        barkosMemoryVaultError: null,
        barkosWorkLedger:
          get().barkosWorkLedger?.companyId === company?.id ? get().barkosWorkLedger : null,
        barkosWorkLedgerLoadState:
          get().barkosWorkLedger?.companyId === company?.id
            ? get().barkosWorkLedgerLoadState
            : 'idle',
        barkosWorkLedgerRequestedCompanyId:
          get().barkosWorkLedger?.companyId === company?.id ? (company?.id ?? null) : null,
        barkosWorkLedgerError: null,
        ...barkosProviderCapacityStateForCompany(get(), company)
      })
    } catch (error) {
      set({ barkosCompanyLoadState: 'error', barkosCompanyError: errorMessage(error) })
    }
  },
  saveBarkosCompany: async (company) => {
    set({ barkosCompanyLoadState: 'saving', barkosCompanyError: null })
    try {
      const saved = await window.api.barkosCompany.save(company)
      const currentLedger = get().barkosWorkLedger
      const preserveLedger = currentLedger?.companyId === saved.id
      const workerIds = new Set(saved.workers.map((worker) => worker.id))
      const barkosWorkerSessions = Object.fromEntries(
        Object.entries(get().barkosWorkerSessions).filter(([workerId]) => workerIds.has(workerId))
      )
      set({
        barkosCompany: saved,
        barkosCompanyLoadState: 'ready',
        barkosWorkerSessions,
        barkosWorkerSessionLoadState: 'idle',
        barkosWorkerSessionRequestedCompanyId: null,
        barkosWorkerSessionError: null,
        ...emptyBarkosControlPolicyState(),
        barkosDecisionInbox: null,
        barkosDecisionInboxLoadState: 'idle',
        barkosDecisionInboxRequestedCompanyId: null,
        barkosDecisionInboxError: null,
        barkosMemoryVault: null,
        barkosMemoryVaultLoadState: 'idle',
        barkosMemoryVaultRequestedCompanyId: null,
        barkosMemoryVaultError: null,
        barkosWorkLedger: preserveLedger ? currentLedger : null,
        barkosWorkLedgerLoadState: preserveLedger ? 'ready' : 'idle',
        barkosWorkLedgerRequestedCompanyId: preserveLedger ? saved.id : null,
        barkosWorkLedgerError: null,
        ...emptyBarkosProviderCapacityState()
      })
      return saved
    } catch (error) {
      set({ barkosCompanyLoadState: 'error', barkosCompanyError: errorMessage(error) })
      throw error
    }
  },
  archiveBarkosCompany: async () => {
    set({ barkosCompanyFileAction: 'archiving', barkosCompanyError: null })
    try {
      const archived = await window.api.barkosCompany.archive()
      set({
        barkosCompany: null,
        barkosCompanyLoadState: 'ready',
        barkosCompanyFileAction: 'idle',
        barkosWorkerSessions: {},
        barkosWorkerSessionLoadState: 'idle',
        barkosWorkerSessionRequestedCompanyId: null,
        barkosWorkerSessionError: null,
        ...emptyBarkosControlPolicyState(),
        barkosDecisionInbox: null,
        barkosDecisionInboxLoadState: 'idle',
        barkosDecisionInboxRequestedCompanyId: null,
        barkosDecisionInboxError: null,
        barkosMemoryVault: null,
        barkosMemoryVaultLoadState: 'idle',
        barkosMemoryVaultRequestedCompanyId: null,
        barkosMemoryVaultError: null,
        barkosWorkLedger: null,
        barkosWorkLedgerLoadState: 'idle',
        barkosWorkLedgerRequestedCompanyId: null,
        barkosWorkLedgerError: null,
        ...emptyBarkosProviderCapacityState()
      })
      return archived
    } catch (error) {
      set({ barkosCompanyFileAction: 'idle', barkosCompanyError: errorMessage(error) })
      throw error
    }
  },
  exportBarkosCompany: async () => {
    set({ barkosCompanyFileAction: 'exporting', barkosCompanyError: null })
    try {
      const result = await window.api.barkosCompany.exportCurrent()
      set({ barkosCompanyFileAction: 'idle' })
      return result.status
    } catch (error) {
      set({ barkosCompanyFileAction: 'idle', barkosCompanyError: errorMessage(error) })
      throw error
    }
  },
  pickBarkosCompanyImport: async () => {
    set({ barkosCompanyFileAction: 'importing', barkosCompanyError: null })
    try {
      const result = await window.api.barkosCompany.pickImport()
      set({ barkosCompanyFileAction: 'idle' })
      return result.status === 'selected' ? result.backup : null
    } catch (error) {
      set({ barkosCompanyFileAction: 'idle', barkosCompanyError: errorMessage(error) })
      throw error
    }
  },
  importBarkosCompanyBackup: async (backup) => {
    set({ barkosCompanyFileAction: 'importing', barkosCompanyError: null })
    try {
      const imported = await window.api.barkosCompany.applyImport(backup)
      set({
        barkosCompany: imported.company,
        barkosCompanyLoadState: 'ready',
        barkosCompanyFileAction: 'idle',
        barkosWorkerSessions: {},
        barkosWorkerSessionLoadState: 'idle',
        barkosWorkerSessionRequestedCompanyId: null,
        barkosWorkerSessionError: null,
        ...emptyBarkosControlPolicyState(),
        barkosDecisionInbox: null,
        barkosDecisionInboxLoadState: 'idle',
        barkosDecisionInboxRequestedCompanyId: null,
        barkosDecisionInboxError: null,
        barkosMemoryVault: imported.memoryVault,
        barkosMemoryVaultLoadState: 'ready',
        barkosMemoryVaultRequestedCompanyId: imported.company.id,
        barkosMemoryVaultError: null,
        barkosWorkLedger: null,
        barkosWorkLedgerLoadState: 'idle',
        barkosWorkLedgerRequestedCompanyId: null,
        barkosWorkLedgerError: null,
        ...emptyBarkosProviderCapacityState()
      })
      return imported
    } catch (error) {
      set({ barkosCompanyFileAction: 'idle', barkosCompanyError: errorMessage(error) })
      throw error
    }
  },
  loadBarkosWorkerSessions: async (companyId) => {
    const company = get().barkosCompany
    if (!company || company.id !== companyId) {
      return
    }
    set({
      barkosWorkerSessionLoadState: 'loading',
      barkosWorkerSessionRequestedCompanyId: companyId,
      barkosWorkerSessionError: null
    })
    try {
      const snapshot = await window.api.barkosWorkerSessions.load()
      if (get().barkosCompany?.id !== companyId) {
        return
      }
      set({
        barkosWorkerSessions: Object.fromEntries(
          (snapshot?.bindings ?? []).map((binding) => [binding.workerId, binding])
        ),
        barkosWorkerSessionLoadState: 'ready',
        barkosWorkerSessionRequestedCompanyId: companyId,
        barkosWorkerSessionError: null
      })
    } catch (error) {
      if (get().barkosCompany?.id === companyId) {
        set({
          barkosWorkerSessionLoadState: 'error',
          barkosWorkerSessionRequestedCompanyId: companyId,
          barkosWorkerSessionError: errorMessage(error)
        })
      }
    }
  },
  recordBarkosWorkerSession: async (binding) => {
    set({ barkosWorkerSessionLoadState: 'saving', barkosWorkerSessionError: null })
    try {
      const snapshot = await window.api.barkosWorkerSessions.record(binding)
      set({
        barkosWorkerSessions: Object.fromEntries(
          snapshot.bindings.map((entry) => [entry.workerId, entry])
        ),
        barkosWorkerSessionLoadState: 'ready',
        barkosWorkerSessionRequestedCompanyId: snapshot.companyId,
        barkosWorkerSessionError: null
      })
    } catch (error) {
      set((state) => ({
        barkosWorkerSessions: {
          ...state.barkosWorkerSessions,
          [binding.workerId]: binding
        },
        barkosWorkerSessionLoadState: 'error',
        barkosWorkerSessionError: errorMessage(error)
      }))
      throw error
    }
  },
  clearBarkosWorkerSessionError: () => set({ barkosWorkerSessionError: null }),
  clearBarkosCompanyError: () => set({ barkosCompanyError: null })
})
