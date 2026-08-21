// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBarkosCompany } from '../../../../shared/barkos/company'
import { getDefaultSettings } from '../../../../shared/constants'
import { createEmptyBarkosProviderCapacityLedger } from '../../../../shared/barkos/provider-capacity-ledger'
import type { BarkosProviderCapacityLedger } from '../../../../shared/barkos/provider-capacity'
import type { ProviderRateLimits, RateLimitState } from '../../../../shared/rate-limit-types'
import type { BarkosWorkLedger } from '../../../../shared/barkos/work-ledger'
import { useAppStore } from '@/store'
import {
  useBarkosProviderCapacity,
  type BarkosProviderCapacityController
} from './use-barkos-provider-capacity'

const { fetchSnapshot, webClient } = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
  webClient: { value: false }
}))

vi.mock('@/runtime/runtime-provider-accounts-client', () => ({
  fetchProviderAccountsSnapshot: fetchSnapshot
}))

vi.mock('@/lib/web-client-location', () => ({
  isWebClientLocation: () => webClient.value
}))

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Route provider capacity.',
  leadName: 'Ada',
  now: 1
})
const ledger = createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 2)
const originalActions = {
  save: useAppStore.getState().saveBarkosProviderCapacity,
  load: useAppStore.getState().loadBarkosProviderCapacity,
  clear: useAppStore.getState().clearBarkosProviderCapacityError
}
const saveCapacity = vi.fn(async (value) => value)

function limits(): ProviderRateLimits {
  return {
    provider: 'codex',
    session: {
      usedPercent: 20,
      windowMinutes: 300,
      resetsAt: Date.now() + 60_000,
      resetDescription: null
    },
    weekly: null,
    updatedAt: Date.now(),
    error: null,
    status: 'ok'
  }
}

function rateLimits(): RateLimitState {
  return {
    claude: null,
    codex: limits(),
    gemini: null,
    opencodeGo: null,
    kimi: null,
    antigravity: null,
    minimax: null,
    grok: null,
    minimaxCookieConfigured: false,
    grokAuthConfigured: false,
    claudeTarget: { runtime: 'host', wslDistro: null },
    codexTarget: { runtime: 'host', wslDistro: null },
    inactiveClaudeAccounts: [],
    inactiveCodexAccounts: []
  }
}

function snapshot() {
  return {
    claude: {
      accounts: [],
      activeAccountId: null,
      activeAccountIdsByRuntime: { host: null, wsl: {} }
    },
    codex: {
      accounts: [
        {
          id: 'codex-one',
          email: 'one@example.test',
          managedHomeRuntime: 'host' as const,
          createdAt: 1,
          updatedAt: 1,
          lastAuthenticatedAt: 1
        }
      ],
      activeAccountId: 'codex-one',
      activeAccountIdsByRuntime: { host: 'codex-one', wsl: {} }
    },
    rateLimits: null
  }
}

let root: Root | null = null
let controller: BarkosProviderCapacityController | null = null
let probeLedger: BarkosProviderCapacityLedger = ledger
let probeWorkLedger: BarkosWorkLedger | null = null

function Probe(): React.JSX.Element | null {
  controller = useBarkosProviderCapacity({
    company,
    ledger: probeLedger,
    workLedger: probeWorkLedger,
    onMessage: vi.fn()
  })
  return null
}

beforeEach(() => {
  fetchSnapshot.mockReset().mockResolvedValue(snapshot())
  webClient.value = false
  saveCapacity.mockClear()
  controller = null
  probeLedger = ledger
  probeWorkLedger = null
  useAppStore.setState({
    barkosCompany: company,
    barkosProviderCapacity: ledger,
    barkosProviderCapacityLoadState: 'ready',
    settings: getDefaultSettings('/tmp'),
    rateLimits: rateLimits(),
    barkosWorkerSessions: {},
    agentStatusByPaneKey: {},
    saveBarkosProviderCapacity: saveCapacity,
    loadBarkosProviderCapacity: vi.fn(),
    clearBarkosProviderCapacityError: vi.fn()
  })
  const element = document.createElement('div')
  document.body.append(element)
  root = createRoot(element)
  act(() => root?.render(<Probe />))
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
  useAppStore.setState({
    saveBarkosProviderCapacity: originalActions.save,
    loadBarkosProviderCapacity: originalActions.load,
    clearBarkosProviderCapacityError: originalActions.clear
  })
})

