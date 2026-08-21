// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { BarkosTask } from '../../../../shared/barkos/work-ledger'
import { BarkosTaskAuthorityReview } from './BarkosTaskAuthorityReview'
import { BarkosWorkerAuthorityReview } from './BarkosWorkerAuthorityReview'

let root: Root | null = null
globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

function task(): BarkosTask {
  return {
    id: 'release',
    objectiveId: 'objective',
    planId: 'plan',
    title: 'Release',
    spec: 'Build, test, and publish the release candidate.',
    requiredCapabilities: [],
    dependencyIds: [],
    status: 'ready',
    workspacePolicy: 'isolated-worktree',
    preferredEnvironmentId: null,
    risk: 'critical',
    approvalPolicy: 'none',
    orchestrationTaskId: 'task-release',
    createdAt: 1,
    updatedAt: 1
  }
}

describe('BarkOS authority review UI', () => {
  it('shows the exact task instruction and mandatory high-risk gate', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root?.render(<BarkosTaskAuthorityReview task={task()} />))

    expect(screen.getByText('Task and authority review')).toBeTruthy()
    expect(screen.getByText('Approval before start')).toBeTruthy()
    expect(screen.getByText('Build, test, and publish the release candidate.')).toBeTruthy()
  })

  it('makes full provider access and its operating-system scope explicit', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root?.render(<BarkosWorkerAuthorityReview mode="yolo" host="Local computer" />)
    )

    expect(screen.getByText('Full agent access')).toBeTruthy()
    expect(screen.getByText(/permission prompts are bypassed/i)).toBeTruthy()
    expect(screen.getByText(/not an operating-system sandbox/i)).toBeTruthy()
  })
})
