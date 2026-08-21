import type { Page } from '@stablyai/playwright-test'
import { waitForSessionReady } from './helpers/store'
import {
  E2E_LIMITED_CODEX_ACCOUNT_ID,
  E2E_READY_CODEX_ACCOUNT_ID
} from './barkos-codex-failover-ipc-harness'

export const E2E_BARKOS_DISPATCH_ID = 'e2e-capacity-dispatch'
export const E2E_ORCHESTRATION_DISPATCH_ID = 'e2e-orchestration-dispatch'
export const E2E_REPLACEMENT_TAB_ID = 'e2e-replacement-tab'
export const E2E_SOURCE_TAB_ID = 'e2e-source-tab'
export const E2E_SOURCE_TERMINAL_HANDLE = 'e2e-source-terminal'
export const E2E_REPLACEMENT_TERMINAL_HANDLE = 'e2e-replacement-terminal'

export type BarkosCodexFailoverScenario = {
  companyId: string
  companyCreatedAt: number
  workerId: string
  taskId: string
  assignmentId: string
  dispatchId: string
  workspaceId: string
}

export async function seedBarkosCodexFailoverScenario(
  page: Page
): Promise<BarkosCodexFailoverScenario> {
  await waitForSessionReady(page)
  await page.getByRole('button', { name: 'Company', exact: true }).click()
  await page.getByLabel('Company name').fill('BarkOS Failover E2E')
  await page.getByLabel('Mission').fill('Prove bounded Codex recovery.')
  await page.getByLabel('Lead worker name').fill('Ada Recovery')
  await page.getByRole('button', { name: 'Create company' }).click()
  await page.getByRole('tab', { name: 'Objective board' }).click()
  await page.getByRole('button', { name: 'Create objective' }).click()
  await page.getByLabel('Objective title').fill('Recover limited task')
  await page.getByLabel('Objective brief').fill('Recover only after exact evidence.')
  await page.getByLabel('Task name').fill('Resume Codex Dispatch')
  await page.getByLabel('Task specification').fill('Resume the exact bounded task.')
  await page.getByRole('button', { name: 'Create approved plan' }).click()

  return page.evaluate(
    async (config) => {
      const store = window.__store
      const workspaceId = store?.getState().activeWorktreeId
      const [company, workLedger, capacityLedger] = await Promise.all([
        window.api.barkosCompany.load(),
        window.api.barkosWorkLedger.load(),
        window.api.barkosProviderCapacity.load()
      ])
      const worker = company?.workers.find((entry) => entry.id === company.leadWorkerId)
      const plan = workLedger?.plans[0]
      const task = plan?.tasks[0]
      const objective = workLedger?.objectives.find((entry) => entry.id === plan?.objectiveId)
      if (
        !store ||
        !workspaceId ||
        !company ||
        !worker ||
        !workLedger ||
        !capacityLedger ||
        !plan ||
        !task ||
        !objective
      ) {
        throw new Error('BarkOS Codex failover scenario could not resolve its exact boundary')
      }
      const now = Math.max(Date.now(), workLedger.updatedAt + 1, capacityLedger.updatedAt + 1)
      const assignmentId = 'e2e-capacity-assignment'
      const runId = 'e2e-orchestration-run'
      const orchestrationTaskId = 'e2e-orchestration-task'
      await window.api.barkosCompany.save({
        ...company,
        workers: company.workers.map((entry) =>
          entry.id === worker.id ? { ...entry, agentId: 'codex' } : entry
        ),
        updatedAt: now
      })
      await window.api.barkosWorkLedger.save({
        ...workLedger,
        objectives: workLedger.objectives.map((entry) =>
          entry.id === objective.id
            ? {
                ...entry,
                status: 'active',
                orchestrationBinding: { runId, runtimeEnvironmentId: null },
                updatedAt: now
              }
            : entry
        ),
        plans: workLedger.plans.map((entry) =>
          entry.id === plan.id
            ? {
                ...entry,
                status: 'active',
                tasks: entry.tasks.map((candidate) =>
                  candidate.id === task.id
                    ? {
                        ...candidate,
                        status: 'running',
                        orchestrationTaskId,
                        updatedAt: now
                      }
                    : candidate
                )
              }
            : entry
        ),
        assignments: [
          {
            id: assignmentId,
            taskId: task.id,
            workerId: worker.id,
            status: 'dispatched',
            reason: 'Exercise the explicit desktop recovery boundary.',
            matchedCapabilities: [],
            activeLoadAtAssignment: 0,
            assignedAt: now,
            approvedAt: now
          }
        ],
        dispatches: [
          {
            id: config.dispatchId,
            assignmentId,
            taskId: task.id,
            workerId: worker.id,
            attempt: 1,
            state: 'running',
            workspaceId,
            executionHostId: 'local',
            orchestrationRunId: runId,
            orchestrationTaskId,
            orchestrationDispatchId: config.orchestrationDispatchId,
            memoryDelivery: null,
            stop: null,
            error: null,
            createdAt: now,
            startedAt: now,
            finishedAt: null
          }
        ],
        revision: workLedger.revision + 1,
        updatedAt: now
      })
      await window.api.barkosProviderCapacity.save({
        ...capacityLedger,
        accounts: [
          {
            account: {
              provider: 'codex',
              accountId: config.limitedAccountId,
              executionHostId: 'local',
              runtimeLane: { kind: 'host' }
            },
            active: true,
            status: 'limited',
            reason: 'usage-exhausted',
            usedPercent: 100,
            resetsAt: now + 60_000,
            retryAt: null,
            sourceUpdatedAt: now,
            observedAt: now
          },
          {
            account: {
              provider: 'codex',
              accountId: config.readyAccountId,
              executionHostId: 'local',
              runtimeLane: { kind: 'host' }
            },
            active: false,
            status: 'available',
            reason: 'within-limits',
            usedPercent: 10,
            resetsAt: now + 300_000,
            retryAt: null,
            sourceUpdatedAt: now,
            observedAt: now
          }
        ],
        failovers: [],
        revision: capacityLedger.revision + 1,
        updatedAt: now
      })
      await window.api.barkosWorkerSessions.record({
        workerId: worker.id,
        agent: 'codex',
        targetId: `${'local'.length}:local${workspaceId}`,
        workspaceId,
        workspaceKind: 'worktree',
        executionHostId: 'local',
        tabId: config.sourceTabId,
        state: 'created',
        launchedAt: now
      })
      return {
        companyId: company.id,
        companyCreatedAt: company.createdAt,
        workerId: worker.id,
        taskId: task.id,
        assignmentId,
        dispatchId: config.dispatchId,
        workspaceId
      }
    },
    {
      dispatchId: E2E_BARKOS_DISPATCH_ID,
      limitedAccountId: E2E_LIMITED_CODEX_ACCOUNT_ID,
      orchestrationDispatchId: E2E_ORCHESTRATION_DISPATCH_ID,
      readyAccountId: E2E_READY_CODEX_ACCOUNT_ID,
      sourceTabId: E2E_SOURCE_TAB_ID
    }
  )
}
