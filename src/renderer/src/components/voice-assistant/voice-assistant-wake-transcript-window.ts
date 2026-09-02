import { extractWakePhraseRemainder } from './voice-assistant-intent'

export type WakeTranscriptFragment = { text: string; receivedAt: number }

const WINDOW_MS = 3_000
const MAX_FRAGMENTS = 4

export function appendWakeTranscriptFragment(
  current: WakeTranscriptFragment[],
  text: string,
  receivedAt: number
): { fragments: WakeTranscriptFragment[]; remainder: string | null } {
  const fragments = [
    ...current.filter((fragment) => receivedAt - fragment.receivedAt <= WINDOW_MS),
    { text, receivedAt }
  ].slice(-MAX_FRAGMENTS)
  return {
    fragments,
    remainder: extractWakePhraseRemainder(fragments.map((fragment) => fragment.text).join(' '))
  }
}
