// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BarkosMemoryCandidate } from '../../../../shared/barkos/memory-vault'
import { BarkosMemoryCandidateCard } from './BarkosMemoryCandidateCard'

const candidate: BarkosMemoryCandidate = {
  id: 'release-evidence',
  status: 'pending',
  scope: { kind: 'project', targetId: 'workspace-a' },
  title: 'Release guard',
  content: 'Keep the accepted release guard intact.',
  source: {
    kind: 'accepted-evidence',
    evidenceId: 'release-evidence',
    taskId: 'release-task',
    assignmentId: 'release-assignment',
    dispatchId: 'release-dispatch',
    workerId: 'ada',
    roleId: 'lead',
    workspaceId: 'workspace-a',
    capturedAt: 2
  },
  confidence: 80,
  expiresAt: null,
  createdAt: 2,
  lastSeenAt: 3,
  resolvedAt: null,
  promotedMemoryId: null
}

afterEach(cleanup)

describe('BarkOS memory candidate card', () => {
  it('shows provenance and requires an explicit promotion or rejection action', () => {
    const onPromote = vi.fn()
    const onReject = vi.fn()
    render(
      <BarkosMemoryCandidateCard
        candidate={candidate}
        activeMemories={[]}
        busy={false}
        onPromote={onPromote}
        onReject={onReject}
      />
    )
    expect(screen.getAllByText('release-evidence')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Promote to memory' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(onPromote).toHaveBeenCalledWith(candidate.id, {
      scope: { kind: 'project', targetId: 'workspace-a' },
      confidence: 80,
      expiresAt: null,
      contradictsMemoryIds: []
    })
    expect(onReject).toHaveBeenCalledWith(candidate.id)
  })

  it('blocks promotion when confidence is outside the contract', () => {
    const onPromote = vi.fn()
    render(
      <BarkosMemoryCandidateCard
        candidate={candidate}
        activeMemories={[]}
        busy={false}
        onPromote={onPromote}
        onReject={vi.fn()}
      />
    )

    fireEvent.change(screen.getByLabelText('Confidence (0–100)'), { target: { value: '101' } })

    expect(
      (screen.getByRole('button', { name: 'Promote to memory' }) as HTMLButtonElement).disabled
    ).toBe(true)
    expect(onPromote).not.toHaveBeenCalled()
  })
})
