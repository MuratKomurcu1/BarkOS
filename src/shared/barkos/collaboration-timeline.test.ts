import { describe, expect, it } from 'vitest'
import { createBarkosCompany } from './company'
import { projectBarkosCollaborationTimeline } from './collaboration-timeline'
import { createEmptyBarkosWorkLedger, parseBarkosWorkLedger } from './work-ledger'

describe('projectBarkosCollaborationTimeline', () => {
  it('projects persisted dispatch and report records into a worker conversation', () => {
    const company = createBarkosCompany({
      name: 'BarkOS',
      mission: 'Üret',
      leadName: 'Atlas',
      agentId: 'codex',
      now: 1
    })
    const lead = company.workers[0]
    const ledger = parseBarkosWorkLedger({
      ...createEmptyBarkosWorkLedger(company.id, 1),
      objectives: [
        {
          id: 'objective-1',
          companyId: company.id,
          title: 'Ürün',
          brief: 'Ürünü hazırla',
          status: 'active',
          activePlanId: 'plan-1',
          orchestrationBinding: { runId: 'run-1', runtimeEnvironmentId: null },
          createdByWorkerId: lead.id,
          createdAt: 2,
          updatedAt: 2
        }
      ],
      plans: [
        {
          id: 'plan-1',
          objectiveId: 'objective-1',
          version: 1,
          status: 'active',
          createdByWorkerId: lead.id,
          createdAt: 2,
          approvedAt: 2,
          tasks: [
            {
              id: 'task-1',
              objectiveId: 'objective-1',
              planId: 'plan-1',
              title: 'Arayüzü düzelt',
              spec: 'Canlı ofis akışını tamamla.',
              requiredCapabilities: [],
              dependencyIds: [],
              status: 'completed',
              workspacePolicy: 'folder',
              preferredEnvironmentId: null,
              risk: 'low',
              approvalPolicy: 'none',
              orchestrationTaskId: 'runtime-task-1',
              createdAt: 2,
              updatedAt: 5
            }
          ]
        }
      ],
      assignments: [
        {
          id: 'assignment-1',
          taskId: 'task-1',
          workerId: lead.id,
          status: 'completed',
          reason: 'Baş ajan uyguluyor',
          matchedCapabilities: [],
          activeLoadAtAssignment: 0,
          assignedAt: 3,
          approvedAt: 3
        }
      ],
      dispatches: [
        {
          id: 'dispatch-1',
          assignmentId: 'assignment-1',
          taskId: 'task-1',
          workerId: lead.id,
          attempt: 1,
          state: 'succeeded',
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
          finishedAt: 5
        }
      ],
      evidence: [
        {
          id: 'evidence-1',
          taskId: 'task-1',
          assignmentId: 'assignment-1',
          dispatchId: 'dispatch-1',
          status: 'accepted',
          tests: [],
          changedFiles: [],
          diffSummary: null,
          terminalExcerpts: [{ label: 'Tamamlandı', excerpt: 'Ofis hazır.' }],
          screenshots: [],
          risks: [],
          unresolvedDecisions: [],
          producedAt: 5,
          reviewedAt: 5
        }
      ],
      revision: 1,
      updatedAt: 5
    })

    expect(projectBarkosCollaborationTimeline({ company, ledger })).toEqual([
      expect.objectContaining({ kind: 'report', body: 'Ofis hazır.', createdAt: 5 }),
      expect.objectContaining({
        kind: 'handoff',
        body: 'Canlı ofis akışını tamamla.',
        createdAt: 3
      })
    ])
  })

  it('returns no events for a different company ledger', () => {
    const company = createBarkosCompany({
      name: 'BarkOS',
      mission: 'Üret',
      leadName: 'Atlas',
      agentId: 'codex',
      now: 1
    })
    expect(
      projectBarkosCollaborationTimeline({
        company,
        ledger: createEmptyBarkosWorkLedger('other-company', 1)
      })
    ).toEqual([])
  })
})
