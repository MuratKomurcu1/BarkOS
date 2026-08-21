import { create } from 'zustand'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBarkosCompany, type BarkosCompany } from '../../../../shared/barkos/company'
import { createDefaultBarkosControlPolicy } from '../../../../shared/barkos/control-policy'
import {
  createEmptyBarkosWorkLedger,
  type BarkosWorkLedger
} from '../../../../shared/barkos/work-ledger'
import type { AppState } from '../types'
import { createBarkosCompanySlice } from './barkos-company'
import { createBarkosControlPolicySlice } from './barkos-control-policy'
import { createBarkosWorkLedgerSlice } from './barkos-work-ledger'

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship reliable work.',
  leadName: 'Ada',
  now: 1
})
const reassignmentCompany: BarkosCompany = {
  ...company,
  workers: [
    ...company.workers,
    {
      id: 'grace',
      name: 'Grace',
      roleId: company.roles[0].id,
      agentId: 'codex',
      model: null,
      preferredEnvironmentId: null,
      workspacePolicy: 'inherit',
      status: 'available'
    }
  ]
}
const companyLoad = vi.fn()
const controlPolicyLoad = vi.fn()
const ledgerLoad = vi.fn()
const ledgerSave = vi.fn()

function createTestStore() {
  return create<AppState>()(
    (...args) =>
      ({
        ...createBarkosCompanySlice(...args),
        ...createBarkosControlPolicySlice(...args),
        ...createBarkosWorkLedgerSlice(...args)
      }) as unknown as AppState
  )
}

function submittedLedger(): BarkosWorkLedger {
  return {
    schemaVersion: 5,
    companyId: company.id,
    objectives: [
      {
        id: 'ship-release',
        companyId: company.id,
        title: 'Ship release',
        brief: 'Verify the release.',
        status: 'active',
        activePlanId: 'release-plan',
        orchestrationBinding: { runId: 'run_release', runtimeEnvironmentId: null },
        createdByWorkerId: company.leadWorkerId,
        createdAt: 1,
        updatedAt: 4
      }
    ],
    plans: [
      {
        id: 'release-plan',
        objectiveId: 'ship-release',
        version: 1,
        status: 'active',
        createdByWorkerId: company.leadWorkerId,
        tasks: [
          {
            id: 'verify-release',
            objectiveId: 'ship-release',
            planId: 'release-plan',
            title: 'Verify release',
            spec: 'Run the release checks.',
            requiredCapabilities: [],
            dependencyIds: [],
            status: 'review',
            workspacePolicy: 'inherit',
            preferredEnvironmentId: null,
            risk: 'low',
            approvalPolicy: 'none',
            orchestrationTaskId: 'task_verify',
            createdAt: 2,
            updatedAt: 4
          }
        ],
        createdAt: 2,
        approvedAt: 2
      }
    ],
    assignments: [
      {
        id: 'verify-assignment',
        taskId: 'verify-release',
        workerId: company.leadWorkerId,
        status: 'dispatched',
        reason: 'The lead owns release verification.',
        matchedCapabilities: [],
        activeLoadAtAssignment: 0,
        assignedAt: 2,
        approvedAt: 2
      }
    ],
    dispatches: [
      {
        id: 'verify-dispatch',
        assignmentId: 'verify-assignment',
        taskId: 'verify-release',
        workerId: company.leadWorkerId,
        attempt: 1,
        state: 'succeeded',
        workspaceId: 'main',
        executionHostId: 'local',
        orchestrationRunId: 'run_release',
        orchestrationTaskId: 'task_verify',
        orchestrationDispatchId: 'ctx_verify',
        memoryDelivery: null,
        stop: null,
        error: null,
        createdAt: 2,
        startedAt: 3,
        finishedAt: 4
      }
    ],
    evidence: [
      {
        id: 'verify-evidence',
        taskId: 'verify-release',
        assignmentId: 'verify-assignment',
        dispatchId: 'verify-dispatch',
        status: 'submitted',
        tests: [
          {
            command: 'pnpm test',
            status: 'passed',
            summary: 'All checks passed.',
            durationMs: 300
          }
        ],
        changedFiles: [],
        diffSummary: null,
        terminalExcerpts: [],
        screenshots: [],
        risks: [],
        unresolvedDecisions: [],
        producedAt: 4,
        reviewedAt: null
      }
    ],
    approvalGates: [],
    revision: 1,
    createdAt: 1,
    updatedAt: 4
  }
}

