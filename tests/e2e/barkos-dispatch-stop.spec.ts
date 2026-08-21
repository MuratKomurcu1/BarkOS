import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { expect, test } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import {
  installBarkosDispatchStopIpcHarness,
  readBarkosDispatchStopHarness,
  type BarkosDispatchStopFault
} from './barkos-dispatch-stop-ipc-harness'
import {
  E2E_BARKOS_DISPATCH_ID,
  E2E_SOURCE_TAB_ID,
  E2E_SOURCE_TERMINAL_HANDLE,
  seedBarkosCodexFailoverScenario
} from './barkos-codex-failover-scenario'

async function openStopScenario(args: {
  electronApp: ElectronApplication
  page: Page
  fault: BarkosDispatchStopFault
}): Promise<void> {
  const scenario = await seedBarkosCodexFailoverScenario(args.page)
  await installBarkosDispatchStopIpcHarness(args.electronApp, args.fault)
  await args.page.reload()
  await waitForSessionReady(args.page)
  await args.page.getByRole('button', { name: 'Company', exact: true }).click()
  await args.page.evaluate(
    ({ tabId, terminalHandle, workspaceId }) => {
      const store = window.__store
      if (!store) {
        throw new Error('BarkOS E2E renderer store is unavailable')
      }
      const now = Date.now()
      store
        .getState()
        .setAgentStatus(
          `${tabId}:stop-leaf`,
          { state: 'working', prompt: 'Run bounded work.', agentType: 'codex' },
          'BarkOS stop target',
          { updatedAt: now, stateStartedAt: now },
          { tabId, worktreeId: workspaceId, terminalHandle, connectionId: null }
        )
    },
    {
      tabId: E2E_SOURCE_TAB_ID,
      terminalHandle: E2E_SOURCE_TERMINAL_HANDLE,
      workspaceId: scenario.workspaceId
    }
  )
  await args.page.getByRole('tab', { name: 'Objective board' }).click()
  await expect(args.page.getByRole('button', { name: 'Stop work' })).toBeVisible()
}

async function confirmStop(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Stop work' }).click()
  await expect(page.getByText(/close Ada Recovery’s live worker terminal/)).toBeVisible()
  await page.getByRole('button', { name: 'Stop and close terminal' }).click()
}

async function loadDispatch(page: Page) {
  return page.evaluate(async (dispatchId) => {
    const ledger = await window.api.barkosWorkLedger.load()
    const dispatch = ledger?.dispatches.find((entry) => entry.id === dispatchId)
    const task = ledger?.plans
      .flatMap((plan) => plan.tasks)
      .find((entry) => entry.id === dispatch?.taskId)
    const assignment = ledger?.assignments.find((entry) => entry.id === dispatch?.assignmentId)
    return { dispatch: dispatch ?? null, task: task ?? null, assignment: assignment ?? null }
  }, E2E_BARKOS_DISPATCH_ID)
}

async function prepareProtectedReplacement(page: Page): Promise<void> {
  await page.evaluate(async (dispatchId) => {
    const company = await window.api.barkosCompany.load()
    const ledger = await window.api.barkosWorkLedger.load()
    const dispatch = ledger?.dispatches.find((entry) => entry.id === dispatchId)
    if (!company || !ledger || !dispatch) {
      throw new Error('Stopped BarkOS replacement boundary is unavailable')
    }
    const now = Math.max(Date.now(), company.updatedAt + 1, ledger.updatedAt + 1)
    await window.api.barkosCompany.save({
      ...company,
      workers: [
        ...company.workers,
        {
          id: 'grace-replacement',
          name: 'Grace Replacement',
          roleId: company.workers[0].roleId,
          agentId: 'codex',
          model: null,
          preferredEnvironmentId: null,
          workspacePolicy: 'inherit',
          status: 'available'
        }
      ],
      updatedAt: now
    })
    await window.api.barkosWorkLedger.save({
      ...ledger,
      plans: ledger.plans.map((plan) => ({
        ...plan,
        tasks: plan.tasks.map((task) =>
          task.id === dispatch.taskId
            ? { ...task, approvalPolicy: 'before-dispatch', updatedAt: now }
            : task
        )
      })),
      revision: ledger.revision + 1,
      updatedAt: now
    })
  }, E2E_BARKOS_DISPATCH_ID)
  await page.reload()
  await waitForSessionReady(page)
  await page.getByRole('button', { name: 'Company', exact: true }).click()
  await page.getByRole('tab', { name: 'Objective board' }).click()
}

function stopEffectEvents(events: readonly string[]): string[] {
  return events.filter((event) => event !== 'runtime:orchestration.runCurrent')
}

function runtimeEffectEvents(events: readonly string[]): string[] {
  return events.filter(
    (event) => event.startsWith('runtime:') && event !== 'runtime:orchestration.runCurrent'
  )
}

test('stops exact Dispatch authority and PTY through real Electron persistence', async ({
  electronApp,
  orcaPage
}) => {
  await openStopScenario({ electronApp, page: orcaPage, fault: 'none' })
  await orcaPage.getByRole('tab', { name: 'Live office' }).click()
  await expect(orcaPage.getByRole('heading', { name: 'Live office' })).toBeVisible()
  await expect(orcaPage.getByText('Working', { exact: true })).toBeVisible()
  await expect(orcaPage.getByText('Resume Codex Dispatch', { exact: true })).toBeVisible()
  await orcaPage.getByRole('tab', { name: 'Objective board' }).click()
  await confirmStop(orcaPage)
  await expect(
    orcaPage.getByText('Stopped · Dispatch authority and worker terminal termination confirmed.')
  ).toBeVisible()

  const result = await loadDispatch(orcaPage)
  expect(result.dispatch).toMatchObject({
    state: 'cancelled',
    stop: { state: 'completed', workerTerminalHandle: E2E_SOURCE_TERMINAL_HANDLE }
  })
  expect(result.task?.status).toBe('cancelled')
  expect(result.assignment?.status).toBe('rejected')
  const harness = await readBarkosDispatchStopHarness(electronApp)
  expect(stopEffectEvents(harness.events)).toEqual([
    'work-ledger:save:1',
    'runtime:orchestration.workerStop',
    'work-ledger:save:2',
    'runtime:terminal.close',
    'work-ledger:save:3'
  ])
})

