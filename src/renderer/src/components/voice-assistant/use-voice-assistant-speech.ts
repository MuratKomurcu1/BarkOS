import { useCallback, useRef } from 'react'
import type { UiLanguage } from '../../../../shared/ui-language'
import type { AssistantState } from './voice-assistant-state-label'
import { voiceAssistantSpokenText } from './voice-assistant-spoken-text'
import { resolveVoiceAssistantLocale } from './voice-assistant-locale'

type VoiceAssistantSpeechControls = {
  speak: (text: string, nextState: AssistantState) => void
  cancel: () => void
}

export function useVoiceAssistantSpeech(options: {
  uiLanguage?: UiLanguage
  enabled: boolean
  mountedRef: { current: boolean }
  ignoreTranscriptUntilRef: { current: number }
  setState: (state: AssistantState) => void
  armConversationTimer: () => void
  onSpeechFinished?: () => void
}): VoiceAssistantSpeechControls {
  const {
    uiLanguage,
    enabled,
    mountedRef,
    ignoreTranscriptUntilRef,
    setState,
    armConversationTimer,
    onSpeechFinished
  } = options
  const generationRef = useRef(0)

  const cancel = useCallback((): void => {
    generationRef.current += 1
    window.speechSynthesis?.cancel()
    void window.api.voiceAssistant.cancel().catch(() => undefined)
    ignoreTranscriptUntilRef.current = Date.now() + 250
  }, [ignoreTranscriptUntilRef])

  const speak = useCallback(
    (text: string, nextState: AssistantState): void => {
      const generation = generationRef.current + 1
      generationRef.current = generation
      const synthesis = window.speechSynthesis
      const content = voiceAssistantSpokenText(text)
      if (!enabled || !content) {
        setState(nextState)
        if (nextState === 'awake') {
          armConversationTimer()
          onSpeechFinished?.()
        }
        return
      }
      const locale = resolveVoiceAssistantLocale(uiLanguage)
      const finish = (): void => {
        if (!mountedRef.current || generationRef.current !== generation) {
          return
        }
        ignoreTranscriptUntilRef.current = Date.now() + 750
        setState(nextState)
        if (nextState === 'awake') {
          armConversationTimer()
          onSpeechFinished?.()
        }
      }
      if (locale === 'tr-TR') {
        ignoreTranscriptUntilRef.current = Number.POSITIVE_INFINITY
        setState('speaking')
        void window.api.voiceAssistant.speak({ text: content, locale }).finally(finish)
        return
      }
      if (!synthesis || synthesis.getVoices().length === 0) {
        ignoreTranscriptUntilRef.current = Number.POSITIVE_INFINITY
        setState('speaking')
        void window.api.voiceAssistant.speak({ text: content, locale }).finally(finish)
        return
      }
      synthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(content)
      utterance.lang = locale
      ignoreTranscriptUntilRef.current = Number.POSITIVE_INFINITY
      utterance.onend = finish
      utterance.onerror = () => {
        if (generationRef.current === generation) {
          void window.api.voiceAssistant.speak({ text: content, locale }).finally(finish)
        }
      }
      setState('speaking')
      synthesis.speak(utterance)
    },
    [
      armConversationTimer,
      enabled,
      ignoreTranscriptUntilRef,
      mountedRef,
      onSpeechFinished,
      setState,
      uiLanguage
    ]
  )
  return { speak, cancel }
}
