import { describe, expect, it } from 'vitest'
import {
  classifyVoiceAssistantIntent,
  extractWakePhraseRemainder,
  isVoiceAssistantInterruption
} from './voice-assistant-intent'

describe('voice assistant intent', () => {
  it('keeps everyday conversation in chat', () => {
    expect(classifyVoiceAssistantIntent('Bugün nasılsın?')).toEqual({ kind: 'chat' })
    expect(classifyVoiceAssistantIntent('Kodlama hakkında biraz konuşalım')).toEqual({
      kind: 'chat'
    })
  })

  it('routes project work into BarkOS', () => {
    expect(classifyVoiceAssistantIntent('Bu projeyi incele ve testleri düzelt')).toEqual({
      kind: 'work',
      requiresConfirmation: false
    })
    expect(classifyVoiceAssistantIntent('Uygulamayı hazırla')).toEqual({
      kind: 'work',
      requiresConfirmation: false
    })
  })

  it('requires confirmation for sensitive work', () => {
    expect(classifyVoiceAssistantIntent('Projeyi production ortamına deploy et')).toEqual({
      kind: 'work',
      requiresConfirmation: true
    })
  })

  it('recognizes sleep commands', () => {
    expect(classifyVoiceAssistantIntent('Tamam, uykuya geç')).toEqual({ kind: 'sleep' })
  })
})

describe('BarkOS wake phrase', () => {
  it('extracts the request after the wake phrase', () => {
    expect(extractWakePhraseRemainder('Hey BarkOS, bugün nasılsın?')).toBe('bugün nasılsın?')
  })

  it('wakes without an immediate request', () => {
    expect(extractWakePhraseRemainder('hey barkos!')).toBe('')
  })

  it('accepts local speech model renderings of the BarkOS name', () => {
    expect(extractWakePhraseRemainder('Hey Barkosse')).toBe('')
    expect(extractWakePhraseRemainder('Hey Barco!')).toBe('')
    expect(extractWakePhraseRemainder('Hey Barcos, bugün nasılsın?')).toBe('bugün nasılsın?')
    expect(extractWakePhraseRemainder('Hey Barcozse, nasılsın?')).toBe('nasılsın?')
    expect(extractWakePhraseRemainder('Hey Barkus!')).toBe('')
    expect(extractWakePhraseRemainder('Hey Barker!')).toBe('')
    expect(extractWakePhraseRemainder('Hey Bark O S!')).toBe('')
    expect(extractWakePhraseRemainder('Hey. Hey Marcos.')).toBe('')
    expect(extractWakePhraseRemainder('Hello Marcos Johnny')).toBe('')
    expect(extractWakePhraseRemainder('Merhaba BarkOS')).toBe('')
    expect(extractWakePhraseRemainder('Selam BarkOS, projeyi aç')).toBe('projeyi aç')
  })

  it('accepts the observed Parakeet phonetic rendering', () => {
    expect(extractWakePhraseRemainder("Yeah, it's almost.")).toBe('')
    expect(extractWakePhraseRemainder("Yeah, it's almost. Bugün nasılsın?")).toBe('Bugün nasılsın?')
    expect(extractWakePhraseRemainder("Yeah, it's almost. Bugün hava nasıl?")).toBe(
      'Bugün hava nasıl?'
    )
  })

  it('ignores speech without the BarkOS wake phrase', () => {
    expect(extractWakePhraseRemainder('Merhaba, bugün nasılsın?')).toBeNull()
  })
})

describe('BarkOS speech interruption', () => {
  it('recognizes short Turkish stop phrases', () => {
    expect(isVoiceAssistantInterruption('BarkOS, dur!')).toBe(true)
    expect(isVoiceAssistantInterruption('Bekle')).toBe(true)
    expect(isVoiceAssistantInterruption('Yanıtı durdur')).toBe(true)
  })

  it('does not interrupt for ordinary speech', () => {
    expect(isVoiceAssistantInterruption('Durumu anlat')).toBe(false)
  })
})
