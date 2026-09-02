import { describe, expect, it } from 'vitest'
import { resolveVoiceAssistantLocale } from './voice-assistant-locale'

describe('voice assistant locale', () => {
  it('resolves the system preference instead of speaking system as English', () => {
    expect(resolveVoiceAssistantLocale('system', 'tr-TR')).toBe('tr-TR')
  })

  it('keeps an explicit Turkish preference on the Turkish speech route', () => {
    expect(resolveVoiceAssistantLocale('tr', 'en-US')).toBe('tr-TR')
  })
})
