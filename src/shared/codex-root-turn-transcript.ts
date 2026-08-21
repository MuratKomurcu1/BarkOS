import { closeSync, openSync, readSync, statSync, type Stats } from 'node:fs'
import { extname, isAbsolute } from 'node:path'

import type { AgentProviderFailure } from './agent-status-types'

const TRANSCRIPT_READ_MAX_BYTES = 1024 * 1024
const TRANSCRIPT_LINE_MAX_BYTES = 256 * 1024
const TURN_ID_MAX_LENGTH = 256

type JsonRecord = Record<string, unknown>

export type CodexRootTurnCompletion = {
  providerFailure?: AgentProviderFailure
}

export type CodexRootTurnTranscriptState = {
  filePath?: string
  trackedTurnId?: string
  turnId?: string
  offset: number
  carry: string
  completion?: CodexRootTurnCompletion
}

function record(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined
}

function readJsonlCursor(state: CodexRootTurnTranscriptState): JsonRecord[] | undefined {
  if (!state.filePath) {
    return undefined
  }
  let stats: Stats
  try {
    stats = statSync(state.filePath)
  } catch {
    return undefined
  }
  if (!stats.isFile()) {
    return undefined
  }
  if (stats.size < state.offset) {
    state.offset = 0
    state.carry = ''
  }
  if (stats.size === state.offset) {
    return []
  }
  const bytesToRead = Math.min(stats.size - state.offset, TRANSCRIPT_READ_MAX_BYTES)
  const start = stats.size - state.offset > bytesToRead ? stats.size - bytesToRead : state.offset
  const buffer = Buffer.allocUnsafe(bytesToRead)
  let bytesRead = 0
  let fd: number | undefined
  try {
    fd = openSync(state.filePath, 'r')
    bytesRead = readSync(fd, buffer, 0, bytesToRead, start)
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) {
      closeSync(fd)
    }
  }
  const skippedPrefix = start !== state.offset
  const content = `${skippedPrefix ? '' : state.carry}${buffer.toString('utf8', 0, bytesRead)}`
  const lines = content.split('\n')
  state.offset = start + bytesRead
  state.carry = lines.pop() ?? ''
  if (skippedPrefix) {
    lines.shift()
  }
  return lines.flatMap((line) => {
    if (Buffer.byteLength(line, 'utf8') > TRANSCRIPT_LINE_MAX_BYTES) {
      return []
    }
    try {
      const parsed = record(JSON.parse(line) as unknown)
      return parsed ? [parsed] : []
    } catch {
      return []
    }
  })
}

function readCompletion(
  recordValue: JsonRecord,
  expectedTurnId: string
): CodexRootTurnCompletion | undefined {
  if (recordValue.type !== 'event_msg') {
    return undefined
  }
  const payload = record(recordValue.payload)
  if (
    (payload?.type !== 'task_complete' && payload?.type !== 'turn_complete') ||
    payload.turn_id !== expectedTurnId
  ) {
    return undefined
  }
  const error = record(payload.error)
  return error?.codex_error_info === 'usage_limit_exceeded'
    ? { providerFailure: { kind: 'usage-limit-exceeded' } }
    : {}
}

export function createCodexRootTurnTranscriptState(): CodexRootTurnTranscriptState {
  return { offset: 0, carry: '' }
}

export function beginCodexRootTurnTranscript(
  state: CodexRootTurnTranscriptState,
  transcriptPath: string | undefined,
  turnId: string | undefined
): boolean {
  const normalizedPath = transcriptPath?.trim()
  const normalizedTurnId = turnId?.trim()
  if (
    !normalizedPath ||
    !isAbsolute(normalizedPath) ||
    extname(normalizedPath) !== '.jsonl' ||
    !normalizedTurnId ||
    normalizedTurnId.length > TURN_ID_MAX_LENGTH
  ) {
    return false
  }
  if (state.filePath === normalizedPath && state.trackedTurnId === normalizedTurnId) {
    return true
  }
  state.filePath = normalizedPath
  state.trackedTurnId = normalizedTurnId
  state.turnId = normalizedTurnId
  state.offset = 0
  state.carry = ''
  state.completion = undefined
  return true
}

export function reconcileCodexRootTurnTranscript(
  state: CodexRootTurnTranscriptState
): CodexRootTurnCompletion | undefined {
  if (!state.turnId) {
    return state.completion
  }
  for (const recordValue of readJsonlCursor(state) ?? []) {
    const completion = readCompletion(recordValue, state.turnId)
    if (!completion) {
      continue
    }
    state.completion = completion
    state.turnId = undefined
    return completion
  }
  return undefined
}

export function hasActiveCodexRootTurnTranscript(
  state: CodexRootTurnTranscriptState | undefined
): boolean {
  return Boolean(state?.turnId)
}

export function finishCodexRootTurnTranscript(state: CodexRootTurnTranscriptState): void {
  state.turnId = undefined
  state.completion = undefined
}
