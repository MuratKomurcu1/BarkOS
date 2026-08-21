import type { BarkosTask } from './work-ledger'

const DISPATCH_APPROVAL_RISKS = new Set<BarkosTask['risk']>(['high', 'critical'])

export function barkosRiskRequiresDispatchApproval(risk: BarkosTask['risk']): boolean {
  return DISPATCH_APPROVAL_RISKS.has(risk)
}

export type BarkosTaskAuthorityReview = {
  instructionDelivery: 'exact-task-spec'
  workspacePolicy: BarkosTask['workspacePolicy']
  risk: BarkosTask['risk']
  dispatchApprovalRequired: boolean
  externalActionsRequireApproval: true
  destructiveActionsRequireApproval: true
}

export function barkosTaskRequiresDispatchApproval(task: BarkosTask): boolean {
  return task.approvalPolicy === 'before-dispatch' || barkosRiskRequiresDispatchApproval(task.risk)
}

export function reviewBarkosTaskAuthority(task: BarkosTask): BarkosTaskAuthorityReview {
  return {
    instructionDelivery: 'exact-task-spec',
    workspacePolicy: task.workspacePolicy,
    risk: task.risk,
    dispatchApprovalRequired: barkosTaskRequiresDispatchApproval(task),
    externalActionsRequireApproval: true,
    destructiveActionsRequireApproval: true
  }
}
