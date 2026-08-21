// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BarkosEvidenceSubmissionDialog } from './BarkosEvidenceSubmissionDialog'
import type { BarkosEvidenceSourceDraft } from './use-barkos-evidence-submission'

let root: Root | null = null
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const source: BarkosEvidenceSourceDraft = {
  dispatchId: 'dispatch-one',
  taskTitle: 'Verify release',
  workerName: 'Ada',
  changedFiles: [
    {
      path: 'src/release.ts',
      change: 'modified',
      summary: 'unstaged · +2/-1'
    }
  ],
  changedFilesTruncated: false,
  gitSnapshotSource: 'fresh',
  gitCapturedAt: Date.UTC(2026, 7, 17, 12, 0, 0),
  terminalEvidence: { label: 'Ada terminal', excerpt: 'pnpm test\n1 test passed' },
  collectingTerminal: false,
  collectingGit: false,
  collectionNotices: []
}

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

describe('BarkosEvidenceSubmissionDialog', () => {
  it('shows collected sources and submits only through the explicit review action', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const onSubmit = vi.fn(() => Promise.resolve())
    await act(async () => {
      root?.render(
        <BarkosEvidenceSubmissionDialog
          draft={source}
          saving={false}
          error={null}
          onClose={vi.fn()}
          onRunTest={vi.fn()}
          onSubmit={onSubmit}
        />
      )
    })

    expect(screen.getByText(/Fresh workspace status captured at/)).toBeTruthy()
    expect(
      (screen.getByLabelText('Terminal excerpt (optional)') as HTMLTextAreaElement).value
    ).toBe('pnpm test\n1 test passed')
    expect(screen.getByText(/only acceptance completes the task/)).toBeTruthy()

    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }))
    )

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        tests: [],
        terminalExcerpt: 'pnpm test\n1 test passed'
      })
    )
  })

  it('does not enable an empty evidence submission', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(
        <BarkosEvidenceSubmissionDialog
          draft={{
            ...source,
            changedFiles: [],
            gitSnapshotSource: 'unavailable',
            gitCapturedAt: null,
            terminalEvidence: null
          }}
          saving={false}
          error={null}
          onClose={vi.fn()}
          onRunTest={vi.fn()}
          onSubmit={vi.fn(() => Promise.resolve())}
        />
      )
    })

    expect(screen.getByRole('button', { name: 'Submit for review' }).hasAttribute('disabled')).toBe(
      true
    )
  })

  it('runs an explicit validation command and records its bounded result', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const onRunTest = vi.fn().mockResolvedValue({
      status: 'passed',
      summary: 'Exited with code 0. 12 tests passed',
      durationMs: 321
    })
    await act(async () => {
      root?.render(
        <BarkosEvidenceSubmissionDialog
          draft={source}
          saving={false}
          error={null}
          onClose={vi.fn()}
          onRunTest={onRunTest}
          onSubmit={vi.fn(() => Promise.resolve())}
        />
      )
    })

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add test' })))
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'pnpm test' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Run test' })))

    expect(onRunTest).toHaveBeenCalledWith('pnpm test')
    expect((screen.getByLabelText('Result summary') as HTMLInputElement).value).toContain(
      '12 tests passed'
    )
    expect((screen.getByLabelText('Duration (ms, optional)') as HTMLInputElement).value).toBe('321')
  })

  it('shows a usable message when the command contract rejects execution', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(
        <BarkosEvidenceSubmissionDialog
          draft={source}
          saving={false}
          error={null}
          onClose={vi.fn()}
          onRunTest={vi.fn().mockRejectedValue(new Error('barkos_test_command_not_validation'))}
          onSubmit={vi.fn(() => Promise.resolve())}
        />
      )
    })

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add test' })))
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'rm -rf build' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Run test' })))

    expect(screen.getByRole('alert').textContent).toContain('Use one validation command')
    expect(screen.getByRole('alert').textContent).not.toContain('barkos_test_command')
  })

  it('keeps manual evidence available when a paired host lacks the capability', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(
        <BarkosEvidenceSubmissionDialog
          draft={source}
          saving={false}
          error={null}
          onClose={vi.fn()}
          onRunTest={vi
            .fn()
            .mockRejectedValue(new Error('barkos_test_paired_runtime_capability_missing'))}
          onSubmit={vi.fn(() => Promise.resolve())}
        />
      )
    })

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Add test' })))
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'pnpm test' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Run test' })))

    expect(screen.getByRole('alert').textContent).toContain('Update the host')
    expect(screen.getByLabelText('Result summary')).toBeTruthy()
  })
})
