export type QueuedVoiceWorkRequest = {
  request: string
  autoStart: boolean
  queuedAt: number
}

const STORAGE_KEY = 'barkos.voice-assistant.pending-work-request.v1'

export function queueVoiceWorkRequest(value: QueuedVoiceWorkRequest): void {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
}

export function consumeVoiceWorkRequest(): QueuedVoiceWorkRequest | null {
  const serialized = window.sessionStorage.getItem(STORAGE_KEY)
  if (!serialized) {
    return null
  }
  window.sessionStorage.removeItem(STORAGE_KEY)
  try {
    const value = JSON.parse(serialized) as Partial<QueuedVoiceWorkRequest>
    if (
      typeof value.request !== 'string' ||
      typeof value.autoStart !== 'boolean' ||
      typeof value.queuedAt !== 'number' ||
      Date.now() - value.queuedAt > 5 * 60_000
    ) {
      return null
    }
    return {
      request: value.request.slice(0, 8_000),
      autoStart: value.autoStart,
      queuedAt: value.queuedAt
    }
  } catch {
    return null
  }
}
