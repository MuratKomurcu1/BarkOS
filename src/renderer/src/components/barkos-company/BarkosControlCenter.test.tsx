// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultBarkosControlPolicy } from '../../../../shared/barkos/control-policy'
import { createEmptyBarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import { BarkosControlCenter } from './BarkosControlCenter'

const policy = createDefaultBarkosControlPolicy('barkos-labs', 1, 2)

afterEach(cleanup)

describe('BarkOS control center', () => {
  it('pauses new work without claiming to stop active agents', async () => {
    const onUpdate = vi.fn(async (updates) => ({ ...policy, ...updates, revision: 1 }))
    render(
      <BarkosControlCenter
        policy={policy}
        ledger={createEmptyBarkosWorkLedger('barkos-labs', 1)}
        loadState="ready"
        error={null}
        onRetry={vi.fn()}
        onUpdate={onUpdate}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Pause new work' }))
    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ executionState: 'paused', maxConcurrentDispatches: 4 })
      )
    )
    expect(
      screen.getByText(/It does not terminate agents or terminals that are already running/)
    ).toBeTruthy()
  })

  it('submits bounded execution limits', async () => {
    const onUpdate = vi.fn(async (updates) => ({ ...policy, ...updates, revision: 1 }))
    render(
      <BarkosControlCenter
        policy={policy}
        ledger={createEmptyBarkosWorkLedger('barkos-labs', 1)}
        loadState="ready"
        error={null}
        onRetry={vi.fn()}
        onUpdate={onUpdate}
      />
    )

    fireEvent.change(screen.getByLabelText('Active Dispatches'), { target: { value: '6' } })
    fireEvent.change(screen.getByLabelText('Assignments per worker'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Dispatch budget'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }))

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith({
        executionState: 'running',
        maxConcurrentDispatches: 6,
        maxActiveAssignmentsPerWorker: 3,
        maxDispatchesPerObjective: 120
      })
    )
  })

  it('offers recovery when no policy can be loaded', () => {
    render(
      <BarkosControlCenter
        policy={null}
        ledger={null}
        loadState="error"
        error="Policy unavailable"
        onRetry={vi.fn()}
        onUpdate={vi.fn()}
      />
    )
    expect(screen.getByRole('alert').textContent).toContain('Policy unavailable')
    expect(screen.getByRole('button', { name: 'Reload controls' })).toBeTruthy()
  })
})
