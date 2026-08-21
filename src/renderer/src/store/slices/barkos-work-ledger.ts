import type { StateCreator } from 'zustand'
import {
  reviewBarkosEvidence,
  submitBarkosEvidence,
  type BarkosEvidenceCapture,
  type BarkosEvidenceDecision
} from '../../../../shared/barkos/evidence-review'
import {
  createBarkosObjectivePlan as createObjectivePlanMutation,
  type BarkosObjectivePlanInput
} from '../../../../shared/barkos/objective-planner'
import {
  assignReadyBarkosTask,
  decideBarkosDispatchGate
} from '../../../../shared/barkos/assignment-state'
import { reassignStoppedBarkosTask } from '../../../../shared/barkos/assignment-reassignment'
import {
  createEmptyBarkosWorkLedger,
  type BarkosWorkLedger
} from '../../../../shared/barkos/work-ledger'
import type { AppState } from '../types'

export type BarkosWorkLedgerLoadState = 'idle' | 'loading' | 'ready' | 'saving' | 'error'

export type BarkosEvidenceSubmission = {
  manifestId: string
  dispatchId: string
  capture: BarkosEvidenceCapture
}

export type BarkosObjectivePlanDraft = Omit<BarkosObjectivePlanInput, 'createdByWorkerId'>

