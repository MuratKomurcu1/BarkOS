import { UI_LANGUAGE_SYSTEM, type UiLanguage } from '../../../../shared/ui-language'
import { getRendererSystemLocale, resolveUiLocale } from '../../../../shared/ui-locale'

export function resolveVoiceAssistantLocale(
  language: UiLanguage | undefined,
  systemLocale: string = getRendererSystemLocale()
): string {
  const resolved = resolveUiLocale(language ?? UI_LANGUAGE_SYSTEM, systemLocale)
  if (resolved === 'tr') {
    return 'tr-TR'
  }
  if (resolved === 'en') {
    return 'en-US'
  }
  return resolved
}
