import { useCallback, useEffect, useRef, useState } from 'react'
import type { VoiceAssistantMessage } from '../../../../shared/voice-assistant-types'
import { useAppStore } from '@/store'
import { useAudioCapture } from '@/hooks/use-audio-capture'
import { toast } from 'sonner'
import { classifyVoiceAssistantIntent } from './voice-assistant-intent'
import { queueVoiceWorkRequest } from './voice-assistant-work-request'
import { registerVoiceAssistantStop } from './speech-session-coordinator'
import { VoiceAssistantPanel, type VoiceAssistantDisplayMessage } from './VoiceAssistantPanel'
import { translate } from '@/i18n/i18n'
import { type AssistantState, voiceAssistantStateLabel } from './voice-assistant-state-label'
import type { WakeTranscriptFragment } from './voice-assistant-wake-transcript-window'
import { VoiceAssistantCaptureRecovery } from './voice-assistant-capture-recovery'
import { useVoiceAssistantSpeech } from './use-voice-assistant-speech'
import { useVoiceAssistantTranscriptEvents } from './use-voice-assistant-transcript-events'
import { resolveVoiceAssistantLocale } from './voice-assistant-locale'

const WAKE_PHRASES = ['Hey BarkOS', 'Merhaba BarkOS', 'Selam BarkOS']
const MAX_HISTORY_MESSAGES = 12

