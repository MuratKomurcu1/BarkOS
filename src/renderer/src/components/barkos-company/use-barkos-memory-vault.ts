import { useCallback, useEffect, useRef, useState } from 'react'
import type { BarkosCompany } from '../../../../shared/barkos/company'
import {
  promoteBarkosMemoryCandidate,
  reconcileAcceptedEvidenceMemoryCandidates,
  rejectBarkosMemoryCandidate,
  revokeBarkosMemoryEntry
} from '../../../../shared/barkos/memory-promotion'
import type { BarkosMemoryPromotionSettings } from '../../../../shared/barkos/memory-promotion'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import { useAppStore } from '@/store'

export type BarkosMemoryVaultOperation =
  | { kind: 'promote' | 'reject' | 'revoke'; id: string }
  | { kind: 'reconcile' }
  | null

export type BarkosMemoryVaultController = {
  operation: BarkosMemoryVaultOperation
  promote: (candidateId: string, settings: BarkosMemoryPromotionSettings) => Promise<void>
  reject: (candidateId: string) => Promise<void>
  revoke: (memoryId: string) => Promise<void>
  retry: () => Promise<void>
}

export function useBarkosMemoryVault(args: {
  company: BarkosCompany | null
  ledger: BarkosWorkLedger | null
}): BarkosMemoryVaultController {
  const vault = useAppStore((state) => state.barkosMemoryVault)
  const loadState = useAppStore((state) => state.barkosMemoryVaultLoadState)
  const saveVault = useAppStore((state) => state.saveBarkosMemoryVault)
  const loadVault = useAppStore((state) => state.loadBarkosMemoryVault)
  const clearError = useAppStore((state) => state.clearBarkosMemoryVaultError)
  const reconcilingRef = useRef(false)
  const [operation, setOperation] = useState<BarkosMemoryVaultOperation>(null)

  useEffect(() => {
    if (
      reconcilingRef.current ||
      loadState !== 'ready' ||
      !vault ||
      !args.company ||
      !args.ledger ||
      args.ledger.companyId !== args.company.id
    ) {
      return
    }
    const reconciled = reconcileAcceptedEvidenceMemoryCandidates({
      vault,
      company: args.company,
      ledger: args.ledger
    })
    if (reconciled === vault) {
      return
    }
    reconcilingRef.current = true
    setOperation({ kind: 'reconcile' })
    void saveVault(reconciled)
      .catch(() => {
        // The persistent store exposes reconciliation failures for explicit retry.
      })
      .finally(() => {
        reconcilingRef.current = false
        setOperation(null)
      })
  }, [args.company, args.ledger, loadState, saveVault, vault])

  const promote = useCallback(
    async (candidateId: string, settings: BarkosMemoryPromotionSettings): Promise<void> => {
      const current = useAppStore.getState().barkosMemoryVault
      if (!current) {
        throw new Error('BarkOS memory vault is not ready')
      }
      setOperation({ kind: 'promote', id: candidateId })
      try {
        await saveVault(promoteBarkosMemoryCandidate({ vault: current, candidateId, ...settings }))
      } finally {
        setOperation(null)
      }
    },
    [saveVault]
  )
  const reject = useCallback(
    async (candidateId: string): Promise<void> => {
      const current = useAppStore.getState().barkosMemoryVault
      if (!current) {
        throw new Error('BarkOS memory vault is not ready')
      }
      setOperation({ kind: 'reject', id: candidateId })
      try {
        await saveVault(rejectBarkosMemoryCandidate(current, candidateId))
      } finally {
        setOperation(null)
      }
    },
    [saveVault]
  )
  const revoke = useCallback(
    async (memoryId: string): Promise<void> => {
      const current = useAppStore.getState().barkosMemoryVault
      if (!current) {
        throw new Error('BarkOS memory vault is not ready')
      }
      setOperation({ kind: 'revoke', id: memoryId })
      try {
        await saveVault(revokeBarkosMemoryEntry(current, memoryId))
      } finally {
        setOperation(null)
      }
    },
    [saveVault]
  )
  const retry = useCallback(async (): Promise<void> => {
    if (!args.company) {
      return
    }
    clearError()
    await loadVault(args.company.id)
  }, [args.company, clearError, loadVault])

  return { operation, promote, reject, revoke, retry }
}
