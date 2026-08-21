import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import {
  E2E_READY_CODEX_ACCOUNT_ID,
  E2E_REPLACEMENT_DISPATCH_ID,
  installBarkosCodexFailoverIpcHarness,
  readBarkosCodexFailoverHarness,
  type BarkosCodexFailoverFault
} from './barkos-codex-failover-ipc-harness'
import { prepareBarkosCodexFailoverRenderer } from './barkos-codex-failover-renderer-harness'
import {
  E2E_BARKOS_DISPATCH_ID,
  E2E_ORCHESTRATION_DISPATCH_ID,
  E2E_REPLACEMENT_TAB_ID,
  E2E_REPLACEMENT_TERMINAL_HANDLE,
  seedBarkosCodexFailoverScenario,
  type BarkosCodexFailoverScenario
} from './barkos-codex-failover-scenario'

async function openRecoverableScenario(args: {
  electronApp: ElectronApplication
  page: Page
  fault: BarkosCodexFailoverFault
}): Promise<BarkosCodexFailoverScenario> {
  const scenario = await seedBarkosCodexFailoverScenario(args.page)
  await prepareBarkosCodexFailoverRenderer(args.page, scenario)
  await installBarkosCodexFailoverIpcHarness(args.electronApp, args.fault)
  await args.page.getByRole('tab', { name: 'Capacity' }).click()
  await expect(args.page.getByRole('button', { name: 'Recover Dispatch' })).toBeVisible()
  return scenario
}

function expectOrderedEvents(events: readonly string[], expected: readonly string[]): void {
  let cursor = -1
  for (const event of expected) {
    cursor = events.indexOf(event, cursor + 1)
    expect(cursor, `missing ordered event ${event} in ${events.join(' → ')}`).toBeGreaterThan(-1)
  }
}

async function loadFailoverResult(page: Page) {
  return page.evaluate(async () => {
    const [capacity, work] = await Promise.all([
      window.api.barkosProviderCapacity.load(),
      window.api.barkosWorkLedger.load()
    ])
    return { capacity, work }
  })
}

async function waitForFailoverState(page: Page, state: 'succeeded' | 'uncertain'): Promise<void> {
  await expect
    .poll(async () => (await loadFailoverResult(page)).capacity?.failovers[0]?.state ?? null)
    .toBe(state)
}

async function reopenCapacity(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Company', exact: true }).click()
  await page.getByRole('tab', { name: 'Capacity' }).click()
}

test('completes typed Codex recovery through the real Electron persistence boundary', async ({
  electronApp,
  orcaPage
}) => {
  await openRecoverableScenario({ electronApp, page: orcaPage, fault: 'none' })
  await orcaPage.getByRole('button', { name: 'Recover Dispatch' }).click()
  await expect
    .poll(() =>
      orcaPage.evaluate(
        () => Object.values(window.__store?.getState().barkosWorkerSessions ?? {})[0]?.tabId ?? null
      )
    )
    .toBe(E2E_REPLACEMENT_TAB_ID)
  const replacementAuthority = await orcaPage.evaluate((replacementTabId) => {
    const statuses = Object.values(window.__store?.getState().agentStatusByPaneKey ?? {})
    const status = statuses.find((entry) => entry.tabId === replacementTabId)
    return {
      terminalHandle: status?.terminalHandle ?? null,
      providerSessionId: status?.providerSession?.id ?? null
    }
  }, E2E_REPLACEMENT_TAB_ID)
  expect(replacementAuthority).toEqual({
    terminalHandle: E2E_REPLACEMENT_TERMINAL_HANDLE,
    providerSessionId: 'e2e-codex-session'
  })
  await waitForFailoverState(orcaPage, 'succeeded')
  await reopenCapacity(orcaPage)
  await expect(orcaPage.getByText('Restarted', { exact: true })).toBeVisible()

  const result = await loadFailoverResult(orcaPage)
  expect(result.capacity?.failovers).toEqual([
    expect.objectContaining({
      state: 'succeeded',
      stopReason: 'completed',
      attempts: [
        expect.objectContaining({
          outcome: 'succeeded',
          conversationMode: 'same-conversation',
          sourceOrchestrationDispatchId: E2E_ORCHESTRATION_DISPATCH_ID,
          replacementOrchestrationDispatchId: E2E_REPLACEMENT_DISPATCH_ID
        })
      ]
    })
  ])
  expect(
    result.work?.dispatches.find((entry) => entry.id === E2E_BARKOS_DISPATCH_ID)
      ?.orchestrationDispatchId
  ).toBe(E2E_REPLACEMENT_DISPATCH_ID)

  const harness = await readBarkosCodexFailoverHarness(electronApp)
  expect(harness.selectedAccountId).toBe(E2E_READY_CODEX_ACCOUNT_ID)
  expectOrderedEvents(harness.events, [
    'codex:list',
    'capacity:save',
    'codex:select:e2e-ready-account',
    'codex:readback',
    'runtime:orchestration.workerStop',
    'runtime:terminal.close',
    'codex:prepare-resume',
    'worker-session:record',
    'runtime:orchestration.runUse',
    'runtime:orchestration.taskUpdate',
    'runtime:orchestration.dispatch',
    'work-ledger:save',
    'capacity:save'
  ])
})

