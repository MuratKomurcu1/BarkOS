import { describe, expect, it } from 'vitest'
import { createBarkosObjectivePlan } from '../../../shared/barkos/objective-planner'
import {
  createEmptyBarkosWorkLedger,
  type BarkosWorkLedger
} from '../../../shared/barkos/work-ledger'
import { findRecoverableBarkosObjectiveTasks } from './barkos-autonomous-recovery'

function plannedLedger(title = 'Proje: ödeme akışını düzelt'): BarkosWorkLedger {
  const planned = createBarkosObjectivePlan({
    ledger: createEmptyBarkosWorkLedger('company-1', 1),
    input: {
      title,
      brief: 'Projeyi uygula.',
      createdByWorkerId: 'lead-1',
      tasks: [
        {
          draftId: 'implementation',
          title: 'Uygulamayı tamamla',
          spec: 'İşi tamamla ve doğrula.',
          requiredCapabilities: ['implementation'],
          dependencyDraftIds: [],
          workspacePolicy: 'folder',
          preferredEnvironmentId: null,
          risk: 'low',
          approvalPolicy: 'none'
        }
      ]
    },
    now: 2
  })
  return {
    ...planned,
    plans: planned.plans.map((plan) => ({
      ...plan,
      tasks: plan.tasks.map((task) => ({ ...task, orchestrationTaskId: 'runtime-task-1' }))
    }))
  }
}

describe('findRecoverableBarkosObjectiveTasks', () => {
  it('recovers materialized autonomous tasks but leaves manual objectives alone', () => {
    const autonomous = plannedLedger()
    const manual = plannedLedger('Elle hazırlanan hedef')

    expect([...findRecoverableBarkosObjectiveTasks(autonomous).values()]).toEqual([
      [autonomous.plans[0]?.tasks[0]?.id]
    ])
    expect(findRecoverableBarkosObjectiveTasks(manual).size).toBe(0)
  })

  it('does not bypass a pending or rejected dispatch decision', () => {
    const ledger = plannedLedger()
    const task = ledger.plans[0]?.tasks[0]
    if (!task) {
      throw new Error('test task missing')
    }
    const assignment = {
      id: 'assignment-1',
      taskId: task.id,
      workerId: 'worker-1',
      status: 'approved' as const,
      reason: 'Uygun çalışan.',
      matchedCapabilities: ['implementation'],
      activeLoadAtAssignment: 0,
      assignedAt: 3,
      approvedAt: 3
    }
    const withGate: BarkosWorkLedger = {
      ...ledger,
      assignments: [assignment],
      approvalGates: [
        {
          id: 'gate-1',
          taskId: task.id,
          assignmentId: assignment.id,
          kind: 'dispatch',
          status: 'pending',
          question: 'Görev başlatılsın mı?',
          requestedByWorkerId: 'lead-1',
          resolution: null,
          resolvedBy: null,
          createdAt: 3,
          resolvedAt: null
        }
      ]
    }

    expect(findRecoverableBarkosObjectiveTasks(withGate).size).toBe(0)
    expect(
      findRecoverableBarkosObjectiveTasks({
        ...withGate,
        assignments: [{ ...assignment, status: 'rejected' }],
        approvalGates: []
      }).size
    ).toBe(0)
  })

  it('does not create a duplicate after a dispatch exists', () => {
    const ledger = plannedLedger()
    const task = ledger.plans[0]?.tasks[0]
    if (!task) {
      throw new Error('test task missing')
    }

    expect(
      findRecoverableBarkosObjectiveTasks({
        ...ledger,
        dispatches: [
          {
            id: 'dispatch-1',
            assignmentId: 'assignment-1',
            taskId: task.id,
            workerId: 'worker-1',
            attempt: 1,
            state: 'running',
            workspaceId: 'workspace-1',
            executionHostId: 'local',
            orchestrationRunId: 'run-1',
            orchestrationTaskId: 'runtime-task-1',
            orchestrationDispatchId: 'runtime-dispatch-1',
            memoryDelivery: null,
            stop: null,
            error: null,
            createdAt: 3,
            startedAt: 3,
            finishedAt: null
          }
        ]
      }).size
    ).toBe(0)
  })
})
