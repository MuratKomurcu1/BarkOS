import type { VoiceSettings } from '../../../../shared/speech-types'
import { Label } from '../ui/label'
import { Separator } from '../ui/separator'
import { Switch } from '../ui/switch'
import { translate } from '@/i18n/i18n'

type Props = {
  voiceSettings: VoiceSettings
  onUpdateVoiceSettings: (updates: Partial<VoiceSettings>) => void
}

export function VoiceAssistantSettingsSection({
  voiceSettings,
  onUpdateVoiceSettings
}: Props): React.JSX.Element {
  const assistantAvailable = voiceSettings.enabled && Boolean(voiceSettings.sttModel)

  return (
    <>
      <Separator />
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="space-y-0.5">
          <Label>{translate('barkos.voiceAssistant.title', 'BarkOS Assistant')}</Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'barkos.voiceAssistant.settingsDescription',
              'Wake it with “Hey BarkOS” for everyday conversation or project work.'
            )}
          </p>
          {!assistantAvailable ? (
            <p className="text-xs text-muted-foreground">
              {translate(
                'barkos.voiceAssistant.modelRequired',
                'Enable voice dictation and choose a speech model first.'
              )}
            </p>
          ) : null}
        </div>
        <Switch
          checked={voiceSettings.assistantEnabled === true}
          disabled={!assistantAvailable}
          aria-label={translate('barkos.voiceAssistant.enableLabel', 'Enable BarkOS Assistant')}
          onCheckedChange={(checked) => onUpdateVoiceSettings({ assistantEnabled: checked })}
        />
      </div>

      <Separator />
      <div className="flex items-center justify-between gap-4 py-2">
        <div className="space-y-0.5">
          <Label>{translate('barkos.voiceAssistant.spokenResponses', 'Spoken responses')}</Label>
          <p className="text-xs text-muted-foreground">
            {translate(
              'barkos.voiceAssistant.spokenResponsesDescription',
              'BarkOS Assistant reads responses using the system voice.'
            )}
          </p>
        </div>
        <Switch
          checked={voiceSettings.assistantSpeakResponses !== false}
          disabled={voiceSettings.assistantEnabled !== true}
          aria-label={translate(
            'barkos.voiceAssistant.enableSpokenResponsesLabel',
            'Enable spoken BarkOS Assistant responses'
          )}
          onCheckedChange={(checked) => onUpdateVoiceSettings({ assistantSpeakResponses: checked })}
        />
      </div>
    </>
  )
}