function materializedReadyLedger(approvalPolicy: 'none' | 'before-dispatch'): BarkosWorkLedger {
  const ledger = submittedLedger()
  return {
    ...ledger,
    plans: ledger.plans.map((plan) => ({
      ...plan,
      tasks: plan.tasks.map((task) => ({
        ...task,
        status: 'ready' as const,
        requiredCapabilities: [],
        approvalPolicy
      }))
    })),
    assignments: [],
    dispatches: [],
    evidence: [],
    revision: 1
  }
}

function stoppedLedger(): BarkosWorkLedger {
  const ledger = materializedReadyLedger('none')
  return {
    ...ledger,
    plans: ledger.plans.map((plan) => ({
      ...plan,
      tasks: plan.tasks.map((task) => ({ ...task, status: 'cancelled' as const, updatedAt: 4 }))
    })),
    assignments: [
      {
        id: 'stopped-assignment',
        taskId: 'verify-release',
        workerId: company.leadWorkerId,
        status: 'rejected',
        reason: 'Initial assignment.',
        matchedCapabilities: [],
        activeLoadAtAssignment: 0,
        assignedAt: 2,
        approvedAt: 2
      }
    ],
    dispatches: [
      {
        id: 'stopped-dispatch',
        assignmentId: 'stopped-assignment',
        taskId: 'verify-release',
        workerId: company.leadWorkerId,
        attempt: 1,
        state: 'cancelled',
        workspaceId: 'main',
        executionHostId: 'local',
        orchestrationRunId: 'run_release',
        orchestrationTaskId: 'task_verify',
        orchestrationDispatchId: 'orca-stopped-dispatch',
        memoryDelivery: null,
        stop: {
          state: 'completed',
          orchestrationDispatchId: 'orca-stopped-dispatch',
          workerTerminalHandle: 'terminal-1',
          requestedAt: 3,
          dispatchStoppedAt: 3,
          terminalKilledAt: 4,
          settledAt: 4,
          error: null
        },
        error: null,
        createdAt: 2,
        startedAt: 2,
        finishedAt: 4
      }
    ],
    revision: 2,
    updatedAt: 4
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
  companyLoad.mockReset()
  controlPolicyLoad.mockReset()
  controlPolicyLoad.mockResolvedValue(
    createDefaultBarkosControlPolicy(company.id, company.createdAt, 1)
  )
  ledgerLoad.mockReset()
  ledgerSave.mockReset()
  vi.stubGlobal('window', {
    api: {
      barkosCompany: { load: companyLoad },
      barkosControlPolicy: { load: controlPolicyLoad },
      barkosWorkLedger: { load: ledgerLoad, save: ledgerSave }
    }
  })
})

