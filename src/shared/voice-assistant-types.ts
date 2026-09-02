export type VoiceAssistantRole = 'user' | 'assistant'

export type VoiceAssistantMessage = {
  role: VoiceAssistantRole
  text: string
}

export type VoiceAssistantChatRequest = {
  messages: VoiceAssistantMessage[]
  locale?: string
}

export type VoiceAssistantChatResult =
  | { success: true; text: string; agentLabel?: string }
  | { success: false; error: string; canceled?: boolean }

export type VoiceAssistantApi = {
  reply: (request: VoiceAssistantChatRequest) => Promise<VoiceAssistantChatResult>
  speak: (request: { text: string; locale?: string }) => Promise<{ success: boolean }>
  cancel: () => Promise<void>
}
