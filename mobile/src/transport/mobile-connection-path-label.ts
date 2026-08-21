import type { MobileConnectionPath } from './stable-logical-rpc-client'

export function mobileConnectionPathLabel(path: MobileConnectionPath): string {
  if (path === 'relay') {
    return 'BarkOS Aktarma'
  }
  return path === 'tailscale' ? 'Doğrudan · Tailscale' : 'Doğrudan · Yerel ağ'
}
