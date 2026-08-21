import type { BarkosDecisionInbox } from '../../shared/barkos/decision-inbox'
import type { BarkosPairedSideEffectAgent } from '../../shared/barkos/side-effect-capable-agent'

export type BarkosDecisionInboxApi = {
  load: () => Promise<BarkosDecisionInbox | null>
  save: (inbox: BarkosDecisionInbox) => Promise<BarkosDecisionInbox>
  resolveSideEffect: (
    requestId: string,
    decision: 'approved' | 'rejected'
  ) => Promise<BarkosDecisionInbox>
  preparePairedSideEffectApproval: (
    environmentId: string,
    agent: BarkosPairedSideEffectAgent
  ) => Promise<boolean>
}
