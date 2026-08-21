import type { BarkosCompany } from '../../../../shared/barkos/company'
import type { AppState } from '../types'

type ControlPolicyState = Pick<
  AppState,
  | 'barkosControlPolicy'
  | 'barkosControlPolicyLoadState'
  | 'barkosControlPolicyRequestedCompanyId'
  | 'barkosControlPolicyError'
>

export function emptyBarkosControlPolicyState(): ControlPolicyState {
  return {
    barkosControlPolicy: null,
    barkosControlPolicyLoadState: 'idle',
    barkosControlPolicyRequestedCompanyId: null,
    barkosControlPolicyError: null
  }
}

export function barkosControlPolicyStateForCompany(
  state: AppState,
  company: BarkosCompany | null
): ControlPolicyState {
  const policy = state.barkosControlPolicy
  if (
    !company ||
    policy?.companyId !== company.id ||
    policy.companyCreatedAt !== company.createdAt
  ) {
    return emptyBarkosControlPolicyState()
  }
  return {
    barkosControlPolicy: policy,
    barkosControlPolicyLoadState: state.barkosControlPolicyLoadState,
    barkosControlPolicyRequestedCompanyId: company.id,
    barkosControlPolicyError: null
  }
}
