import { beforeEach, describe, expect, it, vi } from 'vitest'

const { handlers, isTrustedUIRendererMock, generateMock, resolveMock, cancelMock } = vi.hoisted(
  () => ({
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
    isTrustedUIRendererMock: vi.fn(() => true),
    generateMock: vi.fn(),
    resolveMock: vi.fn(),
    cancelMock: vi.fn()
  })
)

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/user/home') },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    })
  }
}))

vi.mock('./ui', () => ({ isTrustedUIRenderer: isTrustedUIRendererMock }))

vi.mock('../text-generation/commit-message-text-generation', () => ({
  cancelGenerateAssistantChatLocal: cancelMock,
  generateAssistantChatFromPrompt: generateMock,
  resolveTextGenerationParams: resolveMock
}))

import { buildVoiceAssistantPrompt, registerVoiceAssistantHandlers } from './voice-assistant'

describe('voice assistant IPC', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    isTrustedUIRendererMock.mockReturnValue(true)
    resolveMock.mockReturnValue({
      ok: true,
      params: { agentId: 'codex', model: 'gpt-test' }
    })
    generateMock.mockResolvedValue({ success: true, text: 'Merhaba.' })
  })

  it('builds a bounded conversation prompt without granting tools', () => {
    const prompt = buildVoiceAssistantPrompt({
      locale: 'tr-TR',
      messages: [{ role: 'user', text: 'Nasılsın?' }]
    })
    expect(prompt).toContain('Sen BarkOS Asistanısın.')
    expect(prompt).toContain('Araç kullanma, dosya değiştirme, komut çalıştırma')
    expect(prompt).toContain('Kullanıcı: Nasılsın?')
  })

  it('runs casual chat through the configured safe agent', async () => {
    registerVoiceAssistantHandlers({ getSettings: () => ({}) } as never)
    const reply = handlers.get('voiceAssistant:reply')!
    const result = await reply(
      { sender: { id: 7 } },
      { locale: 'tr', messages: [{ role: 'user', text: 'Merhaba' }] }
    )
    expect(result).toEqual({ success: true, text: 'Merhaba.' })
    expect(generateMock).toHaveBeenCalledWith(
      expect.stringContaining('Kullanıcı: Merhaba'),
      expect.objectContaining({ agentId: 'codex' }),
      { kind: 'local', cwd: '/user/home' }
    )
  })

  it('rejects requests from an untrusted renderer', async () => {
    isTrustedUIRendererMock.mockReturnValue(false)
    registerVoiceAssistantHandlers({ getSettings: () => ({}) } as never)
    const reply = handlers.get('voiceAssistant:reply')!
    await expect(
      reply({ sender: { id: 7 } }, { messages: [{ role: 'user', text: 'Merhaba' }] })
    ).rejects.toThrow('unauthorized_voice_assistant_sender')
  })
})
