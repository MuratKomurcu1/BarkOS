// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BarkosEvidenceManifest } from '../../../../shared/barkos/work-ledger'
import { BarkosEvidenceReviewCard } from './BarkosEvidenceReviewCard'

let root: Root | null = null
globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

function manifest(): BarkosEvidenceManifest {
  return {
    id: 'release-evidence',
    taskId: 'verify-release',
    assignmentId: 'verify-assignment',
    dispatchId: 'verify-dispatch',
    status: 'submitted',
    tests: [
      {
        command: 'pnpm test',
        status: 'passed',
        summary: 'Focused tests passed.',
        durationMs: 300
      }
    ],
    changedFiles: [
      {
        path: 'src/release.ts',
        change: 'modified',
        summary: 'Added release verification.'
      }
    ],
    diffSummary: 'Added a verified release contract.',
    terminalExcerpts: [],
    screenshots: [
      {
        path: '/managed/evidence/abc.png',
        caption: 'Verified release screen',
        sha256: 'a'.repeat(64)
      }
    ],
    risks: ['Deployment remains a separate approval.'],
    unresolvedDecisions: [],
    producedAt: 4,
    reviewedAt: null
  }
}

describe('BarkosEvidenceReviewCard', () => {
  it('shows bounded evidence and exposes explicit accept and reject actions', async () => {
    const onReview = vi.fn(() => Promise.resolve())
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(
        <BarkosEvidenceReviewCard
          manifest={manifest()}
          taskTitle="Verify release"
          workerName="Ada"
          busy={false}
          onReview={onReview}
        />
      )
    })

    expect(screen.getByText('Verify release')).toBeTruthy()
    expect(screen.getByText('pnpm test')).toBeTruthy()
    expect(screen.getByText('Verified release screen')).toBeTruthy()
    expect(screen.getByText('abc.png')).toBeTruthy()
    expect(screen.getByTitle('a'.repeat(64))).toBeTruthy()
    expect(screen.getByText('Deployment remains a separate approval.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

    expect(onReview).toHaveBeenNthCalledWith(1, 'release-evidence', 'accepted')
    expect(onReview).toHaveBeenNthCalledWith(2, 'release-evidence', 'rejected')
  })

  it('prevents decisions while a ledger mutation is being persisted', async () => {
    const onReview = vi.fn(() => Promise.resolve())
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(
        <BarkosEvidenceReviewCard
          manifest={manifest()}
          taskTitle="Verify release"
          workerName="Ada"
          busy
          onReview={onReview}
        />
      )
    })

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Accept' }).disabled).toBe(true)
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Reject' }).disabled).toBe(true)
  })
})
