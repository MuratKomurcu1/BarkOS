import { describe, expect, it } from 'vitest'
import type { GitStatusEntry } from '../git-status-types'
import {
  buildBarkosEvidenceCapture,
  collectBarkosChangedFileEvidence,
  collectBarkosTerminalEvidence,
  nextBarkosEvidenceId
} from './evidence-capture'
import { createEmptyBarkosWorkLedger } from './work-ledger'

describe('BarkOS evidence capture', () => {
  it('deduplicates staged and unstaged Git rows into bounded file evidence', () => {
    const entries: GitStatusEntry[] = [
      { path: 'src/a.ts', status: 'modified', area: 'unstaged', added: 2, removed: 1 },
      { path: 'src/a.ts', status: 'modified', area: 'staged', added: 3, removed: 0 },
      { path: 'src/new.ts', status: 'untracked', area: 'untracked' },
      { path: 'src/old.ts', status: 'deleted', area: 'staged' }
    ]

    expect(collectBarkosChangedFileEvidence(entries)).toEqual({
      changedFiles: [
        {
          path: 'src/a.ts',
          change: 'modified',
          summary: 'unstaged · +2/-1 | staged · +3/-0'
        },
        { path: 'src/new.ts', change: 'added', summary: 'untracked' },
        { path: 'src/old.ts', change: 'deleted', summary: 'staged' }
      ],
      truncated: false
    })
  })

  it('strips terminal control sequences and keeps only the bounded tail', () => {
    const terminal = collectBarkosTerminalEvidence(
      `old\n\u001b[31mpnpm test\u001b[0m\n${'x'.repeat(4_100)}`,
      'Ada terminal'
    )

    expect(terminal?.label).toBe('Ada terminal')
    expect(terminal?.excerpt).not.toContain('\u001b')
    expect(terminal?.excerpt.length).toBe(4_000)
    expect(terminal?.excerpt.endsWith('x'.repeat(100))).toBe(true)
  })

  it('normalizes Git paths to the persisted evidence boundary', () => {
    const evidence = collectBarkosChangedFileEvidence([
      { path: `  ${'a'.repeat(2_100)}`, status: 'modified', area: 'unstaged' },
      { path: '   ', status: 'untracked', area: 'untracked' }
    ])

    expect(evidence.changedFiles).toHaveLength(1)
    expect(evidence.changedFiles[0]?.path).toHaveLength(2_048)
  })

  it('builds explicit test and review fields without inventing evidence', () => {
    const capture = buildBarkosEvidenceCapture({
      changedFiles: [],
      changedFilesTruncated: true,
      terminalEvidence: null,
      screenshots: [
        {
          path: ' /tmp/release.png ',
          caption: ' Release UI ',
          sha256: 'A'.repeat(64)
        }
      ],
      tests: [
        {
          command: ' pnpm test ',
          status: 'passed',
          summary: ' focused tests passed ',
          durationMs: 12.9
        },
        { command: '', status: 'skipped', summary: '', durationMs: null }
      ],
      diffSummary: ' Added verification. ',
      risks: 'One risk\n\nSecond risk',
      unresolvedDecisions: 'Choose release time'
    })

    expect(capture.tests).toEqual([
      {
        command: 'pnpm test',
        status: 'passed',
        summary: 'focused tests passed',
        durationMs: 12
      }
    ])
    expect(capture.risks).toEqual([
      'Changed-file evidence was capped at 500 paths; review the full Git status.',
      'One risk',
      'Second risk'
    ])
    expect(capture.unresolvedDecisions).toEqual(['Choose release time'])
    expect(capture.screenshots).toEqual([
      {
        path: '/tmp/release.png',
        caption: 'Release UI',
        sha256: 'a'.repeat(64)
      }
    ])
  })

  it('allocates a bounded manifest id without collisions', () => {
    const ledger = createEmptyBarkosWorkLedger('barkos-labs', 1)
    expect(nextBarkosEvidenceId(ledger, `dispatch-${'a'.repeat(60)}`)).toMatch(
      /^evidence-dispatch-a+-1$/
    )
    expect(nextBarkosEvidenceId(ledger, 'dispatch-one').length).toBeLessThanOrEqual(64)
  })
})