export function VoiceAssistantController(): React.JSX.Element {
  const settings = useAppStore((state) => state.settings)
  const assistantLocale = resolveVoiceAssistantLocale(settings?.uiLanguage)
  const dictationState = useAppStore((state) => state.dictationState)
  const [open, setOpen] = useState(false)
  const [state, setRenderedState] = useState<AssistantState>('idle')
  const [messages, setMessages] = useState<VoiceAssistantDisplayMessage[]>([])
  const [partialTranscript, setPartialTranscript] = useState('')
  const messagesRef = useRef(messages)
  const stateRef = useRef(state)
  const sessionIdRef = useRef<string | null>(null)
  const ignoreTranscriptUntilRef = useRef(0)
  const conversationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const captureRecoveryRef = useRef(new VoiceAssistantCaptureRecovery())
  const wakeTranscriptFragmentsRef = useRef<WakeTranscriptFragment[]>([])
  const startListeningRef = useRef<() => Promise<void>>(async () => undefined)
  const resetAfterSpeechRef = useRef<() => Promise<void>>(async () => undefined)
  const resettingAfterSpeechRef = useRef(false)
  const mountedRef = useRef(true)
  const {
    start: startCapture,
    stop: stopCapture,
    flushBufferedAudio,
    discardBufferedAudio
  } = useAudioCapture()

  messagesRef.current = messages
  stateRef.current = state

  const setAssistantState = useCallback((nextState: AssistantState): void => {
    stateRef.current = nextState
    setRenderedState(nextState)
  }, [])

  const appendMessage = useCallback((message: VoiceAssistantMessage): void => {
    setMessages((current) =>
      [...current, { ...message, id: crypto.randomUUID() }].slice(-MAX_HISTORY_MESSAGES)
    )
  }, [])

  const clearConversationTimer = useCallback((): void => {
    if (conversationTimerRef.current) {
      clearTimeout(conversationTimerRef.current)
      conversationTimerRef.current = null
    }
  }, [])

  const armConversationTimer = useCallback((): void => {
    clearConversationTimer()
    const configured = settings?.voice?.assistantConversationTimeoutMs ?? 45_000
    const timeout = Math.min(Math.max(configured, 15_000), 5 * 60_000)
    conversationTimerRef.current = setTimeout(() => {
      if (stateRef.current === 'awake') {
        setAssistantState('waiting')
        setPartialTranscript('')
      }
    }, timeout)
  }, [clearConversationTimer, setAssistantState, settings?.voice?.assistantConversationTimeoutMs])

  const handleSpeechFinished = useCallback((): void => {
    void resetAfterSpeechRef.current()
  }, [])

  const { speak, cancel: cancelSpeech } = useVoiceAssistantSpeech({
    uiLanguage: settings?.uiLanguage,
    enabled: settings?.voice?.assistantSpeakResponses !== false,
    mountedRef,
    ignoreTranscriptUntilRef,
    setState: setAssistantState,
    armConversationTimer,
    onSpeechFinished: handleSpeechFinished
  })

  const interruptSpokenResponse = useCallback((): void => {
    if (stateRef.current !== 'speaking') {
      return
    }
    cancelSpeech()
    setPartialTranscript('')
    setAssistantState('awake')
    appendMessage({
      role: 'assistant',
      text: translate('barkos.voiceAssistant.reply.interrupted', 'Durdurdum, dinliyorum.')
    })
    armConversationTimer()
  }, [appendMessage, armConversationTimer, cancelSpeech, setAssistantState])

  const stopListening = useCallback(
    async (recoverCapture = false): Promise<void> => {
      if (!recoverCapture) {
        captureRecoveryRef.current.cancel()
      }
      clearConversationTimer()
      cancelSpeech()
      ignoreTranscriptUntilRef.current = 0
      const sessionId = sessionIdRef.current
      sessionIdRef.current = null
      stopCapture()
      discardBufferedAudio()
      wakeTranscriptFragmentsRef.current = []
      setPartialTranscript('')
      setAssistantState('idle')
      if (sessionId) {
        await window.api.speech.stopDictation(sessionId).catch(() => undefined)
      }
    },
    [cancelSpeech, clearConversationTimer, discardBufferedAudio, setAssistantState, stopCapture]
  )

  const sendMessage = useCallback(
    async (rawText: string): Promise<void> => {
      const text = rawText.trim().slice(0, 2_000)
      if (!text || stateRef.current === 'thinking') {
        return
      }
      clearConversationTimer()
      appendMessage({ role: 'user', text })
      const intent = classifyVoiceAssistantIntent(text)
      if (intent.kind === 'sleep') {
        const reply = translate(
          'barkos.voiceAssistant.reply.sleep',
          'Okay. Open the microphone when you want to talk again.'
        )
        await stopListening()
        appendMessage({ role: 'assistant', text: reply })
        speak(reply, 'idle')
        return
      }
      if (intent.kind === 'work') {
        queueVoiceWorkRequest({
          request: text,
          autoStart: !intent.requiresConfirmation,
          queuedAt: Date.now()
        })
        useAppStore.getState().openCompanyPage()
        const reply = intent.requiresConfirmation
          ? translate(
              'barkos.voiceAssistant.reply.workConfirmation',
              'This request includes a sensitive action. I added it to the BarkOS company screen as a draft and will wait for your approval before starting.'
            )
          : translate(
              'barkos.voiceAssistant.reply.workQueued',
              'I sent the request to the BarkOS workflow. After you select the project folder, the file reader and lead agent will assemble the team.'
            )
        appendMessage({ role: 'assistant', text: reply })
        speak(reply, sessionIdRef.current ? 'awake' : 'idle')
        return
      }

      setAssistantState('thinking')
      const history = [
        ...messagesRef.current.map(({ role, text: messageText }) => ({
          role,
          text: messageText
        })),
        { role: 'user' as const, text }
      ].slice(-MAX_HISTORY_MESSAGES)
      const result = await window.api.voiceAssistant.reply({
        messages: history,
        locale: assistantLocale
      })
      if (!mountedRef.current) {
        return
      }
      if (!result.success) {
        const reply = result.canceled
          ? translate('barkos.voiceAssistant.reply.canceled', 'Response stopped.')
          : result.error
        appendMessage({ role: 'assistant', text: reply })
        setAssistantState(sessionIdRef.current ? 'awake' : 'error')
        return
      }
      appendMessage({ role: 'assistant', text: result.text })
      speak(result.text, sessionIdRef.current ? 'awake' : 'idle')
    },
    [
      appendMessage,
      clearConversationTimer,
      setAssistantState,
      assistantLocale,
      speak,
      stopListening
    ]
  )

  const startListening = useCallback(async (): Promise<void> => {
    if (sessionIdRef.current || stateRef.current === 'starting') {
      return
    }
    if (dictationState !== 'idle') {
      toast.message(
        translate(
          'barkos.voiceAssistant.dictationActive',
          'Stop the active voice dictation session first.'
        )
      )
      return
    }
    const modelId = settings?.voice?.sttModel
    if (!modelId) {
      toast.message(
        translate('barkos.voiceAssistant.selectModel', 'Choose a speech model in Settings > Voice.')
      )
      return
    }
    let permission
    try {
      permission = await window.api.developerPermissions.request({ id: 'microphone' })
    } catch (error) {
      setOpen(true)
      setAssistantState('error')
      toast.error(error instanceof Error ? error.message : String(error))
      return
    }
    if (permission.status !== 'granted' && permission.status !== 'unsupported') {
      setOpen(true)
      setAssistantState('error')
      toast.message(
        translate(
          'barkos.voiceAssistant.microphonePermissionRequired',
          'Allow microphone access for BarkOS, then start listening again.'
        )
      )
      return
    }
    const sessionId = `barkos-assistant-${Date.now()}`
    wakeTranscriptFragmentsRef.current = []
    sessionIdRef.current = sessionId
    setAssistantState('starting')
    setOpen(true)
    try {
      await startCapture({
        bufferAudio: true,
        sessionId,
        microphoneDeviceId: settings?.voice?.microphoneDeviceId ?? null,
        microphoneDeviceLabel: settings?.voice?.microphoneDeviceLabel ?? null,
        onCaptureLost: () => {
          void captureRecoveryRef.current.restartAfter(
            () => stopListening(true),
            () => startListeningRef.current(),
            () => {
              const voice = useAppStore.getState().settings?.voice
              return Boolean(mountedRef.current && voice?.assistantEnabled && voice.sttModel)
            }
          )
        }
      })
      await window.api.speech.startDictation(modelId, WAKE_PHRASES, sessionId)
      if (sessionIdRef.current !== sessionId) {
        return
      }
      await flushBufferedAudio()
      if (sessionIdRef.current === sessionId) {
        setAssistantState('waiting')
      }
    } catch (error) {
      if (sessionIdRef.current !== sessionId) {
        return
      }
      sessionIdRef.current = null
      stopCapture()
      discardBufferedAudio()
      setAssistantState('error')
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }, [
    dictationState,
    discardBufferedAudio,
    flushBufferedAudio,
    settings?.voice?.microphoneDeviceId,
    settings?.voice?.microphoneDeviceLabel,
    settings?.voice?.sttModel,
    setAssistantState,
    startCapture,
    stopCapture,
    stopListening
  ])
  startListeningRef.current = startListening
  resetAfterSpeechRef.current = async (): Promise<void> => {
    const voice = useAppStore.getState().settings?.voice
    if (
      resettingAfterSpeechRef.current ||
      !sessionIdRef.current ||
      !voice?.assistantEnabled ||
      !voice.sttModel
    ) {
      return
    }
    resettingAfterSpeechRef.current = true
    try {
      await stopListening(true)
      await startListeningRef.current()
      if (sessionIdRef.current) {
        setAssistantState('awake')
        armConversationTimer()
      }
    } finally {
      resettingAfterSpeechRef.current = false
    }
  }

  useEffect(() => {
    if (settings?.voice?.assistantEnabled === true && settings.voice.sttModel) {
      void startListening()
    }
  }, [settings?.voice?.assistantEnabled, settings?.voice?.sttModel, startListening])

  useEffect(() => {
    const retryAfterPermissionChange = (): void => {
      if (settings?.voice?.assistantEnabled === true && stateRef.current === 'error') {
        void startListening()
      }
    }
    window.addEventListener('focus', retryAfterPermissionChange)
    return () => window.removeEventListener('focus', retryAfterPermissionChange)
  }, [settings?.voice?.assistantEnabled, startListening])

  useEffect(() => registerVoiceAssistantStop(stopListening), [stopListening])

  useEffect(() => {
    if (dictationState !== 'idle' && sessionIdRef.current) {
      void stopListening()
    }
  }, [dictationState, stopListening])

  useVoiceAssistantTranscriptEvents({
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
  })

  useEffect(() => {
    mountedRef.current = true
    const captureRecovery = captureRecoveryRef.current
    return () => {
      mountedRef.current = false
      clearConversationTimer()
      captureRecovery.cancel()
      window.speechSynthesis?.cancel()
      stopCapture()
      const sessionId = sessionIdRef.current
      if (sessionId) {
        void window.api.speech.stopDictation(sessionId).catch(() => undefined)
      }
    }
  }, [clearConversationTimer, stopCapture])

  const listening = Boolean(sessionIdRef.current)
  return (
    <VoiceAssistantPanel
      open={open}
      listening={listening}
      busy={state === 'starting' || state === 'thinking'}
      status={voiceAssistantStateLabel(state)}
      messages={messages}
      partialTranscript={partialTranscript}
      onOpenChange={setOpen}
      onStartListening={() => void startListening()}
      onStopListening={() => void stopListening()}
      onSend={(text) => void sendMessage(text)}
    />
  )
}
