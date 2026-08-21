// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assignReadyBarkosTask } from '../../../../shared/barkos/assignment-state'
import { createBarkosCompany } from '../../../../shared/barkos/company'
import {
  createEmptyBarkosMemoryVault,
  parseBarkosMemoryVault
} from '../../../../shared/barkos/memory-vault'
import {
  createEmptyBarkosWorkLedger,
  parseBarkosWorkLedger,
  type BarkosWorkLedger
} from '../../../../shared/barkos/work-ledger'
import type { BarkosWorkerSessionBinding } from '../../../../shared/barkos/worker-session'
import { useAppStore } from '@/store'
import type { BarkosOrchestrationActions } from './use-barkos-orchestration-actions'
import { useBarkosOrchestrationActions } from './use-barkos-orchestration-actions'

const { materialize, dispatch, stop } = vi.hoisted(() => ({
  materialize: vi.fn(),
  dispatch: vi.fn(),
  stop: vi.fn()
}))

vi.mock('@/lib/barkos-orchestration-runtime', () => ({
  materializeBarkosPlanOnRuntime: materialize,
  dispatchBarkosAssignmentOnRuntime: dispatch,
  stopBarkosDispatchOnRuntime: stop
}))

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship reliable work.',
  leadName: 'Ada',
  now: 1
})

const session: BarkosWorkerSessionBinding = {
  workerId: company.leadWorkerId,
  agent: 'codex',
  targetId: '5:localworkspace-main',
  workspaceId: 'workspace-main',
  workspaceKind: 'worktree',
  executionHostId: 'local',
  tabId: 'tab-lead',
  state: 'created',
  launchedAt: 2
}

function ledger(materialized: boolean): BarkosWorkLedger {
  const empty = createEmptyBarkosWorkLedger(company.id, 1)
  return parseBarkosWorkLedger({
    ...empty,
    objectives: [
      {
        id: 'ship-release',
        companyId: company.id,
        title: 'Ship release',
        brief: 'Build and verify the release.',
        status: materialized ? 'active' : 'planned',
        activePlanId: 'release-plan',
        orchestrationBinding: materialized
          ? { runId: 'run-release', runtimeEnvironmentId: null }
          : null,
        createdByWorkerId: company.leadWorkerId,
        createdAt: 1,
        updatedAt: 2
      }
    ],
    plans: [
      {
        id: 'release-plan',
        objectiveId: 'ship-release',
        version: 1,
        status: materialized ? 'active' : 'approved',
        createdByWorkerId: company.leadWorkerId,
        tasks: [
          {
            id: 'build-release',
            objectiveId: 'ship-release',
            planId: 'release-plan',
            title: 'Build release',
            spec: 'Build and test the release.',
            requiredCapabilities: [],
            dependencyIds: [],
            status: 'ready',
            workspacePolicy: 'inherit',
            preferredEnvironmentId: null,
            risk: 'low',
            approvalPolicy: 'none',
            orchestrationTaskId: materialized ? 'task-build' : null,
            createdAt: 1,
            updatedAt: 2
          }
        ],
        createdAt: 1,
        approvedAt: 1
      }
    ],
    revision: materialized ? 2 : 1,
    updatedAt: 2
  })
}

function runningLedger(): BarkosWorkLedger {
  const assigned = assignReadyBarkosTask({
    ledger: ledger(true),
    company,
    taskId: 'build-release',
    now: 3
  }).ledger
  return parseBarkosWorkLedger({
    ...assigned,
    plans: assigned.plans.map((plan) => ({
      ...plan,
      tasks: plan.tasks.map((task) => ({ ...task, status: 'running', updatedAt: 4 }))
    })),
    assignments: assigned.assignments.map((assignment) => ({
      ...assignment,
      status: 'dispatched'
    })),
    dispatches: [
      {
        id: 'dispatch-build',
        assignmentId: assigned.assignments[0].id,
        taskId: 'build-release',
        workerId: company.leadWorkerId,
        attempt: 1,
        state: 'running',
        workspaceId: session.workspaceId,
        executionHostId: session.executionHostId,
        orchestrationRunId: 'run-release',
        orchestrationTaskId: 'task-build',
        orchestrationDispatchId: 'orca-dispatch-build',
        memoryDelivery: null,
        stop: null,
        error: null,
        createdAt: 3,
        startedAt: 4,
        finishedAt: null
      }
    ],
    revision: assigned.revision + 1,
    updatedAt: 4
  })
}