test('freezes recovery when authoritative account readback is unavailable', async ({
  electronApp,
  orcaPage
}) => {
  await openRecoverableScenario({
    electronApp,
    page: orcaPage,
    fault: 'readback-unavailable'
  })
  await orcaPage.getByRole('button', { name: 'Recover Dispatch' }).click()
  await waitForFailoverState(orcaPage, 'uncertain')
  await expect(
    orcaPage.getByText('Recovery stopped because the account-change outcome could not be proven.')
  ).toBeVisible()
  await expect(orcaPage.getByText('Review required', { exact: true })).toBeVisible()

  const result = await loadFailoverResult(orcaPage)
  expect(result.capacity?.failovers[0]).toMatchObject({
    state: 'uncertain',
    stopReason: 'ambiguous-side-effect',
    attempts: [{ outcome: 'uncertain' }]
  })
  const harness = await readBarkosCodexFailoverHarness(electronApp)
  expect(harness.events).toContain('codex:readback')
  expect(harness.events).not.toContain('runtime:orchestration.workerStop')
  expect(harness.events).not.toContain('runtime:terminal.close')
  expect(harness.events).not.toContain('codex:prepare-resume')
})

for (const faultCase of [
  {
    fault: 'dispatch-stop-uncertain' as const,
    error: 'Injected Dispatch stop uncertainty',
    required: ['runtime:orchestration.workerStop'],
    forbidden: ['runtime:terminal.close', 'codex:prepare-resume']
  },
  {
    fault: 'pty-stop-unproven' as const,
    error: 'Orca did not prove that the previous Codex process was stopped',
    required: ['runtime:orchestration.workerStop', 'runtime:terminal.close'],
    forbidden: ['codex:prepare-resume']
  }
]) {
  test(`does not launch a second writer after ${faultCase.fault}`, async ({
    electronApp,
    orcaPage
  }) => {
    await openRecoverableScenario({
      electronApp,
      page: orcaPage,
      fault: faultCase.fault
    })
    await orcaPage.getByRole('button', { name: 'Recover Dispatch' }).click()
    await waitForFailoverState(orcaPage, 'uncertain')
    await expect(orcaPage.getByRole('alert').filter({ hasText: faultCase.error })).toBeVisible()
    await expect(orcaPage.getByText('Review required', { exact: true })).toBeVisible()

    const result = await loadFailoverResult(orcaPage)
    expect(result.capacity?.failovers[0]).toMatchObject({
      state: 'uncertain',
      stopReason: 'ambiguous-side-effect'
    })
    const { events } = await readBarkosCodexFailoverHarness(electronApp)
    expectOrderedEvents(events, faultCase.required)
    for (const forbidden of faultCase.forbidden) {
      expect(events).not.toContain(forbidden)
    }
  })
}

test('freezes after replacement injection when work-ledger persistence fails', async ({
  electronApp,
  orcaPage
}) => {
  await openRecoverableScenario({
    electronApp,
    page: orcaPage,
    fault: 'work-ledger-persistence'
  })
  await orcaPage.getByRole('button', { name: 'Recover Dispatch' }).click()
  await waitForFailoverState(orcaPage, 'uncertain')
  await reopenCapacity(orcaPage)
  await expect(orcaPage.getByText('Review required', { exact: true })).toBeVisible()

  const result = await loadFailoverResult(orcaPage)
  expect(result.capacity?.failovers[0]).toMatchObject({
    state: 'uncertain',
    stopReason: 'ambiguous-side-effect'
  })
  expect(
    result.work?.dispatches.find((entry) => entry.id === E2E_BARKOS_DISPATCH_ID)
      ?.orchestrationDispatchId
  ).toBe(E2E_ORCHESTRATION_DISPATCH_ID)
  const { events } = await readBarkosCodexFailoverHarness(electronApp)
  expect(events.filter((event) => event === 'runtime:orchestration.dispatch')).toHaveLength(1)
  expect(events.filter((event) => event === 'codex:select:e2e-ready-account')).toHaveLength(1)
  expect(events).toContain('work-ledger:save-error')
})
