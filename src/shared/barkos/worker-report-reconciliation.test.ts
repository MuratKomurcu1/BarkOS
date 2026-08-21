import { describe, expect, it } from 'vitest'
import { createBarkosCompany } from './company'
import { createBarkosObjectivePlan } from './objective-planner'
import { createEmptyBarkosWorkLedger } from './work-ledger'
import { reconcileBarkosWorkerReport } from './worker-report-reconciliation'

function runningAnalysisLedger() {
  const company = createBarkosCompany({
    name: 'BarkOS',
    mission: 'Projeleri incele.',
    leadName: 'Mira',
    now: 1
  })
  const planned = createBarkosObjectivePlan({
    ledger: createEmptyBarkosWorkLedger(company.id, 1),
    input: {
      title: 'Projeyi incele',
      brief: 'Projeyi tara.',
      createdByWorkerId: company.leadWorkerId,
      tasks: [
        {
          draftId: 'analysis',
          title: 'Analiz',
          spec: 'Dosyaları oku.',
          requiredCapabilities: ['project-analysis'],
          dependencyDraftIds: [],
          workspacePolicy: 'folder',
          preferredEnvironmentId: null,
          risk: 'low',
          approvalPolicy: 'none'
        },
        {
          draftId: 'lead',
          title: 'Planla',
          spec: 'Ekibi planla.',
          requiredCapabilities: ['planning', 'delegation'],
          dependencyDraftIds: ['analysis'],
          workspacePolicy: 'inherit',
          preferredEnvironmentId: null,
          risk: 'low',
          approvalPolicy: 'none'
        }
      ]
    },
    now: 2
  })
  const task = planned.plans[0].tasks[0]
  return {
    taskId: task.id,
    ledger: {
      ...planned,
      objectives: planned.objectives.map((objective) => ({
        ...objective,
        status: 'active' as const,
        orchestrationBinding: { runId: 'run-1', runtimeEnvironmentId: null }
      })),
      plans: planned.plans.map((plan) => ({
        ...plan,
        status: 'active' as const,
        tasks: plan.tasks.map((entry) =>
          entry.id === task.id
            ? { ...entry, status: 'running' as const, orchestrationTaskId: 'task-runtime' }
            : entry
        )
      })),
      assignments: [
        {
          id: 'assignment-analysis',
          taskId: task.id,
          workerId: company.leadWorkerId,
          status: 'dispatched' as const,
          reason: 'test',
          matchedCapabilities: ['project-analysis'],
          activeLoadAtAssignment: 0,
          assignedAt: 3,
          approvedAt: 3
        }
      ],
      dispatches: [
        {
          id: 'dispatch-analysis',
          assignmentId: 'assignment-analysis',
          taskId: task.id,
          workerId: company.leadWorkerId,
          attempt: 1,
          state: 'running' as const,
          workspaceId: 'folder-1',
          executionHostId: 'local',
          orchestrationRunId: 'run-1',
          orchestrationTaskId: 'task-runtime',
          orchestrationDispatchId: 'dispatch-runtime',
          memoryDelivery: null,
          stop: null,
          error: null,
          createdAt: 3,
          startedAt: 3,
          finishedAt: null
        }
      ],
      revision: planned.revision + 1,
      updatedAt: 3
    }
  }
}

describe('BarkOS worker report reconciliation', () => {
  it('accepts bounded read-only analysis evidence and unlocks the lead task', () => {
    const fixture = runningAnalysisLedger()
    const result = reconcileBarkosWorkerReport({
      ledger: fixture.ledger,
      orchestrationTaskId: 'task-runtime',
      result: JSON.stringify({
        provenance: 'worker_report',
        outcome: 'succeeded',
        messageId: 'message-1',
        subject: 'Analiz tamamlandı',
        body: 'Mimari incelendi. Riskler yazıldı. Görevler önerildi.',
        filesModified: ['.barkos/reports/project.md'],
        reportPath: '.barkos/reports/project.md',
        staffingProposal: null
      }),
      now: 4
    })

    expect(result).toMatchObject({ changed: true, accepted: true })
    expect(result.ledger.dispatches[0]).toMatchObject({ state: 'succeeded', finishedAt: 4 })
    expect(result.ledger.evidence[0]).toMatchObject({
      id: 'evidence-analysis',
      status: 'accepted'
    })
    expect(result.ledger.plans[0].tasks[1]).toMatchObject({ status: 'ready' })
    expect(result.ledger.revision).toBe(fixture.ledger.revision + 1)
  })
})
