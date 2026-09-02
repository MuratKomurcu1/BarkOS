import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { Store } from '../persistence'
import type {
  VoiceAssistantChatRequest,
  VoiceAssistantChatResult,
  VoiceAssistantMessage
} from '../../shared/voice-assistant-types'
import {
  cancelGenerateAssistantChatLocal,
  generateAssistantChatFromPrompt,
  resolveTextGenerationParams
} from '../text-generation/commit-message-text-generation'
import { isTrustedUIRenderer } from './ui'
import { cancelSystemSpeech, speakWithSystemVoice } from '../speech/system-speech'

const MAX_MESSAGES = 12
const MAX_MESSAGE_CHARS = 2_000
const MAX_TOTAL_CHARS = 12_000
const SUPPORTED_AGENTS = new Set(['codex', 'claude', 'opencode'])

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedUIRenderer(event.sender)) {
    throw new Error('unauthorized_voice_assistant_sender')
  }
}

function sanitizeMessages(value: unknown): VoiceAssistantMessage[] {
  if (!Array.isArray(value)) {
    return []
  }
  const messages: VoiceAssistantMessage[] = []
  let totalChars = 0
  for (const item of value.slice(-MAX_MESSAGES)) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const role = Reflect.get(item, 'role')
    const rawText = Reflect.get(item, 'text')
    if ((role !== 'user' && role !== 'assistant') || typeof rawText !== 'string') {
      continue
    }
    const text = rawText
      .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
      .trim()
      .slice(0, MAX_MESSAGE_CHARS)
    if (!text) {
      continue
    }
    const available = MAX_TOTAL_CHARS - totalChars
    if (available <= 0) {
      break
    }
    messages.push({ role, text: text.slice(0, available) })
    totalChars += Math.min(text.length, available)
  }
  return messages
}

export function buildVoiceAssistantPrompt(request: VoiceAssistantChatRequest): string {
  const messages = sanitizeMessages(request.messages)
  const locale = request.locale?.toLowerCase().startsWith('tr') ? 'Türkçe' : 'kullanıcının dili'
  const transcript = messages
    .map(
      (message) => `${message.role === 'user' ? 'Kullanıcı' : 'BarkOS Asistan'}: ${message.text}`
    )
    .join('\n')
  return [
    'Sen BarkOS Asistanısın. Samimi, doğal ve güvenilir bir masaüstü asistanı gibi konuş.',
    `Yanıtını ${locale} ver. Gereksiz uzatma; çoğu yanıt 1-4 kısa paragraf olsun.`,
    'Bu çağrı yalnızca gündelik sohbet içindir. Araç kullanma, dosya değiştirme, komut çalıştırma veya bir işlemi yaptığını iddia etme.',
    'Kullanıcı proje, kod, dosya veya ekip işi isterse işi yapma; BarkOS çalışma akışına aktarılacağını kısaca söyle.',
    'Bilmediğin veya güncel doğrulama gerektiren bir konuda kesinmiş gibi konuşma.',
    '',
    'Konuşma:',
    transcript,
    'BarkOS Asistan:'
  ].join('\n')
}

export function registerVoiceAssistantHandlers(store: Store): void {
  const activeSenders = new Set<number>()

  ipcMain.handle(
    'voiceAssistant:reply',
    async (event, value: unknown): Promise<VoiceAssistantChatResult> => {
      assertTrustedSender(event)
      if (activeSenders.has(event.sender.id)) {
        return { success: false, error: 'BarkOS Asistan şu anda önceki yanıtı hazırlıyor.' }
      }
      const request = value as Partial<VoiceAssistantChatRequest>
      const messages = sanitizeMessages(request?.messages)
      if (messages.length === 0 || messages.at(-1)?.role !== 'user') {
        return { success: false, error: 'Yanıtlanacak geçerli bir kullanıcı mesajı bulunamadı.' }
      }

      const resolved = resolveTextGenerationParams(store.getSettings())
      if (!resolved.ok) {
        return { success: false, error: resolved.error }
      }
      if (!SUPPORTED_AGENTS.has(resolved.params.agentId)) {
        return {
          success: false,
          error: 'BarkOS Asistan için ana ajan olarak Codex, Claude veya OpenCode seçin.'
        }
      }

      const cwd = app.getPath('home')
      const params =
        resolved.params.agentId === 'opencode'
          ? {
              ...resolved.params,
              agentArgs: [resolved.params.agentArgs, '--agent plan'].filter(Boolean).join(' ')
            }
          : resolved.params
      activeSenders.add(event.sender.id)
      try {
        return await generateAssistantChatFromPrompt(
          buildVoiceAssistantPrompt({ messages, locale: request.locale }),
          params,
          { kind: 'local', cwd }
        )
      } finally {
        activeSenders.delete(event.sender.id)
      }
    }
  )

  ipcMain.handle('voiceAssistant:cancel', async (event) => {
    assertTrustedSender(event)
    cancelSystemSpeech()
    cancelGenerateAssistantChatLocal(app.getPath('home'))
  })

  ipcMain.handle('voiceAssistant:speak', async (event, value: unknown) => {
    assertTrustedSender(event)
    const rawText = value && typeof value === 'object' ? Reflect.get(value, 'text') : null
    const rawLocale = value && typeof value === 'object' ? Reflect.get(value, 'locale') : null
    if (typeof rawText !== 'string') {
      return { success: false }
    }
    const text = rawText
      .replace(/[\p{Cc}\p{Cf}]+/gu, ' ')
      .trim()
      .slice(0, MAX_MESSAGE_CHARS)
    const locale = typeof rawLocale === 'string' ? rawLocale.slice(0, 20) : undefined
    return { success: Boolean(text && (await speakWithSystemVoice(text, locale))) }
  })
}
