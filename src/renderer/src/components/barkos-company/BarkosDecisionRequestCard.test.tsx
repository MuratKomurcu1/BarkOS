// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseBarkosDecisionRequest,
  type BarkosDecisionRequest
} from '../../../../shared/barkos/decision-inbox'
import { BarkosDecisionRequestCard } from './BarkosDecisionRequestCard'

let root: Root | null = null
globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

function request(overrides: Partial<BarkosDecisionRequest> = {}): BarkosDecisionRequest {
  return parseBarkosDecisionRequest({
    id: 'question:run-release:message-question',
    sourceKind: 'question',
    status: 'pending',
    resolutionKind: null,
    taskId: 'build-release',
    assignmentId: 'build-assignment',
    dispatchId: 'build-dispatch',
    requestedByWorkerId: 'grace',
    risk: 'high',
    executionHostId: 'local',
    orchestrationRunId: 'run-release',
    orchestrationTaskId: 'orca-task',
    orchestrationDispatchId: 'orca-dispatch',
    orchestrationMessageId: 'message-question',
    orchestrationGateId: null,
    question: 'Which database?',
    details: 'Choose the durable default.',
    options: [],
    priority: 'normal',
    proposedResolution: null,
    resolution: null,
    createdAt: 1,
    lastSeenAt: 1,
    resolvedAt: null,
    ...overrides
  })
}

async function renderCard(
  value: BarkosDecisionRequest,
  onResolve = vi.fn(),
  currentRunId: string | null = 'run-release'
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      <BarkosDecisionRequestCard
        request={value}
        taskTitle="Build release"
        workerName="Grace"
        currentRunId={currentRunId}
        onResolve={onResolve}
      />
    )
  })
  return onResolve
}

describe('BarkosDecisionRequestCard', () => {
  it('offers only exact approval controls for a local tool side effect', async () => {
    const sideEffect = request({
      id: `side-effect:build-dispatch:${'a'.repeat(64)}:1`,
      sourceKind: 'side-effect',
      orchestrationMessageId: null,
      question: 'Allow Bash to perform this destructive action?',
      options: [],
      sideEffect: {
        categories: ['destructive'],
        toolName: 'Bash',
        toolInputSha256: 'a'.repeat(64),
        summary: 'Bash: rm -rf build',
        paneKey: 'tab-1:11111111-1111-4111-8111-111111111111',
        expiresAt: 10_000,
        consumedAt: null
      }
    })
    const onResolve = await renderCard(
      sideEffect,
      vi.fn(() => Promise.resolve()),
      null
    )

    expect(screen.queryByLabelText('Response')).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Approve' })))

    expect(onResolve).toHaveBeenCalledWith(sideEffect, 'approved', 'Approved by the user.')
  })

  it('submits a specific free-form answer for the exact request', async () => {
    const onResolve = await renderCard(
      request(),
      vi.fn(() => Promise.resolve())
    )

    fireEvent.change(screen.getByLabelText('Response'), {
      target: { value: '  Use PostgreSQL.  ' }
    })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send response' })))

    expect(onResolve).toHaveBeenCalledWith(request(), 'answered', 'Use PostgreSQL.')
  })

  it('uses one-click options and disables requests from another current Run', async () => {
    const onResolve = await renderCard(
      request({ options: ['PostgreSQL', 'SQLite'] }),
      vi.fn(() => Promise.resolve())
    )

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'PostgreSQL' })))
    expect(onResolve).toHaveBeenCalledWith(
      request({ options: ['PostgreSQL', 'SQLite'] }),
      'answered',
      'PostgreSQL'
    )

    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
      root?.render(
        <BarkosDecisionRequestCard
          request={request()}
          taskTitle="Build release"
          workerName="Grace"
          currentRunId="other-run"
          onResolve={onResolve}
        />
      )
    })

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Send response' }).disabled).toBe(
      true
    )
    expect(screen.getByText(/current BarkOS Run/)).toBeTruthy()
  })
})
