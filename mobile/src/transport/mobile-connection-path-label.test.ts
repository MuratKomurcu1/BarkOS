import { describe, expect, it } from 'vitest'
import { mobileConnectionPathLabel } from './mobile-connection-path-label'

describe('mobile connection path label', () => {
  it('distinguishes LAN, Tailscale, and the relay without exposing transport errors', () => {
    expect(mobileConnectionPathLabel('lan')).toBe('Doğrudan · Yerel ağ')
    expect(mobileConnectionPathLabel('tailscale')).toBe('Doğrudan · Tailscale')
    expect(mobileConnectionPathLabel('relay')).toBe('BarkOS Aktarma')
  })
})
