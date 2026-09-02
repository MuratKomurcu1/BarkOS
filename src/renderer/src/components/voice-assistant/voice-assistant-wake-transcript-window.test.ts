import { describe, expect, it } from 'vitest'
import { appendWakeTranscriptFragment } from './voice-assistant-wake-transcript-window'

describe('voice assistant wake transcript window', () => {
  it('matches a wake phrase split across consecutive offline transcripts', () => {
    const first = appendWakeTranscriptFragment([], 'Yeah,', 1_000)
    const second = appendWakeTranscriptFragment(first.fragments, "it's almost.", 1_500)

    expect(first.remainder).toBeNull()
    expect(second.remainder).toBe('')
  })

  it('drops stale fragments before matching', () => {
    const first = appendWakeTranscriptFragment([], 'Yeah,', 1_000)
    const second = appendWakeTranscriptFragment(first.fragments, "it's almost.", 5_000)

    expect(second.remainder).toBeNull()
    expect(second.fragments).toHaveLength(1)
  })
})
