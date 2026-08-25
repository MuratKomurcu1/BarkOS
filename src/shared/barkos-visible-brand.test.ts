import { describe, expect, it } from 'vitest'
import { brandBarkosVisibleCopy } from './barkos-visible-brand'

describe('brandBarkosVisibleCopy', () => {
  it('rebrands visible inherited product names', () => {
    expect(brandBarkosVisibleCopy('Open Orca and install the ORCA CLI')).toBe(
      'Open BarkOS and install the BARKOS CLI'
    )
  })

  it('preserves compatibility identifiers and commands', () => {
    expect(brandBarkosVisibleCopy('barkos.yaml · orca://pair')).toBe('barkos.yaml · orca://pair')
  })
})
