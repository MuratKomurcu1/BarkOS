import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBarkosCompany } from '../../../shared/barkos/company'
import { createDefaultBarkosControlPolicy } from '../../../shared/barkos/control-policy'
import type { BarkosProviderCapacityLedger } from '../../../shared/barkos/provider-capacity'
import { createEmptyBarkosProviderCapacityLedger } from '../../../shared/barkos/provider-capacity-ledger'
import { appendBarkosProviderFailoverSelection } from '../../../shared/barkos/provider-failover-policy'
import type { BarkosWorkLedger } from '../../../shared/barkos/work-ledger'

const mocks = vi.hoisted(() => ({
  accountMutation: vi.fn(),
  ensure: vi.fn(),
  launch: vi.fn(),
  loadWorkLedger: vi.fn(),
  replace: vi.fn(),
  resolveStatus: vi.fn(),
  saveCapacity: vi.fn(),
  validate: vi.fn()
}))

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({
      agentStatusByPaneKey: { source: { state: 'done' } },
      loadWorkLedger: mocks.loadWorkLedger,
      saveBarkosProviderCapacity: mocks.saveCapacity
    })
  }
}))
vi.mock('../../../shared/barkos/provider-failover-execution', () => ({
  validateBarkosCodexLocalFailoverEligibility: mocks.validate
}))
vi.mock('./barkos-orchestration-target', () => ({
  resolveBarkosWorkerTerminalStatus: mocks.resolveStatus
}))
vi.mock('./ensure-barkos-worker-session', () => ({
  ensureBarkosWorkerSessionReady: mocks.ensure
}))
vi.mock('./barkos-codex-account-mutation', () => ({
  executeBarkosCodexAccountMutationOnDesktop: mocks.accountMutation
}))
vi.mock('./launch-barkos-codex-failover-session', () => ({
  launchBarkosCodexFailoverSession: mocks.launch
}))
vi.mock('./barkos-orchestration-runtime', () => ({
  replaceBarkosCodexDispatchOnRuntime: mocks.replace
}))

import { executeBarkosCodexLocalFailover } from './barkos-codex-failover'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship dependable systems.',
  leadName: 'Ada',
  now: 1
})
const binding = {
  workerId: company.leadWorkerId,
  agent: 'codex' as const,
  targetId: 'target-1',
  workspaceId: 'workspace-1',
  workspaceKind: 'worktree' as const,
  executionHostId: 'local' as const,
  tabId: 'tab-old',
  state: 'created' as const,
  launchedAt: 2
}
const sourceStatus = {
  state: 'done' as const,
  prompt: 'Build.',
  updatedAt: 3,
  stateStartedAt: 3,
  agentType: 'codex' as const,
  paneKey: 'tab-old:leaf-1',
  terminalHandle: 'terminal-old',
  tabId: 'tab-old',
  worktreeId: 'workspace-1',
  connectionId: null,
  sessionBoundary: false,
  providerFailure: { kind: 'usage-limit-exceeded' as const },
  stateHistory: [],
  orchestration: {
    taskId: 'orca-task-1',
    dispatchId: 'ctx-old',
    dispatchStatus: 'dispatched'
  },
  providerSession: {
    key: 'session_id' as const,
    id: 'session-1',
    transcriptPath: '/managed/a/sessions/2026/08/18/rollout-session-1.jsonl'
  }
}
const workLedger = {
  dispatches: [
    {
      id: 'dispatch-1',
      workerId: company.leadWorkerId,
      orchestrationDispatchId: 'ctx-old'
    }
  ]
} as BarkosWorkLedger

