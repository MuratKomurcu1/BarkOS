import type {
  BarkosUsageCostLedger,
  BarkosUsageCostSyncRequest
} from '../../shared/barkos/usage-cost-ledger'

export type BarkosUsageCostApi = {
  load: () => Promise<BarkosUsageCostLedger | null>
  sync: (request: BarkosUsageCostSyncRequest) => Promise<BarkosUsageCostLedger>
}
