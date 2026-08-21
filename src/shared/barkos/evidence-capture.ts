import { stripAnsiEscapeSequences } from '../ansi-escape-sequences'
import type { GitStatusEntry } from '../git-status-types'
import type { BarkosEvidenceCapture } from './evidence-review'
import type { BarkosWorkLedger } from './work-ledger'

export const BARKOS_EVIDENCE_TERMINAL_ROWS = 120
export const BARKOS_EVIDENCE_TERMINAL_EXCERPT_LIMIT = 4_000
export const BARKOS_EVIDENCE_CHANGED_FILE_LIMIT = 500
export const BARKOS_EVIDENCE_PATH_LIMIT = 2_048

type ChangedFileEvidence = BarkosEvidenceCapture['changedFiles'][number]
type TestEvidence = BarkosEvidenceCapture['tests'][number]

export type BarkosTestEvidenceDraft = {
  command: string
  status: TestEvidence['status']
  summary: string
  durationMs: number | null
}

const CHANGE_PRIORITY: Record<ChangedFileEvidence['change'], number> = {
  modified: 0,
  added: 1,
  renamed: 2,
  deleted: 3
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/

function evidenceChange(status: GitStatusEntry['status']): ChangedFileEvidence['change'] {
  switch (status) {
    case 'untracked':
    case 'added':
    case 'copied':
      return 'added'
    case 'deleted':
      return 'deleted'
    case 'renamed':
      return 'renamed'
    case 'modified':
      return 'modified'
  }
}

function entrySummary(entry: GitStatusEntry): string {
  const parts: string[] = [entry.area]
  if (entry.oldPath) {
    parts.push(`from ${entry.oldPath}`)
  }
  if (typeof entry.added === 'number' || typeof entry.removed === 'number') {
    parts.push(`+${entry.added ?? 0}/-${entry.removed ?? 0}`)
  }
  if (entry.conflictStatus) {
    parts.push(entry.conflictStatus.replace('_', ' '))
  }
  return parts.join(' · ').slice(0, 1_000)
}

export function collectBarkosChangedFileEvidence(entries: readonly GitStatusEntry[]): {
  changedFiles: ChangedFileEvidence[]
  truncated: boolean
} {
  const byPath = new Map<string, ChangedFileEvidence>()
  for (const entry of entries) {
    const path = entry.path.trim().slice(0, BARKOS_EVIDENCE_PATH_LIMIT)
    if (!path) {
      continue
    }
    const next: ChangedFileEvidence = {
      path,
      change: evidenceChange(entry.status),
      summary: entrySummary(entry)
    }
    const current = byPath.get(path)
    if (!current) {
      byPath.set(path, next)
      continue
    }
    const change =
      CHANGE_PRIORITY[next.change] > CHANGE_PRIORITY[current.change] ? next.change : current.change
    const summaries = new Set(
      [current.summary, next.summary].filter((value): value is string => Boolean(value))
    )
    byPath.set(path, {
      path,
      change,
      summary: [...summaries].join(' | ').slice(0, 1_000) || null
    })
  }
  const all = [...byPath.values()].toSorted((left, right) => left.path.localeCompare(right.path))
  return {
    changedFiles: all.slice(0, BARKOS_EVIDENCE_CHANGED_FILE_LIMIT),
    truncated: all.length > BARKOS_EVIDENCE_CHANGED_FILE_LIMIT
  }
}

function stripUnsupportedTerminalControls(value: string): string {
  let result = ''
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (code === 9 || code === 10 || code >= 32) {
      result += character
    }
  }
  return result
}

export function collectBarkosTerminalEvidence(
  rawTerminal: string | null,
  label: string
): BarkosEvidenceCapture['terminalExcerpts'][number] | null {
  if (!rawTerminal) {
    return null
  }
  const plain = stripUnsupportedTerminalControls(stripAnsiEscapeSequences(rawTerminal))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
  if (!plain) {
    return null
  }
  return {
    label: label.trim().slice(0, 80) || 'Worker terminal',
    excerpt: plain.slice(-BARKOS_EVIDENCE_TERMINAL_EXCERPT_LIMIT)
  }
}

function boundedLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20)
    .map((line) => line.slice(0, 2_000))
}

export function buildBarkosEvidenceCapture(args: {
  changedFiles: ChangedFileEvidence[]
  changedFilesTruncated: boolean
  terminalEvidence: BarkosEvidenceCapture['terminalExcerpts'][number] | null
  tests: readonly BarkosTestEvidenceDraft[]
  screenshots: readonly BarkosEvidenceCapture['screenshots'][number][]
  diffSummary: string
  risks: string
  unresolvedDecisions: string
}): BarkosEvidenceCapture {
  const tests = args.tests
    .filter((test) => test.command.trim() !== '' && test.summary.trim() !== '')
    .slice(0, 100)
    .map((test) => ({
      command: test.command.trim().slice(0, 2_000),
      status: test.status,
      summary: test.summary.trim().slice(0, 1_000),
      durationMs:
        test.durationMs === null
          ? null
          : Math.max(0, Math.min(86_400_000, Math.floor(test.durationMs)))
    }))
  const risks = boundedLines(args.risks)
  if (args.changedFilesTruncated) {
    risks.unshift('Changed-file evidence was capped at 500 paths; review the full Git status.')
  }
  return {
    tests,
    changedFiles: args.changedFiles.slice(0, BARKOS_EVIDENCE_CHANGED_FILE_LIMIT),
    diffSummary: args.diffSummary.trim().slice(0, 8_000) || null,
    terminalExcerpts: args.terminalEvidence ? [args.terminalEvidence] : [],
    screenshots: args.screenshots
      .filter((screenshot) => screenshot.path.trim() !== '' && screenshot.caption.trim() !== '')
      .slice(0, 20)
      .map((screenshot) => {
        const digest = screenshot.sha256?.trim().toLowerCase() ?? ''
        return {
          path: screenshot.path.trim().slice(0, BARKOS_EVIDENCE_PATH_LIMIT),
          caption: screenshot.caption.trim().slice(0, 1_000),
          sha256: SHA256_PATTERN.test(digest) ? digest : null
        }
      }),
    risks: risks.slice(0, 20),
    unresolvedDecisions: boundedLines(args.unresolvedDecisions)
  }
}

function boundedEvidenceId(dispatchId: string, sequence: number): string {
  const suffix = `-${sequence}`
  const prefix = 'evidence-'
  const source = dispatchId.slice(0, 64 - prefix.length - suffix.length).replace(/-+$/g, '')
  return `${prefix}${source}${suffix}`
}

export function nextBarkosEvidenceId(ledger: BarkosWorkLedger, dispatchId: string): string {
  const used = new Set(ledger.evidence.map((manifest) => manifest.id))
  for (let sequence = used.size + 1; sequence <= used.size + 2_001; sequence += 1) {
    const candidate = boundedEvidenceId(dispatchId, sequence)
    if (!used.has(candidate)) {
      return candidate
    }
  }
  throw new RangeError('Could not allocate a unique evidence identifier')
}