function capacityLedger(): BarkosProviderCapacityLedger {
  return {
    ...createEmptyBarkosProviderCapacityLedger(company.id, company.createdAt, 1),
    accounts: [
      {
        account: {
          provider: 'codex',
          accountId: 'account-a',
          executionHostId: 'local',
          runtimeLane: { kind: 'host' }
        },
        active: true,
        status: 'limited',
        reason: 'usage-exhausted',
        usedPercent: 100,
        resetsAt: 100,
        retryAt: null,
        sourceUpdatedAt: 3,
        observedAt: 3
      },
      {
        account: {
          provider: 'codex',
          accountId: 'account-b',
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
}

beforeEach(() => {
  mocks.accountMutation.mockReset()
  mocks.ensure.mockReset().mockResolvedValue({
    binding,
    terminalHandle: 'terminal-old',
    state: 'done',
    providerSession: sourceStatus.providerSession
  })
  mocks.launch.mockReset().mockResolvedValue({
    binding: { ...binding, tabId: 'tab-new' },
    terminalHandle: 'terminal-new',
    state: 'done',
    providerSession: sourceStatus.providerSession
  })
  mocks.loadWorkLedger.mockReset().mockResolvedValue(undefined)
  mocks.replace.mockReset()
  mocks.resolveStatus.mockReset().mockReturnValue(sourceStatus)
  mocks.saveCapacity.mockReset().mockImplementation(async (ledger) => ledger)
  mocks.validate.mockReset().mockReturnValue({
    eligible: true,
    task: { id: 'task-1' },
    assignment: { id: 'assignment-1' },
    dispatch: {
      id: 'dispatch-1',
      orchestrationDispatchId: 'ctx-old'
    },
    worker: company.workers[0],
    binding,
    status: sourceStatus,
    limitedAccount: capacityLedger().accounts[0],
    audit: null,
    conversationMode: 'same-conversation'
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      api: {
        barkosControlPolicy: {
          load: vi.fn(async () =>
            createDefaultBarkosControlPolicy(company.id, company.createdAt, 1)
          )
        },
        barkosWorkerSessions: {
          load: vi.fn(async () => ({
            schemaVersion: 1,
            companyId: company.id,
            companyCreatedAt: company.createdAt,
            revision: 1,
            bindings: [binding],
            updatedAt: 2
          }))
        }
      }
    }
  })
})

function applyAccountMutation(): void {
  mocks.accountMutation.mockImplementation(async (args) => {
    const audit = appendBarkosProviderFailoverSelection({
      audit: args.audit,
      account: args.account,
      conversationMode: 'unknown',
      sourceOrchestrationDispatchId: args.sourceOrchestrationDispatchId,
      now: 4
    })
    return { status: 'applied', ledger: args.ledger, audit }
  })
}

describe('BarkOS Codex local failover', () => {
  it('does not mutate an account while company execution is paused', async () => {
    const running = createDefaultBarkosControlPolicy(company.id, company.createdAt, 1)
    vi.mocked(window.api.barkosControlPolicy.load).mockResolvedValue({
      ...running,
      executionState: 'paused'
    })

    await expect(
      executeBarkosCodexLocalFailover({
        company,
        workLedger,
        capacityLedger: capacityLedger(),
        dispatchId: 'dispatch-1'
      })
    ).rejects.toThrow('execution is paused')
    expect(mocks.accountMutation).not.toHaveBeenCalled()
    expect(mocks.ensure).not.toHaveBeenCalled()
  })

  it('carries source and replacement authority through the durable success audit', async () => {
    applyAccountMutation()
    mocks.replace.mockImplementation(async (args) => {
      const replacement = await args.launchReplacement()
      return {
        ledger: workLedger,
        dispatch: { orchestrationDispatchId: 'ctx-new' },
        replacement
      }
    })

    const result = await executeBarkosCodexLocalFailover({
      company,
      workLedger,
      capacityLedger: capacityLedger(),
      dispatchId: 'dispatch-1'
    })

    expect(result).toMatchObject({
      status: 'succeeded',
      audit: {
        state: 'succeeded',
        attempts: [
          {
            sourceOrchestrationDispatchId: 'ctx-old',
            replacementOrchestrationDispatchId: 'ctx-new',
            conversationMode: 'same-conversation'
          }
        ]
      }
    })
    expect(mocks.replace).toHaveBeenCalledWith(expect.objectContaining({ rebindCoordinator: true }))
    expect(mocks.launch).toHaveBeenCalledWith(
      expect.objectContaining({ targetAccountId: 'account-b' })
    )
  })

  it('freezes the audit when a post-selection side effect fails', async () => {
    applyAccountMutation()
    mocks.replace.mockRejectedValue(new Error('old PTY stop unproven'))

    await expect(
      executeBarkosCodexLocalFailover({
        company,
        workLedger,
        capacityLedger: capacityLedger(),
        dispatchId: 'dispatch-1'
      })
    ).rejects.toThrow('old PTY stop unproven')

    expect(mocks.saveCapacity).toHaveBeenCalledWith(
      expect.objectContaining({
        failovers: [
          expect.objectContaining({
            state: 'uncertain',
            stopReason: 'ambiguous-side-effect'
          })
        ]
      })
    )
  })
})
