import type { BarkosMemoryVault } from '../../shared/barkos/memory-vault'

export type BarkosMemoryVaultApi = {
  load: () => Promise<BarkosMemoryVault | null>
  save: (vault: BarkosMemoryVault) => Promise<BarkosMemoryVault>
}
