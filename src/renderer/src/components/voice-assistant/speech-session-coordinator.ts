let stopVoiceAssistant: (() => Promise<void>) | null = null

export function registerVoiceAssistantStop(handler: () => Promise<void>): () => void {
  stopVoiceAssistant = handler
  return () => {
    if (stopVoiceAssistant === handler) {
      stopVoiceAssistant = null
    }
  }
}

export async function stopVoiceAssistantForDictation(): Promise<void> {
  await stopVoiceAssistant?.()
}
