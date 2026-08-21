import type { BarkosProviderCapacityLedger } from '../../shared/barkos/provider-capacity'

export type BarkosProviderCapacityApi = {
  load: () => Promise<BarkosProviderCapacityLedger | null>
  save: (ledger: BarkosProviderCapacityLedger) => Promise<BarkosProviderCapacityLedger>
}