function stoppedLedger(): BarkosWorkLedger {
  const running = runningLedger()
  return parseBarkosWorkLedger({
    ...running,
    plans: running.plans.map((plan) => ({
      ...plan,
      tasks: plan.tasks.map((task) => ({ ...task, status: 'cancelled', updatedAt: 6 }))
    })),
    assignments: running.assignments.map((assignment) => ({
      ...assignment,
      status: 'rejected'
    })),
    dispatches: running.dispatches.map((entry) => ({
      ...entry,
      state: 'cancelled',
      stop: {
        state: 'completed',
        orchestrationDispatchId: entry.orchestrationDispatchId,
        workerTerminalHandle: 'terminal-lead',
        requestedAt: 5,
        dispatchStoppedAt: 5,
        terminalKilledAt: 6,
        settledAt: 6,
        error: null
      },
      finishedAt: 6
    })),
    revision: running.revision + 1,
    updatedAt: 6
  })
}

let root: Root | null = null
let actions: BarkosOrchestrationActions | null = null
const reload = vi.fn(() => Promise.resolve())
const assign = vi.fn()
const reassign = vi.fn()
const decide = vi.fn()
const onMessage = vi.fn()

function Probe({ value }: { value: BarkosWorkLedger }): React.JSX.Element | null {
  actions = useBarkosOrchestrationActions({
    company,
    ledger: value,
    workerSessions: { [company.leadWorkerId]: session },
    onMessage
  })
  return null
}

async function renderProbe(value: BarkosWorkLedger): Promise<void> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root?.render(<Probe value={value} />))
}

beforeEach(() => {
  materialize.mockReset().mockResolvedValue({ ledger: ledger(true) })
  dispatch.mockReset().mockResolvedValue({})
  stop.mockReset().mockResolvedValue({})
  assign.mockReset()
  reassign.mockReset()
  decide.mockReset()
  reload.mockClear()
  onMessage.mockClear()
  actions = null
  useAppStore.setState({
    agentStatusByPaneKey: {
      'tab-lead:leaf-lead': {
        state: 'working',
        prompt: '',
        updatedAt: 3,
        stateStartedAt: 3,
        agentType: 'codex',
        paneKey: 'tab-lead:leaf-lead',
        terminalHandle: 'terminal-lead',
        tabId: 'tab-lead',
        stateHistory: []
      }
    },
    loadBarkosWorkLedger: reload,
    assignBarkosReadyTask: assign,
    reassignBarkosStoppedTask: reassign,
    decideBarkosWorkDispatch: decide,
    barkosMemoryVault: null
  })
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  actions = null
  document.body.innerHTML = ''
})

