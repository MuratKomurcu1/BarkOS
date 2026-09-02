import { describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))

import { getInstallCopy } from './mobile-platform-copy'

describe('mobile platform install copy', () => {
  it('routes the iOS preview channel to TestFlight', () => {
    expect(getInstallCopy('ios', 'preview')).toEqual({
      ctaLabel: 'Open TestFlight',
      url: 'https://apps.apple.com/app/testflight/id899247664'
    })
  })

  it('does not advertise an unpublished stable or Android build', () => {
    expect(getInstallCopy('ios', 'stable').url).toBeNull()
    expect(getInstallCopy('android', 'preview').url).toBeNull()
  })
})
