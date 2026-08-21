// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import { createBarkosCompany } from '../../../../shared/barkos/company'
import { createEmptyBarkosUsageCostLedger } from '../../../../shared/barkos/usage-cost-ledger'
import type { BarkosWorkerSessionBinding } from '../../../../shared/barkos/worker-session'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import { useAppStore } from '@/store'
import { useBarkosUsageCost, type BarkosUsageCostController } from './use-barkos-usage-cost'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Account for exact work.',
  leadName: 'Ada',
  now: 1
})
const worker = company.workers[0]
const workLedger = {
  schemaVersion: 5,
  companyId: company.id,
  objectives: [],
  plans: [],
  assignments: [],
  dispatches: [
    {
      id: 'dispatch-one',
      assignmentId: 'assignment-one',
      taskId: 'task-one',
      workerId: worker.id,
      attempt: 1,
      state: 'succeeded',
      workspaceId: 'workspace-one',
      executionHostId: 'local',
      orchestrationRunId: 'run-one',
      orchestrationTaskId: 'runtime-task-one',
      orchestrationDispatchId: 'runtime-dispatch-one',
      memoryDelivery: null,
      stop: null,
      error: null,
      createdAt: 2,
      startedAt: 3,
      finishedAt: 4
    }
  ],
  evidence: [],
  approvalGates: [],
  revision: 0,
  createdAt: 1,
  updatedAt: 4
} as BarkosWorkLedger
const binding: BarkosWorkerSessionBinding = {
  workerId: worker.id,
  agent: 'codex',
  targetId: 'target-one',
  workspaceId: 'workspace-one',
  workspaceKind: 'worktree',
  executionHostId: 'local',
  tabId: 'tab-one',
  state: 'created',
  launchedAt: 2
}
const status = {
  state: 'done',
  prompt: 'Complete task one',
  updatedAt: 4,
  stateStartedAt: 3,
  agentType: 'codex',
  paneKey: 'tab-one:11111111-1111-4111-8111-111111111111',
  terminalHandle: 'terminal-one',
  worktreeId: 'workspace-one',
  connectionId: null,
  tabId: 'tab-one',
  stateHistory: [],
  providerSession: { key: 'session_id', id: 'provider-session-one' },
  orchestration: {
    taskId: 'runtime-task-one',
    dispatchId: 'runtime-dispatch-one',
    dispatchStatus: 'completed'
  }
} as AgentStatusEntry

const load = vi.fn()
const sync = vi.fn()
let root: Root | null = null
let controller: BarkosUsageCostController | null = null

function Probe(): React.JSX.Element | null {
  controller = useBarkosUsageCost({
    company,
    workLedger,
    workerSessions: { [worker.id]: binding },
    onMessage: vi.fn()
  })
  return null
}

beforeEach(async () => {
  load.mockReset().mockResolvedValue(null)
  sync
    .mockReset()
    .mockImplementation(async () => createEmptyBarkosUsageCostLedger(company.id, company.createdAt))
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { barkosUsageCost: { load, sync } }
  })
  useAppStore.setState({ agentStatusByPaneKey: { [status.paneKey]: status } })
  const element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
  await act(async () => root?.render(<Probe />))
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  controller = null
  document.body.replaceChildren()
})

describe('useBarkosUsageCost', () => {
  it('does not scan provider records until the user explicitly syncs', () => {
    expect(load).toHaveBeenCalledOnce()
    expect(sync).not.toHaveBeenCalled()
    expect(controller?.loadState).toBe('ready')
  })

  it('sends only the exact runtime Dispatch and provider-session identity', async () => {
    await act(async () => controller?.sync())

    expect(sync).toHaveBeenCalledWith({
      candidates: [
        {
          dispatchId: 'dispatch-one',
          orchestrationDispatchId: 'runtime-dispatch-one',
          providerSessionId: 'provider-session-one'
        }
      ]
    })
  })

  it('drops a sticky provider session when the runtime Dispatch identity differs', async () => {
    await act(async () => {
      useAppStore.setState({
        agentStatusByPaneKey: {
          [status.paneKey]: {
            ...status,
            orchestration: { ...status.orchestration!, dispatchId: 'different-dispatch' }
          }
        }
      })
    })
    await act(async () => controller?.sync())

    expect(sync).toHaveBeenCalledWith({
      candidates: [
        {
          dispatchId: 'dispatch-one',
          orchestrationDispatchId: null,
          providerSessionId: null
        }
      ]
    })
  })
})