describe('useBarkosOrchestrationActions', () => {
  it('prepares a plan with the exact lead terminal without dispatching', async () => {
    const value = ledger(false)
    await renderProbe(value)

    await act(async () => actions?.materializeObjective('ship-release'))

    expect(materialize).toHaveBeenCalledWith({
      ledger: value,
      objectiveId: 'ship-release',
      coordinator: session,
      coordinatorTerminalHandle: 'terminal-lead'
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledWith(company.id)
    expect(actions?.operation).toBeNull()
  })

  it('dispatches only the explicitly selected assignment and reloads authoritative state', async () => {
    const value = assignReadyBarkosTask({
      ledger: ledger(true),
      company,
      taskId: 'build-release',
      now: 3
    }).ledger
    await renderProbe(value)

    await act(async () => actions?.dispatchAssignment(value.assignments[0].id))

    expect(dispatch).toHaveBeenCalledWith({
      ledger: value,
      assignmentId: value.assignments[0].id,
      coordinator: session,
      coordinatorTerminalHandle: 'terminal-lead',
      worker: session,
      workerTerminalHandle: 'terminal-lead',
      memoryContext: null
    })
    expect(reload).toHaveBeenCalledWith(company.id)
    expect(actions?.operation).toBeNull()
  })

  it('assigns and dispatches eligible work as one user action', async () => {
    const value = ledger(true)
    const assigned = assignReadyBarkosTask({
      ledger: value,
      company,
      taskId: 'build-release',
      now: 3
    }).ledger
    assign.mockResolvedValue(assigned)
    await renderProbe(value)

    await act(async () => actions?.assignTask('build-release'))

    expect(assign).toHaveBeenCalledWith('build-release')
    expect(dispatch).toHaveBeenCalledWith({
      ledger: assigned,
      assignmentId: assigned.assignments[0].id,
      coordinator: session,
      coordinatorTerminalHandle: 'terminal-lead',
      worker: session,
      workerTerminalHandle: 'terminal-lead',
      memoryContext: null
    })
    expect(onMessage).toHaveBeenCalledWith(
      'Worker assigned and the exact task instruction was dispatched.'
    )
  })

  it('prepares, assigns, and dispatches an unbound task from the same user action', async () => {
    const value = ledger(false)
    const materialized = ledger(true)
    const assigned = assignReadyBarkosTask({
      ledger: materialized,
      company,
      taskId: 'build-release',
      now: 3
    }).ledger
    materialize.mockResolvedValue({ ledger: materialized })
    assign.mockResolvedValue(assigned)
    await renderProbe(value)

    await act(async () => actions?.assignTask('build-release'))

    expect(materialize).toHaveBeenCalledWith({
      ledger: value,
      objectiveId: 'ship-release',
      coordinator: session,
      coordinatorTerminalHandle: 'terminal-lead'
    })
    expect(assign).toHaveBeenCalledWith('build-release')
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ ledger: assigned }))
  })

  it('stops at the authority gate for protected work', async () => {
    const value = ledger(true)
    value.plans[0].tasks[0].risk = 'high'
    const assigned = assignReadyBarkosTask({
      ledger: value,
      company,
      taskId: 'build-release',
      now: 3
    }).ledger
    assign.mockResolvedValue(assigned)
    await renderProbe(value)

    await act(async () => actions?.assignTask('build-release'))

    expect(dispatch).not.toHaveBeenCalled()
    expect(onMessage).toHaveBeenCalledWith(
      'Worker assigned. Review the authority gate before starting this task.'
    )
  })

  it('dispatches protected work immediately after explicit approval', async () => {
    const value = ledger(true)
    value.plans[0].tasks[0].risk = 'high'
    const assigned = assignReadyBarkosTask({
      ledger: value,
      company,
      taskId: 'build-release',
      now: 3
    }).ledger
    const approved = {
      ...assigned,
      approvalGates: assigned.approvalGates.map((gate) => ({
        ...gate,
        status: 'approved' as const,
        resolution: 'Approved.',
        resolvedBy: 'user' as const,
        resolvedAt: 4
      })),
      revision: assigned.revision + 1,
      updatedAt: 4
    }
    decide.mockResolvedValue(approved)
    await renderProbe(assigned)

    await act(async () => actions?.decideDispatch(assigned.assignments[0].id, 'approved'))

    expect(dispatch).toHaveBeenCalledWith({
      ledger: approved,
      assignmentId: assigned.assignments[0].id,
      coordinator: session,
      coordinatorTerminalHandle: 'terminal-lead',
      worker: session,
      workerTerminalHandle: 'terminal-lead',
      memoryContext: null
    })
    expect(onMessage).toHaveBeenCalledWith(
      'Authority approved and the exact task instruction was dispatched.'
    )
  })

  it('selects exact task memory at the dispatch boundary', async () => {
    const value = assignReadyBarkosTask({
      ledger: ledger(true),
      company,
      taskId: 'build-release',
      now: 3
    }).ledger
    const emptyVault = createEmptyBarkosMemoryVault(company.id, company.createdAt, 1)
    useAppStore.setState({
      barkosMemoryVault: parseBarkosMemoryVault({
        ...emptyVault,
        entries: [
          {
            id: 'task-guidance',
            status: 'active',
            scope: { kind: 'task', targetId: 'build-release' },
            title: 'Release check',
            content: 'Run the accepted release check.',
            source: {
              kind: 'accepted-evidence',
              evidenceId: 'release-evidence',
              taskId: 'prior-task',
              assignmentId: 'prior-assignment',
              dispatchId: 'prior-dispatch',
              workerId: company.leadWorkerId,
              roleId: company.workers[0].roleId,
              workspaceId: session.workspaceId,
              capturedAt: 1
            },
            confidence: 90,
            expiresAt: null,
            contradictsMemoryIds: [],
            supersededByMemoryId: null,
            promotedBy: 'user',
            createdAt: 1,
            promotedAt: 2,
            revokedAt: null
          }
        ]
      })
    })
    await renderProbe(value)

    await act(async () => actions?.dispatchAssignment(value.assignments[0].id))

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryContext: {
          selectedMemoryIds: ['task-guidance'],
          text: expect.stringContaining('[task, 90%, source:release-evidence]')
        }
      })
    )
  })

  it('reports an older host without claiming memory was delivered', async () => {
    const value = assignReadyBarkosTask({
      ledger: ledger(true),
      company,
      taskId: 'build-release',
      now: 3
    }).ledger
    dispatch.mockResolvedValue({
      dispatch: { memoryDelivery: { state: 'unconfirmed' } }
    })
    await renderProbe(value)

    await act(async () => actions?.dispatchAssignment(value.assignments[0].id))

    expect(onMessage).toHaveBeenCalledWith(
      'Task started, but memory delivery could not be confirmed on this BarkOS host.'
    )
    expect(onMessage).not.toHaveBeenCalledWith('Work dispatched to the selected worker.')
  })

  it('stops the exact live worker runtime without consulting execution pause state', async () => {
    const value = runningLedger()
    await renderProbe(value)

    await act(async () => actions?.stopDispatch('dispatch-build'))

    expect(stop).toHaveBeenCalledWith({
      ledger: value,
      dispatchId: 'dispatch-build',
      worker: session,
      workerTerminalHandle: 'terminal-lead'
    })
    expect(reload).toHaveBeenCalledWith(company.id)
    expect(onMessage).toHaveBeenCalledWith(
      'Dispatch stopped and exact worker PTY termination was confirmed.'
    )
  })

  it('does not relaunch or stop when the exact live worker terminal is unavailable', async () => {
    const value = runningLedger()
    useAppStore.setState({ agentStatusByPaneKey: {} })
    await renderProbe(value)

    await act(async () => actions?.stopDispatch('dispatch-build'))

    expect(stop).not.toHaveBeenCalled()
    expect(actions?.error).toBe('Stopping requires the exact live worker terminal')
  })

  it('waits at a fresh authority gate after durable reassignment', async () => {
    const stopped = stoppedLedger()
    const replacement = {
      id: 'replacement-assignment',
      taskId: 'build-release',
      workerId: company.leadWorkerId,
      status: 'approved' as const,
      reason: 'Replacement after confirmed stop.',
      matchedCapabilities: [],
      activeLoadAtAssignment: 0,
      assignedAt: 7,
      approvedAt: 7
    }
    reassign.mockResolvedValue({
      ...stopped,
      plans: stopped.plans.map((plan) => ({
        ...plan,
        tasks: plan.tasks.map((task) => ({
          ...task,
          status: 'ready' as const,
          approvalPolicy: 'before-dispatch' as const,
          updatedAt: 7
        }))
      })),
      assignments: [{ ...stopped.assignments[0], status: 'reassigned' as const }, replacement],
      approvalGates: [
        {
          id: 'replacement-gate',
          taskId: 'build-release',
          assignmentId: replacement.id,
          kind: 'dispatch',
          status: 'pending',
          question: 'Allow replacement work?',
          requestedByWorkerId: company.leadWorkerId,
          resolution: null,
          resolvedBy: null,
          createdAt: 7,
          resolvedAt: null
        }
      ]
    })
    await renderProbe(stopped)

    await act(async () => actions?.reassignDispatch('dispatch-build'))

    expect(reassign).toHaveBeenCalledWith('dispatch-build')
    expect(dispatch).not.toHaveBeenCalled()
    expect(onMessage).toHaveBeenCalledWith(
      'Task reassigned to a different worker. Review the new authority gate before starting it.'
    )
  })
})
