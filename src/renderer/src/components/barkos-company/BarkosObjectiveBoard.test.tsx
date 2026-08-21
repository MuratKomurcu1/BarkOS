// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBarkosCompany } from '../../../../shared/barkos/company'
import { assignReadyBarkosTask } from '../../../../shared/barkos/assignment-state'
import {
  createEmptyBarkosWorkLedger,
  parseBarkosWorkLedger,
  type BarkosWorkLedger
} from '../../../../shared/barkos/work-ledger'
import { BarkosObjectiveBoard } from './BarkosObjectiveBoard'

let root: Root | null = null
globalThis.IS_REACT_ACT_ENVIRONMENT = true

afterEach(async () => {
  await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
})

const company = createBarkosCompany({
  name: 'BarkOS Labs',
  mission: 'Ship reliable work.',
  leadName: 'Ada',
  now: 1
})

function objectiveLedger(materialized: boolean): BarkosWorkLedger {
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
            spec: 'Implement and test the release.',
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

function runningObjectiveLedger(): BarkosWorkLedger {
  const assigned = assignReadyBarkosTask({
    ledger: objectiveLedger(true),
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
        id: 'dispatch-build-release',
        assignmentId: assigned.assignments[0].id,
        taskId: 'build-release',
        workerId: assigned.assignments[0].workerId,
        attempt: 1,
        state: 'running',
        workspaceId: 'workspace-main',
        executionHostId: 'local',
        orchestrationRunId: 'run-release',
        orchestrationTaskId: 'task-build',
        orchestrationDispatchId: 'orca-dispatch',
        memoryDelivery: {
          receiptId: 'memory-build-release-1',
          state: 'delivered',
          memoryIds: ['release-memory'],
          contextSha256: 'a'.repeat(64),
          characterCount: 100,
          preparedAt: 3,
          deliveredAt: 4
        },
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

function stoppedObjectiveLedger(state: 'completed' | 'uncertain'): BarkosWorkLedger {
  const running = runningObjectiveLedger()
  return parseBarkosWorkLedger({
    ...running,
    plans: running.plans.map((plan) => ({
      ...plan,
      tasks: plan.tasks.map((task) => ({
        ...task,
        status: state === 'completed' ? 'cancelled' : task.status,
        updatedAt: 6
      }))
    })),
    assignments: running.assignments.map((assignment) => ({
      ...assignment,
      status: state === 'completed' ? 'rejected' : assignment.status
    })),
    dispatches: running.dispatches.map((dispatch) => ({
      ...dispatch,
      state: state === 'completed' ? 'cancelled' : dispatch.state,
      stop: {
        state,
        orchestrationDispatchId: 'orca-dispatch',
        workerTerminalHandle: 'terminal-lead',
        requestedAt: 5,
        dispatchStoppedAt: state === 'completed' ? 6 : null,
        terminalKilledAt: state === 'completed' ? 6 : null,
        settledAt: 6,
        error: state === 'uncertain' ? 'Stop response was ambiguous.' : null
      },
      finishedAt: state === 'completed' ? 6 : null
    })),
    revision: running.revision + 1,
    updatedAt: 6
  })
}

function renderBoard(
  ledger: BarkosWorkLedger,
  overrides: Partial<React.ComponentProps<typeof BarkosObjectiveBoard>> = {}
): void {
  const container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  root.render(
    <BarkosObjectiveBoard
      company={company}
      ledger={ledger}
      loadState="ready"
      error={null}
      onRetry={vi.fn()}
      onCreateObjective={vi.fn()}
      onReview={vi.fn(() => Promise.resolve())}
      operation={null}
      terminalReadyWorkerIds={[]}
      workerSessionStates={{}}
      onMaterializeObjective={vi.fn(() => Promise.resolve())}
      onAssignTask={vi.fn(() => Promise.resolve())}
      onDecideDispatch={vi.fn(() => Promise.resolve())}
      onDispatchAssignment={vi.fn(() => Promise.resolve())}
      onStopDispatch={vi.fn(() => Promise.resolve())}
      onReassignDispatch={vi.fn(() => Promise.resolve())}
      onSubmitEvidence={vi.fn(() => Promise.resolve())}
      {...overrides}
    />
  )
}

describe('BarkosObjectiveBoard', () => {
  it('renders a durable empty ledger without inventing sample work', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const onCreateObjective = vi.fn()
    root = createRoot(container)
    await act(async () => {
      root?.render(
        <BarkosObjectiveBoard
          company={company}
          ledger={createEmptyBarkosWorkLedger(company.id, 2)}
          loadState="ready"
          error={null}
          onRetry={vi.fn()}
          onCreateObjective={onCreateObjective}
          onReview={vi.fn(() => Promise.resolve())}
          operation={null}
          terminalReadyWorkerIds={[]}
          workerSessionStates={{}}
          onMaterializeObjective={vi.fn(() => Promise.resolve())}
          onAssignTask={vi.fn(() => Promise.resolve())}
          onDecideDispatch={vi.fn(() => Promise.resolve())}
          onDispatchAssignment={vi.fn(() => Promise.resolve())}
          onStopDispatch={vi.fn(() => Promise.resolve())}
          onReassignDispatch={vi.fn(() => Promise.resolve())}
          onSubmitEvidence={vi.fn(() => Promise.resolve())}
        />
      )
    })

    expect(screen.getByText('No objectives yet')).toBeTruthy()
    expect(screen.getByText('No evidence is waiting for review.')).toBeTruthy()
    expect(screen.getByText('0/0')).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Create objective' })))
    expect(onCreateObjective).toHaveBeenCalledOnce()
  })

  it('requires the live lead terminal before preparation or one-click execution', async () => {
    const onMaterializeObjective = vi.fn(() => Promise.resolve())
    await act(async () =>
      renderBoard(objectiveLedger(false), {
        onMaterializeObjective,
        terminalReadyWorkerIds: []
      })
    )

    const prepare = screen.getByRole('button', { name: 'Prepare in BarkOS' })
    expect(prepare.hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('Launch the lead worker from the Company tab first.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Assign and start' }).hasAttribute('disabled')).toBe(
      true
    )
    expect(screen.getByText('Launch the company lead before starting work.')).toBeTruthy()
    expect(onMaterializeObjective).not.toHaveBeenCalled()
  })

  it('offers one-click assignment and start with an explicit retry fallback', async () => {
    const onAssignTask = vi.fn(() => Promise.resolve())
    await act(async () =>
      renderBoard(objectiveLedger(true), {
        onAssignTask,
        terminalReadyWorkerIds: [company.leadWorkerId]
      })
    )

    expect(screen.queryByRole('button', { name: 'Start work' })).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Assign and start' })))
    expect(onAssignTask).toHaveBeenCalledWith('build-release')

    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    const assigned = assignReadyBarkosTask({
      ledger: objectiveLedger(true),
      company,
      taskId: 'build-release',
      now: 3
    }).ledger
    const onDispatchAssignment = vi.fn(() => Promise.resolve())
    await act(async () =>
      renderBoard(assigned, {
        onDispatchAssignment,
        terminalReadyWorkerIds: [],
        workerSessionStates: { [company.leadWorkerId]: 'relaunch-required' }
      })
    )

    expect(
      screen.getByText('Starting verifies or relaunches the saved worker target before dispatch.')
    ).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Start work' })))
    expect(onDispatchAssignment).toHaveBeenCalledWith(assigned.assignments[0].id)
  })

  it('offers evidence submission only for a running dispatch', async () => {
    const onSubmitEvidence = vi.fn(() => Promise.resolve())
    await act(async () =>
      renderBoard(runningObjectiveLedger(), {
        onSubmitEvidence,
        terminalReadyWorkerIds: [company.leadWorkerId]
      })
    )

    expect(screen.getByText(/1 memory records delivered · memory-build-release-1/)).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Submit evidence' })))
    expect(onSubmitEvidence).toHaveBeenCalledWith('dispatch-build-release')
  })

  it('requires destructive confirmation before stopping and closing the worker terminal', async () => {
    const onStopDispatch = vi.fn(() => Promise.resolve())
    await act(async () =>
      renderBoard(runningObjectiveLedger(), {
        onStopDispatch,
        terminalReadyWorkerIds: [company.leadWorkerId]
      })
    )

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stop work' })))
    expect(onStopDispatch).not.toHaveBeenCalled()
    expect(screen.getByText(/close Ada’s live worker terminal/)).toBeTruthy()
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Stop and close terminal' }))
    )
    expect(onStopDispatch).toHaveBeenCalledWith('dispatch-build-release')
  })

  it('shows durable completion or uncertainty without offering a retry', async () => {
    await act(async () => renderBoard(stoppedObjectiveLedger('completed')))
    expect(
      screen.getByText('Stopped · Dispatch authority and worker terminal termination confirmed.')
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Stop work' })).toBeNull()

    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    await act(async () => renderBoard(stoppedObjectiveLedger('uncertain')))
    expect(screen.getByText(/Stop result is uncertain/)).toBeTruthy()
    expect(screen.getByText('Stop response was ambiguous.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Stop work' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Submit evidence' })).toBeNull()
  })

  it('requires confirmation before reassigning from a completed stop', async () => {
    const onReassignDispatch = vi.fn(() => Promise.resolve())
    await act(async () => renderBoard(stoppedObjectiveLedger('completed'), { onReassignDispatch }))

    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Reassign and start' }))
    )
    expect(onReassignDispatch).not.toHaveBeenCalled()
    expect(screen.getByText(/preserve Ada’s confirmed stop as audit history/)).toBeTruthy()
    const confirm = screen.getAllByRole('button', { name: 'Reassign and start' }).at(-1)
    if (!confirm) {
      throw new Error('Reassignment confirmation was not rendered')
    }
    await act(async () => fireEvent.click(confirm))
    expect(onReassignDispatch).toHaveBeenCalledWith('dispatch-build-release')
  })
})
