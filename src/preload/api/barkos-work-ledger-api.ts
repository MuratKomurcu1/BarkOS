import type { BarkosWorkLedger } from '../../shared/barkos/work-ledger'
import type { BarkosEvidenceScreenshotSelection } from '../../shared/barkos/evidence-screenshot'
import type {
  BarkosTestEvidenceRunRequest,
  BarkosTestEvidenceRunResult
} from '../../shared/barkos/test-evidence-run'

export type BarkosWorkLedgerApi = {
  load: () => Promise<BarkosWorkLedger | null>
  save: (ledger: BarkosWorkLedger) => Promise<BarkosWorkLedger>
  pickScreenshot: () => Promise<BarkosEvidenceScreenshotSelection | null>
  runTest: (request: BarkosTestEvidenceRunRequest) => Promise<BarkosTestEvidenceRunResult>
  cancelTest: (dispatchId: string) => Promise<boolean>
}
