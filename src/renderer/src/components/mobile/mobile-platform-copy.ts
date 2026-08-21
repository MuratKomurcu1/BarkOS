import type { Platform } from './MobileHero'
import { translate } from '@/i18n/i18n'

export type IosChannel = 'stable' | 'preview'

export type InstallCopy = { ctaLabel: string; url: string | null }

const IOS_CHANNEL_COPY: Record<IosChannel, InstallCopy> = {
  stable: {
    ctaLabel: 'BarkOS Mobile',
    url: null
  },
  preview: {
    ctaLabel: 'BarkOS Mobile',
    url: null
  }
}

const ANDROID_COPY: InstallCopy = {
  ctaLabel: 'BarkOS Mobile',
  url: null
}

export function getInstallCopy(platform: Platform, iosChannel: IosChannel): InstallCopy {
  return platform === 'ios' ? IOS_CHANNEL_COPY[iosChannel] : ANDROID_COPY
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