describe('BarkOS work-ledger slice', () => {
  it('loads the active company ledger into renderer state', async () => {
    const ledger = createEmptyBarkosWorkLedger(company.id, 2)
    ledgerLoad.mockResolvedValue(ledger)
    const store = createTestStore()
    store.setState({ barkosCompany: company, barkosCompanyLoadState: 'ready' })

    await store.getState().loadBarkosWorkLedger(company.id)

    expect(store.getState()).toMatchObject({
      barkosWorkLedger: ledger,
      barkosWorkLedgerLoadState: 'ready',
      barkosWorkLedgerRequestedCompanyId: company.id,
      barkosWorkLedgerError: null
    })
  })

  it('creates revision zero when the company has no ledger yet', async () => {
    ledgerLoad.mockResolvedValue(null)
    ledgerSave.mockImplementation(async (value: BarkosWorkLedger) => value)
    const store = createTestStore()
    store.setState({ barkosCompany: company, barkosCompanyLoadState: 'ready' })

    await store.getState().loadBarkosWorkLedger(company.id)

    expect(ledgerSave).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: company.id, revision: 0 })
    )
    expect(store.getState().barkosWorkLedgerLoadState).toBe('ready')
  })

  it('re-reads revision zero when another client wins initial creation', async () => {
    const raced = createEmptyBarkosWorkLedger(company.id, 2)
    ledgerLoad.mockResolvedValueOnce(null).mockResolvedValueOnce(raced)
    ledgerSave.mockRejectedValue(new Error('revision-conflict'))
    const store = createTestStore()
    store.setState({ barkosCompany: company, barkosCompanyLoadState: 'ready' })

    await store.getState().loadBarkosWorkLedger(company.id)

    expect(store.getState()).toMatchObject({
      barkosWorkLedger: raced,
      barkosWorkLedgerLoadState: 'ready',
      barkosWorkLedgerError: null
    })
  })

  it('does not let a stale company load replace a newer company ledger', async () => {
    const otherCompany = createBarkosCompany({
      name: 'Other Labs',
      mission: 'Handle the next objective.',
      leadName: 'Grace',
      now: 2
    })
    const firstLedger = createEmptyBarkosWorkLedger(company.id, 2)
    const secondLedger = createEmptyBarkosWorkLedger(otherCompany.id, 3)
    let resolveFirst: (ledger: BarkosWorkLedger) => void = () => undefined
    let resolveSecond: (ledger: BarkosWorkLedger) => void = () => undefined
    ledgerLoad
      .mockImplementationOnce(
        () =>
          new Promise<BarkosWorkLedger>((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<BarkosWorkLedger>((resolve) => {
            resolveSecond = resolve
          })
      )
    const store = createTestStore()
    store.setState({ barkosCompany: company, barkosCompanyLoadState: 'ready' })

    const firstLoad = store.getState().loadBarkosWorkLedger(company.id)
    store.setState({ barkosCompany: otherCompany })
    const secondLoad = store.getState().loadBarkosWorkLedger(otherCompany.id)
    resolveSecond(secondLedger)
    await secondLoad
    resolveFirst(firstLedger)
    await firstLoad

    expect(store.getState()).toMatchObject({
      barkosWorkLedger: secondLedger,
      barkosWorkLedgerLoadState: 'ready',
      barkosWorkLedgerRequestedCompanyId: otherCompany.id
    })
  })

  it('persists an evidence decision as the next revision', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5)
    ledgerSave.mockImplementation(async (value: BarkosWorkLedger) => value)
    const store = createTestStore()
    store.setState({
      barkosCompany: company,
      barkosCompanyLoadState: 'ready',
      barkosWorkLedger: submittedLedger(),
      barkosWorkLedgerLoadState: 'ready'
    })

    const saved = await store.getState().reviewBarkosWorkEvidence('verify-evidence', 'accepted')

    expect(saved).toMatchObject({ revision: 2 })
    expect(saved.evidence[0]).toMatchObject({ status: 'accepted', reviewedAt: 5 })
    expect(saved.objectives[0].status).toBe('completed')
    expect(store.getState().barkosWorkLedgerLoadState).toBe('ready')
  })

  it('persists an approved objective plan without dispatching work', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5)
    ledgerSave.mockImplementation(async (value: BarkosWorkLedger) => value)
    const store = createTestStore()
    store.setState({
      barkosCompany: company,
      barkosCompanyLoadState: 'ready',
      barkosWorkLedger: createEmptyBarkosWorkLedger(company.id, 1),
      barkosWorkLedgerLoadState: 'ready'
    })

    const saved = await store.getState().createBarkosObjectivePlan({
      title: 'Ship release',
      brief: 'Plan and verify the release.',
      tasks: [
        {
          draftId: 'task-1',
          title: 'Verify release',
          spec: 'Run all release checks.',
          requiredCapabilities: [],
          dependencyDraftIds: [],
          workspacePolicy: 'inherit',
          preferredEnvironmentId: null,
          risk: 'low',
          approvalPolicy: 'none'
        }
      ]
    })

    expect(saved).toMatchObject({
      revision: 1,
      objectives: [{ title: 'Ship release', createdByWorkerId: company.leadWorkerId }],
      plans: [{ status: 'approved' }],
      assignments: [],
      dispatches: []
    })
  })

  it('persists an explicit ready-task assignment without dispatching work', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5)
    ledgerSave.mockImplementation(async (value: BarkosWorkLedger) => value)
    const store = createTestStore()
    store.setState({
      barkosCompany: company,
      barkosCompanyLoadState: 'ready',
      barkosWorkLedger: materializedReadyLedger('none'),
      barkosWorkLedgerLoadState: 'ready'
    })

    const saved = await store.getState().assignBarkosReadyTask('verify-release')

    expect(saved.assignments).toEqual([
      expect.objectContaining({
        taskId: 'verify-release',
        workerId: company.leadWorkerId,
        status: 'approved',
        approvedAt: 5
      })
    ])
    expect(saved.dispatches).toEqual([])
    expect(saved.plans[0].tasks[0].status).toBe('ready')
  })

  it('persists reassignment before any replacement runtime work can start', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5)
    ledgerSave.mockImplementation(async (value: BarkosWorkLedger) => value)
    const store = createTestStore()
    store.setState({
      barkosCompany: reassignmentCompany,
      barkosCompanyLoadState: 'ready',
      barkosWorkLedger: stoppedLedger(),
      barkosWorkLedgerLoadState: 'ready'
    })

    const saved = await store.getState().reassignBarkosStoppedTask('stopped-dispatch')

    expect(saved.assignments).toEqual([
      expect.objectContaining({ id: 'stopped-assignment', status: 'reassigned' }),
      expect.objectContaining({ workerId: 'grace', status: 'approved', assignedAt: 5 })
    ])
    expect(saved.plans[0].tasks[0].status).toBe('ready')
    expect(ledgerSave).toHaveBeenCalledOnce()
  })

  it('blocks reassignment while execution is paused without mutating the ledger', async () => {
    controlPolicyLoad.mockResolvedValue({
      ...createDefaultBarkosControlPolicy(company.id, company.createdAt, 1),
      executionState: 'paused'
    })
    const store = createTestStore()
    store.setState({
      barkosCompany: reassignmentCompany,
      barkosCompanyLoadState: 'ready',
      barkosWorkLedger: stoppedLedger(),
      barkosWorkLedgerLoadState: 'ready'
    })

    await expect(store.getState().reassignBarkosStoppedTask('stopped-dispatch')).rejects.toThrow(
      'execution is paused'
    )
    expect(ledgerSave).not.toHaveBeenCalled()
  })

  it('persists the separate user decision for a protected dispatch', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(5)
    ledgerSave.mockImplementation(async (value: BarkosWorkLedger) => value)
    const store = createTestStore()
    store.setState({
      barkosCompany: company,
      barkosCompanyLoadState: 'ready',
      barkosWorkLedger: materializedReadyLedger('before-dispatch'),
      barkosWorkLedgerLoadState: 'ready'
    })
    const assigned = await store.getState().assignBarkosReadyTask('verify-release')
    store.setState({ barkosWorkLedger: assigned, barkosWorkLedgerLoadState: 'ready' })

    const approved = await store
      .getState()
      .decideBarkosWorkDispatch(assigned.assignments[0].id, 'approved')

    expect(approved.approvalGates[0]).toMatchObject({
      status: 'approved',
      resolvedBy: 'user',
      resolvedAt: 5
    })
    expect(approved.dispatches).toEqual([])
  })

  it('keeps the current ledger and exposes a persistence conflict', async () => {
    ledgerSave.mockRejectedValue(new Error('revision-conflict'))
    const current = submittedLedger()
    const store = createTestStore()
    store.setState({
      barkosCompany: company,
      barkosWorkLedger: current,
      barkosWorkLedgerLoadState: 'ready'
    })

    await expect(
      store.getState().reviewBarkosWorkEvidence('verify-evidence', 'rejected')
    ).rejects.toThrow('revision-conflict')
    expect(store.getState()).toMatchObject({
      barkosWorkLedger: current,
      barkosWorkLedgerLoadState: 'error',
      barkosWorkLedgerError: 'revision-conflict'
    })
  })
})
