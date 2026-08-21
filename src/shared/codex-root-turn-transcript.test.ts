import { afterEach, describe, expect, it } from 'vitest'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  beginCodexRootTurnTranscript,
  createCodexRootTurnTranscriptState,
  hasActiveCodexRootTurnTranscript,
  reconcileCodexRootTurnTranscript
} from './codex-root-turn-transcript'

function line(record: unknown): string {
  return `${JSON.stringify(record)}\n`
}

function completion(turnId: string, codexErrorInfo?: string, message = 'failed'): unknown {
  return {
    type: 'event_msg',
    payload: {
      type: 'task_complete',
      turn_id: turnId,
      error: codexErrorInfo ? { message, codex_error_info: codexErrorInfo } : undefined
    }
  }
}

describe('Codex root-turn transcript', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    dirs.length = 0
  })

  it('reports an exact turn-scoped structured usage-limit failure', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-root-turn-'))
    dirs.push(dir)
    const transcriptPath = join(dir, 'rollout.jsonl')
    writeFileSync(
      transcriptPath,
      line({ type: 'event_msg', payload: { type: 'task_started', turn_id: 'turn-one' } })
    )
    const state = createCodexRootTurnTranscriptState()
    expect(beginCodexRootTurnTranscript(state, transcriptPath, 'turn-one')).toBe(true)
    expect(reconcileCodexRootTurnTranscript(state)).toBeUndefined()

    appendFileSync(
      transcriptPath,
      line(completion('turn-one', 'usage_limit_exceeded', 'Plan limit reached'))
    )

    expect(reconcileCodexRootTurnTranscript(state)).toEqual({
      providerFailure: { kind: 'usage-limit-exceeded' }
    })
    expect(hasActiveCodexRootTurnTranscript(state)).toBe(false)
    expect(beginCodexRootTurnTranscript(state, transcriptPath, 'turn-one')).toBe(true)
    expect(hasActiveCodexRootTurnTranscript(state)).toBe(false)
  })

  it('does not classify prose, another turn, or another structured error as a limit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-root-turn-'))
    dirs.push(dir)
    const transcriptPath = join(dir, 'rollout.jsonl')
    writeFileSync(
      transcriptPath,
      [
        line(completion('turn-other', 'usage_limit_exceeded')),
        line(completion('turn-one', 'server_overloaded', 'usage_limit_exceeded in prose'))
      ].join('')
    )
    const state = createCodexRootTurnTranscriptState()
    beginCodexRootTurnTranscript(state, transcriptPath, 'turn-one')

    expect(reconcileCodexRootTurnTranscript(state)).toEqual({})
  })

  it('accepts the forward-compatible turn_complete alias and treats success as settled', () => {
    const dir = mkdtempSync(join(tmpdir(), 'codex-root-turn-'))
    dirs.push(dir)
    const transcriptPath = join(dir, 'rollout.jsonl')
    writeFileSync(
      transcriptPath,
      line({ type: 'event_msg', payload: { type: 'turn_complete', turn_id: 'turn-one' } })
    )
    const state = createCodexRootTurnTranscriptState()
    beginCodexRootTurnTranscript(state, transcriptPath, 'turn-one')

    expect(reconcileCodexRootTurnTranscript(state)).toEqual({})
    expect(hasActiveCodexRootTurnTranscript(state)).toBe(false)
  })

  it('refuses relative paths and oversized turn ids', () => {
    const state = createCodexRootTurnTranscriptState()

    expect(beginCodexRootTurnTranscript(state, 'rollout.jsonl', 'turn-one')).toBe(false)
    expect(beginCodexRootTurnTranscript(state, '/tmp/rollout.jsonl', 'x'.repeat(257))).toBe(false)
    expect(hasActiveCodexRootTurnTranscript(state)).toBe(false)
  })
})
