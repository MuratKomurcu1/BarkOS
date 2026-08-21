import type { BarkosCompany } from '../../../../shared/barkos/company'
import type { AppState } from '../types'

type CapacityState = Pick<
  AppState,
  | 'barkosProviderCapacity'
  | 'barkosProviderCapacityLoadState'
  | 'barkosProviderCapacityRequestedCompanyId'
  | 'barkosProviderCapacityError'
>

export function emptyBarkosProviderCapacityState(): CapacityState {
  return {
    barkosProviderCapacity: null,
    barkosProviderCapacityLoadState: 'idle',
    barkosProviderCapacityRequestedCompanyId: null,
    barkosProviderCapacityError: null
  }
}

export function barkosProviderCapacityStateForCompany(
  state: AppState,
  company: BarkosCompany | null
): CapacityState {
  const ledger = state.barkosProviderCapacity
  if (
    !company ||
    ledger?.companyId !== company.id ||
    ledger.companyCreatedAt !== company.createdAt
  ) {
    return emptyBarkosProviderCapacityState()
  }
  return {
    barkosProviderCapacity: ledger,
    barkosProviderCapacityLoadState: state.barkosProviderCapacityLoadState,
    barkosProviderCapacityRequestedCompanyId: company.id,
    barkosProviderCapacityError: null
  }
}