describe('useBarkosProviderCapacity', () => {
  it('uses the local Orca usage snapshot without refreshing the provider', async () => {
    useAppStore.setState({
      settings: { ...getDefaultSettings('/tmp'), activeRuntimeEnvironmentId: null }
    })

    await act(async () => controller?.sync())

    const saved = saveCapacity.mock.calls[0]?.[0]
    expect(saved.accounts.find((entry) => entry.account.accountId === 'codex-one')).toMatchObject({
      account: { executionHostId: 'local' },
      status: 'available'
    })
  })

  it('does not relabel local usage as a remote host snapshot', async () => {
    useAppStore.setState({
      settings: { ...getDefaultSettings('/tmp'), activeRuntimeEnvironmentId: 'runtime-one' }
    })

    await act(async () => controller?.sync())

    const saved = saveCapacity.mock.calls[0]?.[0]
    expect(saved.accounts.find((entry) => entry.account.accountId === 'codex-one')).toMatchObject({
      account: { executionHostId: 'runtime:runtime-one' },
      status: 'unknown',
      reason: 'missing-snapshot'
    })
  })

  it('keeps desktop-only recovery actions out of the web client', () => {
    const worker = company.workers[0]
    probeLedger = {
      ...ledger,
      accounts: [
        {
          account: {
            provider: 'codex',
            accountId: 'codex-one',
            executionHostId: 'local',
            runtimeLane: { kind: 'host' }
          },
          active: true,
          status: 'limited',
          reason: 'usage-exhausted',
          usedPercent: 100,
          resetsAt: null,
          retryAt: null,
          sourceUpdatedAt: 3,
          observedAt: 3
        },
        {
          account: {
            provider: 'codex',
            accountId: 'codex-two',
            executionHostId: 'local',
            runtimeLane: { kind: 'host' }
          },
          active: false,
          status: 'available',
          reason: 'within-limits',
          usedPercent: 10,
          resetsAt: null,
          retryAt: null,
          sourceUpdatedAt: 3,
          observedAt: 3
        }
      ]
    }
    probeWorkLedger = {
      schemaVersion: 5,
      companyId: company.id,
      objectives: [],
      plans: [
        {
          id: 'plan-one',
          objectiveId: 'objective-one',
          version: 1,
          status: 'active',
          createdByWorkerId: worker.id,
          tasks: [
            {
              id: 'task-one',
              objectiveId: 'objective-one',
              planId: 'plan-one',
              title: 'Desktop recovery',
              spec: 'Recover this Dispatch.',
              requiredCapabilities: [],
              dependencyIds: [],
              status: 'running',
              workspacePolicy: 'inherit',
              preferredEnvironmentId: null,
              risk: 'low',
              approvalPolicy: 'none',
              orchestrationTaskId: 'orchestration-task-one',
              createdAt: 2,
              updatedAt: 3
            }
          ],
          createdAt: 2,
          approvedAt: 2
        }
      ],
      assignments: [
        {
          id: 'assignment-one',
          taskId: 'task-one',
          workerId: worker.id,
          status: 'dispatched',
          reason: 'The worker owns this task.',
          matchedCapabilities: [],
          activeLoadAtAssignment: 0,
          assignedAt: 2,
          approvedAt: 2
        }
      ],
      dispatches: [
        {
          id: 'dispatch-one',
          assignmentId: 'assignment-one',
          taskId: 'task-one',
          workerId: worker.id,
          attempt: 1,
          state: 'running',
          workspaceId: 'workspace-one',
          executionHostId: 'local',
          orchestrationRunId: 'run-one',
          orchestrationTaskId: 'orchestration-task-one',
          orchestrationDispatchId: 'orchestration-dispatch-one',
          memoryDelivery: null,
          stop: null,
          error: null,
          createdAt: 2,
          startedAt: 3,
          finishedAt: null
        }
      ],
      evidence: [],
      approvalGates: [],
      revision: 1,
      createdAt: 1,
      updatedAt: 3
    }
    useAppStore.setState({
      barkosWorkerSessions: {
        [worker.id]: {
          workerId: worker.id,
          agent: 'codex',
          targetId: 'workspace-one',
          workspaceId: 'workspace-one',
          workspaceKind: 'worktree',
          executionHostId: 'local',
          tabId: 'tab-one',
          state: 'created',
          launchedAt: 2
        }
      },
      agentStatusByPaneKey: {
        'tab-one:leaf-one': {
          state: 'done',
          prompt: 'Recover this Dispatch.',
          updatedAt: 3,
          stateStartedAt: 3,
          agentType: 'codex',
          paneKey: 'tab-one:leaf-one',
          terminalHandle: 'terminal-one',
          worktreeId: 'workspace-one',
          connectionId: null,
          tabId: 'tab-one',
          stateHistory: [],
          providerFailure: { kind: 'usage-limit-exceeded' },
          orchestration: {
            taskId: 'orchestration-task-one',
            dispatchId: 'orchestration-dispatch-one',
            dispatchStatus: 'dispatched'
          }
        }
      }
    })
    webClient.value = true

    act(() => root?.render(<Probe />))

    expect(controller?.recoverableDispatches).toEqual([])
    webClient.value = false
    act(() => root?.render(<Probe />))
    expect(controller?.recoverableDispatches).toEqual([
      { id: 'dispatch-one', taskTitle: 'Desktop recovery', workerName: worker.name }
    ])
  })
})
