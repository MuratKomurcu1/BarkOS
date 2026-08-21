import { ShieldCheck } from 'lucide-react'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { TelemetryConsentState } from '../../../../shared/telemetry-consent-types'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { PrivacyDiagnosticsSection } from './PrivacyDiagnosticsSection'
import { translate } from '@/i18n/i18n'

export type EnvBlockedReason = 'do_not_track' | 'orca_disabled' | 'ci'
export type BlockedReason = { kind: 'env'; reason: EnvBlockedReason }

type PrivacyPaneProps = {
  settings: GlobalSettings
}

export function isEnvBlocked(consent: TelemetryConsentState | null): consent is {
  effective: 'disabled'
  reason: EnvBlockedReason
} {
  return (
    consent?.effective === 'disabled' &&
    (consent.reason === 'do_not_track' ||
      consent.reason === 'orca_disabled' ||
      consent.reason === 'ci')
  )
}

export function envVarNameForReason(reason: EnvBlockedReason): string {
  if (reason === 'do_not_track') {
    return 'DO_NOT_TRACK'
  }
  if (reason === 'orca_disabled') {
    return 'ORCA_TELEMETRY_DISABLED'
  }
  return 'CI'
}

export function computeBlockedReason(consent: TelemetryConsentState | null): BlockedReason | null {
  if (isEnvBlocked(consent)) {
    return { kind: 'env', reason: consent.reason }
  }
  return null
}

export function PrivacyPane({ settings: _settings }: PrivacyPaneProps): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            <Label>
              {translate('auto.components.settings.PrivacyPane.fe904ac984', 'Anonymous usage data')}
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            {translate(
              'barkos.privacy.telemetryDisabled',
              'BarkOS does not transmit usage analytics in this private build.'
            )}
          </p>
        </div>
        <Switch
          checked={false}
          aria-label={translate(
            'auto.components.settings.PrivacyPane.fe904ac984',
            'Anonymous usage data'
          )}
          disabled
        />
      </div>
      <PrivacyDiagnosticsSection />
    </div>
  )
}
