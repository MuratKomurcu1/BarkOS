import { translate } from '@/i18n/i18n'

export type AssistantState =
  | 'idle'
  | 'starting'
  | 'waiting'
  | 'awake'
  | 'thinking'
  | 'speaking'
  | 'error'

export function voiceAssistantStateLabel(state: AssistantState): string {
  if (state === 'starting') {
    return translate('barkos.voiceAssistant.state.starting', 'Preparing microphone…')
  }
  if (state === 'waiting') {
    return translate('barkos.voiceAssistant.state.waiting', 'Waiting for “Hey BarkOS”')
  }
  if (state === 'awake') {
    return translate('barkos.voiceAssistant.state.awake', 'Listening')
  }
  if (state === 'thinking') {
    return translate('barkos.voiceAssistant.state.thinking', 'Preparing response…')
  }
  if (state === 'speaking') {
    return translate('barkos.voiceAssistant.state.speaking', 'Responding')
  }
  if (state === 'error') {
    return translate('barkos.voiceAssistant.state.error', 'Connection error')
  }
  return translate('barkos.voiceAssistant.state.ready', 'Ready')
}
