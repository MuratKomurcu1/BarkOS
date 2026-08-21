import type { BarkosControlPolicy } from '../../shared/barkos/control-policy'

export type BarkosControlPolicyApi = {
  load: () => Promise<BarkosControlPolicy | null>
  save: (policy: BarkosControlPolicy) => Promise<BarkosControlPolicy>
}
