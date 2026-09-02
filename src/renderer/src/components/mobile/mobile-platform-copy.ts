import type { Platform } from './MobileHero'
import { translate } from '@/i18n/i18n'

export type IosChannel = 'stable' | 'preview'

export type InstallCopy = { ctaLabel: string; url: string | null }

const TESTFLIGHT_APP_URL = 'https://apps.apple.com/app/testflight/id899247664'

const IOS_STABLE_COPY: InstallCopy = {
  ctaLabel: 'BarkOS Mobile',
  url: null
}

const ANDROID_COPY: InstallCopy = {
  ctaLabel: 'BarkOS Mobile',
  url: null
}

export function getInstallCopy(platform: Platform, iosChannel: IosChannel): InstallCopy {
  if (platform !== 'ios') {
    return ANDROID_COPY
  }
  if (iosChannel === 'stable') {
    return IOS_STABLE_COPY
  }
  return {
    ctaLabel: translate('barkos.mobile.preview.cta', 'Open TestFlight'),
    url: TESTFLIGHT_APP_URL
  }
}

export function getChannelTagline(iosChannel: IosChannel): string {
  return iosChannel === 'preview'
    ? translate(
        'auto.components.mobile.mobile.platform.copy.preview.tagline',
        'BarkOS private preview.'
      )
    : translate(
        'auto.components.mobile.mobile.platform.copy.stable.tagline',
        'BarkOS stable release.'
      )
}
