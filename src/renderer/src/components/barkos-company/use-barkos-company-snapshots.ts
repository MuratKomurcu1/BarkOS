import { useEffect } from 'react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import type { BarkosCompanyLoadState } from '@/store/slices/barkos-company'
import { useAppStore } from '@/store'

export function useBarkosCompanySnapshots(
  company: BarkosCompany | null,
  companyLoadState: BarkosCompanyLoadState
) {
  const workerSessions = useAppStore((state) => state.barkosWorkerSessions)
  const workerSessionLoadState = useAppStore((state) => state.barkosWorkerSessionLoadState)
  const workerSessionRequestedCompanyId = useAppStore(
    (state) => state.barkosWorkerSessionRequestedCompanyId
  )
  const workerSessionError = useAppStore((state) => state.barkosWorkerSessionError)
  const loadWorkerSessions = useAppStore((state) => state.loadBarkosWorkerSessions)
  const clearWorkerSessionError = useAppStore((state) => state.clearBarkosWorkerSessionError)
  const controlPolicy = useAppStore((state) => state.barkosControlPolicy)
  const controlPolicyLoadState = useAppStore((state) => state.barkosControlPolicyLoadState)
  const controlPolicyRequestedCompanyId = useAppStore(
    (state) => state.barkosControlPolicyRequestedCompanyId
  )
  const controlPolicyError = useAppStore((state) => state.barkosControlPolicyError)
  const loadControlPolicy = useAppStore((state) => state.loadBarkosControlPolicy)
  const updateControlPolicy = useAppStore((state) => state.updateBarkosControlPolicySettings)
  const decisionInbox = useAppStore((state) => state.barkosDecisionInbox)
  const decisionInboxLoadState = useAppStore((state) => state.barkosDecisionInboxLoadState)
  const decisionInboxRequestedCompanyId = useAppStore(
    (state) => state.barkosDecisionInboxRequestedCompanyId
  )
  const decisionInboxError = useAppStore((state) => state.barkosDecisionInboxError)
  const loadDecisionInbox = useAppStore((state) => state.loadBarkosDecisionInbox)
  const clearDecisionInboxError = useAppStore((state) => state.clearBarkosDecisionInboxError)
  const memoryVault = useAppStore((state) => state.barkosMemoryVault)
  const memoryVaultLoadState = useAppStore((state) => state.barkosMemoryVaultLoadState)
  const memoryVaultRequestedCompanyId = useAppStore(
    (state) => state.barkosMemoryVaultRequestedCompanyId
  )
  const memoryVaultError = useAppStore((state) => state.barkosMemoryVaultError)
  const loadMemoryVault = useAppStore((state) => state.loadBarkosMemoryVault)
  const clearMemoryVaultError = useAppStore((state) => state.clearBarkosMemoryVaultError)
  const workLedger = useAppStore((state) => state.barkosWorkLedger)
  const workLedgerLoadState = useAppStore((state) => state.barkosWorkLedgerLoadState)
  const workLedgerRequestedCompanyId = useAppStore(
    (state) => state.barkosWorkLedgerRequestedCompanyId
  )
  const workLedgerError = useAppStore((state) => state.barkosWorkLedgerError)
  const loadWorkLedger = useAppStore((state) => state.loadBarkosWorkLedger)
  const reviewWorkEvidence = useAppStore((state) => state.reviewBarkosWorkEvidence)
  const createObjectivePlan = useAppStore((state) => state.createBarkosObjectivePlan)
  const clearWorkLedgerError = useAppStore((state) => state.clearBarkosWorkLedgerError)
  const providerCapacity = useAppStore((state) => state.barkosProviderCapacity)
  const providerCapacityLoadState = useAppStore((state) => state.barkosProviderCapacityLoadState)
  const providerCapacityRequestedCompanyId = useAppStore(
    (state) => state.barkosProviderCapacityRequestedCompanyId
  )
  const providerCapacityError = useAppStore((state) => state.barkosProviderCapacityError)
  const loadProviderCapacity = useAppStore((state) => state.loadBarkosProviderCapacity)

  useEffect(() => {
    if (
      company &&
      companyLoadState === 'ready' &&
      controlPolicyLoadState !== 'error' &&
      (controlPolicyLoadState === 'idle' || controlPolicyRequestedCompanyId !== company.id)
    ) {
      void loadControlPolicy(company.id)
    }
  }, [
    company,
    companyLoadState,
    controlPolicyLoadState,
    controlPolicyRequestedCompanyId,
    loadControlPolicy
  ])

  useEffect(() => {
    if (
      company &&
      companyLoadState === 'ready' &&
      memoryVaultLoadState !== 'error' &&
      (memoryVaultLoadState === 'idle' || memoryVaultRequestedCompanyId !== company.id)
    ) {
      void loadMemoryVault(company.id)
    }
  }, [
    company,
    companyLoadState,
    loadMemoryVault,
    memoryVaultLoadState,
    memoryVaultRequestedCompanyId
  ])

  useEffect(() => {
    if (
      company &&
      companyLoadState === 'ready' &&
      decisionInboxLoadState !== 'error' &&
      (decisionInboxLoadState === 'idle' || decisionInboxRequestedCompanyId !== company.id)
    ) {
      void loadDecisionInbox(company.id)
    }
  }, [
    company,
    companyLoadState,
    decisionInboxLoadState,
    decisionInboxRequestedCompanyId,
    loadDecisionInbox
  ])

  useEffect(() => {
    if (
      company &&
      companyLoadState === 'ready' &&
      workerSessionLoadState !== 'error' &&
      (workerSessionLoadState === 'idle' || workerSessionRequestedCompanyId !== company.id)
    ) {
      void loadWorkerSessions(company.id)
    }
  }, [
    company,
    companyLoadState,
    loadWorkerSessions,
    workerSessionLoadState,
    workerSessionRequestedCompanyId
  ])

  useEffect(() => {
    if (
      company &&
      companyLoadState === 'ready' &&
      workLedgerLoadState !== 'error' &&
      (workLedgerLoadState === 'idle' || workLedgerRequestedCompanyId !== company.id)
    ) {
      void loadWorkLedger(company.id)
    }
  }, [company, companyLoadState, loadWorkLedger, workLedgerLoadState, workLedgerRequestedCompanyId])

  useEffect(() => {
    if (
      company &&
      companyLoadState === 'ready' &&
      providerCapacityLoadState !== 'error' &&
      (providerCapacityLoadState === 'idle' || providerCapacityRequestedCompanyId !== company.id)
    ) {
      void loadProviderCapacity(company.id)
    }
  }, [
    company,
    companyLoadState,
    loadProviderCapacity,
    providerCapacityLoadState,
    providerCapacityRequestedCompanyId
  ])

  return {
    workerSessions,
    workerSessionError,
    loadWorkerSessions,
    clearWorkerSessionError,
    controlPolicy,
    controlPolicyLoadState,
    controlPolicyError,
    loadControlPolicy,
    updateControlPolicy,
    decisionInbox,
    decisionInboxLoadState,
    decisionInboxError,
    loadDecisionInbox,
    clearDecisionInboxError,
    memoryVault,
    memoryVaultLoadState,
    memoryVaultError,
    loadMemoryVault,
    clearMemoryVaultError,
    workLedger,
    workLedgerLoadState,
    workLedgerError,
    loadWorkLedger,
    reviewWorkEvidence,
    createObjectivePlan,
    clearWorkLedgerError,
    providerCapacity,
    providerCapacityLoadState,
    providerCapacityError
  }
}
