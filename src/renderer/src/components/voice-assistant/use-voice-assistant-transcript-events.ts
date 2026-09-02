import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { VoiceAssistantMessage } from '../../../../shared/voice-assistant-types'
import { translate } from '@/i18n/i18n'
import type { AssistantState } from './voice-assistant-state-label'
import { isVoiceAssistantInterruption } from './voice-assistant-intent'
import {
  appendWakeTranscriptFragment,
  type WakeTranscriptFragment
} from './voice-assistant-wake-transcript-window'

type TranscriptEventOptions = {
  sessionIdRef: MutableRefObject<string | null>
  stateRef: MutableRefObject<AssistantState>
  ignoreTranscriptUntilRef: MutableRefObject<number>
  wakeTranscriptFragmentsRef: MutableRefObject<WakeTranscriptFragment[]>
  setPartialTranscript: Dispatch<SetStateAction<string>>
  setAssistantState: (state: AssistantState) => void
  appendMessage: (message: VoiceAssistantMessage) => void
  speak: (text: string, nextState: AssistantState) => void
  sendMessage: (text: string) => Promise<void>
  interruptSpokenResponse: () => void
  stopCapture: () => void
}

export function useVoiceAssistantTranscriptEvents(options: TranscriptEventOptions): void {
  const {
    sessionIdRef,
    stateRef,
    ignoreTranscriptUntilRef,
    wakeTranscriptFragmentsRef,
    setPartialTranscript,
    setAssistantState,
    appendMessage,
    speak,
    sendMessage,
    interruptSpokenResponse,
    stopCapture
  } = options

  useEffect(() => {
    const onFinal = window.api.speech.onFinalTranscript(({ text, sessionId }) => {
      if (sessionId !== sessionIdRef.current || !text) {
        return
      }
      if (stateRef.current === 'speaking') {
        if (isVoiceAssistantInterruption(text)) {
          interruptSpokenResponse()
        }
        return
      }
      if (Date.now() < ignoreTranscriptUntilRef.current) {
        return
      }
      setPartialTranscript('')
      if (stateRef.current === 'waiting') {
        const wakeMatch = appendWakeTranscriptFragment(
          wakeTranscriptFragmentsRef.current,
          text,
          Date.now()
        )
        wakeTranscriptFragmentsRef.current = wakeMatch.fragments
        if (wakeMatch.remainder === null) {
          return
        }
        wakeTranscriptFragmentsRef.current = []
        if (!wakeMatch.remainder) {
          const reply = translate('barkos.voiceAssistant.reply.listening', 'I am listening.')
          appendMessage({ role: 'assistant', text: reply })
          speak(reply, 'awake')
          return
        }
        setAssistantState('awake')
        void sendMessage(wakeMatch.remainder)
        return
      }
      if (stateRef.current === 'awake') {
        void sendMessage(text)
      }
    })
    const onPartial = window.api.speech.onPartialTranscript(({ text, sessionId }) => {
      if (
        sessionId === sessionIdRef.current &&
        stateRef.current !== 'speaking' &&
        Date.now() >= ignoreTranscriptUntilRef.current
      ) {
        setPartialTranscript(text)
      }
    })
    const onError = window.api.speech.onError(({ error, sessionId }) => {
      if (sessionId !== sessionIdRef.current) {
        return
      }
      sessionIdRef.current = null
      stopCapture()
      setAssistantState('error')
      appendMessage({
        role: 'assistant',
        text: translate('barkos.voiceAssistant.microphoneError', 'Microphone error: {{value0}}', {
          value0: error
        })
      })
    })
    return () => {
      onFinal()
      onPartial()
      onError()
    }
  }, [
    appendMessage,
    ignoreTranscriptUntilRef,
    interruptSpokenResponse,
    sendMessage,
    sessionIdRef,
    setAssistantState,
    setPartialTranscript,
    speak,
    stateRef,
    stopCapture,
    wakeTranscriptFragmentsRef
  ])
}
