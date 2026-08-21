// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BarkosProviderCapacityLedger } from '../../../../shared/barkos/provider-capacity'
import { BarkosProviderCapacity } from './BarkosProviderCapacity'

let root: Root | null = null
globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.replaceChildren()
})

function renderCapacity(
  ledger: BarkosProviderCapacityLedger,
  sync = vi.fn(() => Promise.resolve())
): ReturnType<typeof vi.fn> {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => {
    root?.render(
      <BarkosProviderCapacity
        ledger={ledger}
        loadState="ready"
        error={null}
        controller={{
          operation: null,
          error: null,
          checkableDispatches: [],
          recoverableDispatches: [],
          sync,
          retry: vi.fn(),
          check: vi.fn(),
          recover: vi.fn()
        }}
      />
    )
  })
  return sync
}

const emptyLedger: BarkosProviderCapacityLedger = {
  schemaVersion: 1,
  companyId: 'company-one',
  companyCreatedAt: 1,
  revision: 0,
  accounts: [],
  failovers: [],
  createdAt: 1,
  updatedAt: 1
}

describe('BarkosProviderCapacity', () => {
  it('states the snapshot-only boundary and syncs only after a user click', async () => {
    const sync = renderCapacity(emptyLedger)

    expect(screen.getByText(/does not refresh a provider or change an account/)).toBeTruthy()
    expect(screen.getByText(/Account recovery runs only when you choose/)).toBeTruthy()
    expect(sync).not.toHaveBeenCalled()
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Sync BarkOS snapshot' }))
    )
    expect(sync).toHaveBeenCalledOnce()
  })

  it('renders the exact host and runtime lane from a stored observation', () => {
    renderCapacity({
      ...emptyLedger,
      revision: 1,
      accounts: [
        {
          account: {
            provider: 'codex',
            accountId: 'account-one',
            executionHostId: 'runtime:server-one',
            runtimeLane: { kind: 'wsl', distro: 'Ubuntu' }
          },
          active: true,
          status: 'available',
          reason: 'within-limits',
          usedPercent: 20,
          resetsAt: null,
          retryAt: null,
          sourceUpdatedAt: 2,
          observedAt: 2
        }
      ]
    })

    expect(screen.getByText('account-one')).toBeTruthy()
    expect(screen.getByText('runtime:server-one · WSL · Ubuntu')).toBeTruthy()
    expect(screen.getByText('20%')).toBeTruthy()
  })

  it('offers only an explicit Dispatch recovery action and shows its durable history', async () => {
    const recover = vi.fn(() => Promise.resolve())
    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root?.render(
        <BarkosProviderCapacity
          ledger={{
            ...emptyLedger,
            failovers: [
              {
                id: 'failover-one',
                taskId: 'task-one',
                assignmentId: 'assignment-one',
                dispatchId: 'dispatch-one',
                workerId: 'worker-one',
                provider: 'codex',
                executionHostId: 'local',
                runtimeLane: { kind: 'host' },
                attemptCeiling: 3,
                attempts: [
                  {
                    sequence: 1,
                    account: {
                      provider: 'codex',
                      accountId: 'codex-two',
                      executionHostId: 'local',
                      runtimeLane: { kind: 'host' }
                    },
                    outcome: 'failed',
                    conversationMode: 'same-conversation',
                    reason: 'execution-failed',
                    startedAt: 2,
                    settledAt: 2
                  }
                ],
                state: 'stopped',
                stopReason: 'no-eligible-account',
                createdAt: 2,
                updatedAt: 2
              }
            ]
          }}
          loadState="ready"
          error={null}
          controller={{
            operation: null,
            error: null,
            checkableDispatches: [
              { id: 'dispatch-two', taskTitle: 'Build release', workerName: 'Ada' }
            ],
            recoverableDispatches: [
              { id: 'dispatch-two', taskTitle: 'Build release', workerName: 'Ada' }
            ],
            sync: vi.fn(),
            retry: vi.fn(),
            check: vi.fn(),
            recover
          }}
        />
      )
    })

    expect(screen.getByText('Recovery history')).toBeTruthy()
    expect(screen.getByText('Stopped')).toBeTruthy()
    expect(screen.getByText(/Same conversation/)).toBeTruthy()
    expect(screen.queryByText(/same-conversation/)).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Recover Dispatch' })))
    expect(recover).toHaveBeenCalledWith('dispatch-two')
  })

  it('checks current recovery eligibility before offering account mutation', async () => {
    const check = vi.fn(() => Promise.resolve())
    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    act(() => {
      root?.render(
        <BarkosProviderCapacity
          ledger={emptyLedger}
          loadState="ready"
          error={null}
          controller={{
            operation: null,
            error: null,
            checkableDispatches: [
              { id: 'dispatch-check', taskTitle: 'Check limits', workerName: 'Ada' }
            ],
            recoverableDispatches: [],
            sync: vi.fn(),
            retry: vi.fn(),
            check,
            recover: vi.fn()
          }}
        />
      )
    })

    expect(screen.queryByRole('button', { name: 'Recover Dispatch' })).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Check recovery' })))
    expect(check).toHaveBeenCalledWith('dispatch-check')
  })
})
