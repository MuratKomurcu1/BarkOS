import type {
  BarkosWorkerSessionBinding,
  BarkosWorkerSessionSnapshot
} from '../../shared/barkos/worker-session'

export type BarkosWorkerSessionApi = {
  load: () => Promise<BarkosWorkerSessionSnapshot | null>
  record: (binding: BarkosWorkerSessionBinding) => Promise<BarkosWorkerSessionSnapshot>
}