test('reassigns only after confirmed stop and waits at a fresh authority gate', async ({
  electronApp,
  orcaPage
}) => {
  await openStopScenario({ electronApp, page: orcaPage, fault: 'none' })
  await confirmStop(orcaPage)
  await expect(
    orcaPage.getByText('Stopped · Dispatch authority and worker terminal termination confirmed.')
  ).toBeVisible()
  await prepareProtectedReplacement(orcaPage)

  await orcaPage.getByRole('button', { name: 'Reassign and start' }).click()
  await expect(orcaPage.getByText(/preserve Ada Recovery’s confirmed stop/)).toBeVisible()
  const confirmations = orcaPage.getByRole('button', { name: 'Reassign and start' })
  await confirmations.last().click()
  await expect(orcaPage.getByText(/Review the new authority gate before starting it/)).toBeVisible()
  await expect(orcaPage.getByText('Grace Replacement', { exact: true })).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: 'Approve and start' })).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: 'Reassign and start' })).toHaveCount(0)

  const result = await loadDispatch(orcaPage)
  const ledger = await orcaPage.evaluate(() => window.api.barkosWorkLedger.load())
  const replacement = ledger?.assignments.find(
    (assignment) => assignment.taskId === result.task?.id && assignment.status === 'approved'
  )
  expect(result.assignment?.status).toBe('reassigned')
  expect(result.dispatch?.stop?.state).toBe('completed')
  expect(replacement).toMatchObject({ workerId: 'grace-replacement', status: 'approved' })
  expect(ledger?.approvalGates.find((gate) => gate.assignmentId === replacement?.id)).toMatchObject(
    { status: 'pending', kind: 'dispatch' }
  )
  expect(runtimeEffectEvents((await readBarkosDispatchStopHarness(electronApp)).events)).toEqual([
    'runtime:orchestration.workerStop',
    'runtime:terminal.close'
  ])
})

for (const faultCase of [
  {
    fault: 'worker-stop-uncertain' as const,
    expectedEvents: [
      'work-ledger:save:1',
      'runtime:orchestration.workerStop',
      'work-ledger:save:2'
    ],
    dispatchStoppedAt: null
  },
  {
    fault: 'pty-stop-unproven' as const,
    expectedEvents: [
      'work-ledger:save:1',
      'runtime:orchestration.workerStop',
      'work-ledger:save:2',
      'runtime:terminal.close',
      'work-ledger:save:3'
    ],
    dispatchStoppedAt: 'proved'
  }
]) {
  test(`keeps ${faultCase.fault} durable without claiming stopped`, async ({
    electronApp,
    orcaPage
  }) => {
    await openStopScenario({ electronApp, page: orcaPage, fault: faultCase.fault })
    await confirmStop(orcaPage)
    await expect(orcaPage.getByText(/Stop result is uncertain/)).toBeVisible()
    await expect(orcaPage.getByRole('button', { name: 'Stop work' })).toHaveCount(0)

    const result = await loadDispatch(orcaPage)
    expect(result.dispatch).toMatchObject({ state: 'running', stop: { state: 'uncertain' } })
    if (faultCase.dispatchStoppedAt === null) {
      expect(result.dispatch?.stop?.dispatchStoppedAt).toBeNull()
    } else {
      expect(result.dispatch?.stop?.dispatchStoppedAt).not.toBeNull()
    }
    expect(result.task?.status).toBe('running')
    expect(result.assignment?.status).toBe('dispatched')
    expect(stopEffectEvents((await readBarkosDispatchStopHarness(electronApp)).events)).toEqual(
      faultCase.expectedEvents
    )
  })
}

for (const faultCase of [
  {
    fault: 'intent-persistence' as const,
    expectedStop: null,
    forbiddenRuntime: ['runtime:orchestration.workerStop', 'runtime:terminal.close']
  },
  {
    fault: 'authority-proof-persistence' as const,
    expectedStop: 'requested',
    forbiddenRuntime: ['runtime:terminal.close']
  },
  {
    fault: 'final-persistence' as const,
    expectedStop: 'dispatch-stopped',
    forbiddenRuntime: []
  }
]) {
  test(`preserves the last durable boundary after ${faultCase.fault}`, async ({
    electronApp,
    orcaPage
  }) => {
    await openStopScenario({ electronApp, page: orcaPage, fault: faultCase.fault })
    await confirmStop(orcaPage)
    await expect(orcaPage.getByRole('alert').filter({ hasText: 'could not persist' })).toBeVisible()

    const result = await loadDispatch(orcaPage)
    expect(result.dispatch?.state).toBe('running')
    expect(result.dispatch?.stop?.state ?? null).toBe(faultCase.expectedStop)
    expect(result.task?.status).toBe('running')
    expect(result.assignment?.status).toBe('dispatched')
    const { events } = await readBarkosDispatchStopHarness(electronApp)
    for (const event of faultCase.forbiddenRuntime) {
      expect(events).not.toContain(event)
    }
  })
}