export type BarkosWorkLedgerSlice = {
  barkosWorkLedger: BarkosWorkLedger | null
  barkosWorkLedgerLoadState: BarkosWorkLedgerLoadState
  barkosWorkLedgerRequestedCompanyId: string | null
  barkosWorkLedgerError: string | null
  loadBarkosWorkLedger: (companyId: string) => Promise<void>
  saveBarkosWorkLedger: (ledger: BarkosWorkLedger) => Promise<BarkosWorkLedger>
  createBarkosObjectivePlan: (draft: BarkosObjectivePlanDraft) => Promise<BarkosWorkLedger>
  assignBarkosReadyTask: (taskId: string) => Promise<BarkosWorkLedger>
  reassignBarkosStoppedTask: (dispatchId: string) => Promise<BarkosWorkLedger>
  decideBarkosWorkDispatch: (
    assignmentId: string,
    decision: 'approved' | 'rejected'
  ) => Promise<BarkosWorkLedger>
  submitBarkosWorkEvidence: (submission: BarkosEvidenceSubmission) => Promise<BarkosWorkLedger>
  reviewBarkosWorkEvidence: (
    evidenceId: string,
    decision: BarkosEvidenceDecision
  ) => Promise<BarkosWorkLedger>
  clearBarkosWorkLedgerError: () => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function requireCurrentLedger(state: AppState): BarkosWorkLedger {
  if (!state.barkosWorkLedger || state.barkosWorkLedgerLoadState !== 'ready') {
    throw new Error('BarkOS work ledger is not ready')
  }
  return state.barkosWorkLedger
}

async function requireRunningControlPolicy(get: () => AppState) {
  const company = get().barkosCompany
  if (!company) {
    throw new Error('BarkOS company is not ready')
  }
  const policy = await get().loadBarkosControlPolicy(company.id)
  if (!policy) {
    throw new Error(get().barkosControlPolicyError ?? 'BarkOS control policy is unavailable')
  }
  if (policy.executionState !== 'running') {
    throw new Error('BarkOS execution is paused; resume it before starting new work')
  }
  return policy
}

export const createBarkosWorkLedgerSlice: StateCreator<AppState, [], [], BarkosWorkLedgerSlice> = (
  set,
  get
) => ({
  barkosWorkLedger: null,
  barkosWorkLedgerLoadState: 'idle',
  barkosWorkLedgerRequestedCompanyId: null,
  barkosWorkLedgerError: null,
  loadBarkosWorkLedger: async (companyId) => {
    const state = get()
    if (
      state.barkosWorkLedgerLoadState === 'loading' &&
      state.barkosWorkLedgerRequestedCompanyId === companyId
    ) {
      return
    }
    set({
      barkosWorkLedger: null,
      barkosWorkLedgerLoadState: 'loading',
      barkosWorkLedgerRequestedCompanyId: companyId,
      barkosWorkLedgerError: null
    })
    try {
      const loaded = await window.api.barkosWorkLedger.load()
      if (
        get().barkosCompany?.id !== companyId ||
        get().barkosWorkLedgerRequestedCompanyId !== companyId
      ) {
        return
      }
      let ledger = loaded
      if (!ledger) {
        const initial = createEmptyBarkosWorkLedger(companyId)
        try {
          ledger = await window.api.barkosWorkLedger.save(initial)
        } catch (error) {
          // Another client may have created revision zero after our load. Re-read once.
          ledger = await window.api.barkosWorkLedger.load()
          if (!ledger) {
            throw error
          }
        }
      }
      if (ledger.companyId !== companyId) {
        throw new Error('BarkOS work ledger does not match the active company')
      }
      set({
        barkosWorkLedger: ledger,
        barkosWorkLedgerLoadState: 'ready',
        barkosWorkLedgerRequestedCompanyId: companyId,
        barkosWorkLedgerError: null
      })
    } catch (error) {
      if (
        get().barkosCompany?.id !== companyId ||
        get().barkosWorkLedgerRequestedCompanyId !== companyId
      ) {
        return
      }
      set({
        barkosWorkLedger: null,
        barkosWorkLedgerLoadState: 'error',
        barkosWorkLedgerRequestedCompanyId: companyId,
        barkosWorkLedgerError: errorMessage(error)
      })
    }
  },
  saveBarkosWorkLedger: async (ledger) => {
    const companyId = get().barkosCompany?.id
    if (!companyId || ledger.companyId !== companyId) {
      throw new Error('BarkOS work ledger does not match the active company')
    }
    set({ barkosWorkLedgerLoadState: 'saving', barkosWorkLedgerError: null })
    try {
      const saved = await window.api.barkosWorkLedger.save(ledger)
      set({
        barkosWorkLedger: saved,
        barkosWorkLedgerLoadState: 'ready',
        barkosWorkLedgerRequestedCompanyId: companyId,
        barkosWorkLedgerError: null
      })
      return saved
    } catch (error) {
      set({ barkosWorkLedgerLoadState: 'error', barkosWorkLedgerError: errorMessage(error) })
      throw error
    }
  },
  createBarkosObjectivePlan: async (draft) => {
    const state = get()
    const company = state.barkosCompany
    if (!company) {
      throw new Error('BarkOS company is not ready')
    }
    const next = createObjectivePlanMutation({
      ledger: requireCurrentLedger(state),
      input: { ...draft, createdByWorkerId: company.leadWorkerId },
      now: Date.now()
    })
    return get().saveBarkosWorkLedger(next)
  },
  assignBarkosReadyTask: async (taskId) => {
    const state = get()
    const company = state.barkosCompany
    if (!company) {
      throw new Error('BarkOS company is not ready')
    }
    const policy = await requireRunningControlPolicy(get)
    const result = assignReadyBarkosTask({
      ledger: requireCurrentLedger(get()),
      company,
      taskId,
      maxActiveAssignmentsPerWorker: policy.maxActiveAssignmentsPerWorker,
      now: Date.now()
    })
    return get().saveBarkosWorkLedger(result.ledger)
  },
  reassignBarkosStoppedTask: async (dispatchId) => {
    const state = get()
    const company = state.barkosCompany
    if (!company) {
      throw new Error('BarkOS company is not ready')
    }
    const policy = await requireRunningControlPolicy(get)
    const result = reassignStoppedBarkosTask({
      ledger: requireCurrentLedger(get()),
      company,
      dispatchId,
      maxActiveAssignmentsPerWorker: policy.maxActiveAssignmentsPerWorker,
      now: Date.now()
    })
    return get().saveBarkosWorkLedger(result.ledger)
  },
  decideBarkosWorkDispatch: async (assignmentId, decision) => {
    if (decision === 'approved') {
      await requireRunningControlPolicy(get)
    }
    const next = decideBarkosDispatchGate({
      ledger: requireCurrentLedger(get()),
      assignmentId,
      decision,
      resolution:
        decision === 'approved'
          ? 'User approved dispatch from the BarkOS objective board.'
          : 'User rejected dispatch from the BarkOS objective board.',
      now: Date.now()
    })
    return get().saveBarkosWorkLedger(next)
  },
  submitBarkosWorkEvidence: async (submission) => {
    const next = submitBarkosEvidence({
      ledger: requireCurrentLedger(get()),
      ...submission,
      now: Date.now()
    })
    return get().saveBarkosWorkLedger(next)
  },
  reviewBarkosWorkEvidence: async (evidenceId, decision) => {
    const next = reviewBarkosEvidence({
      ledger: requireCurrentLedger(get()),
      evidenceId,
      decision,
      now: Date.now()
    })
    return get().saveBarkosWorkLedger(next)
  },
  clearBarkosWorkLedgerError: () => set({ barkosWorkLedgerError: null })
})
