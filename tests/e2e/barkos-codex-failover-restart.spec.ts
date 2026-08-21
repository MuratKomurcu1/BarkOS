import path from 'node:path'
import { _electron as electron } from '@stablyai/playwright-test'
import { seedBarkosCodexFailoverScenario } from './barkos-codex-failover-scenario'
import { closeElectronAppForE2E } from './helpers/electron-process-shutdown'
import { createElectronHomeIsolation } from './helpers/electron-home-isolation'
import { getOrcaElectronLaunchArgs } from './helpers/electron-launch-args'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

test('recovers a durable selected attempt as uncertain after Electron restarts', async ({
  electronApp,
  orcaPage
}) => {
  const scenario = await seedBarkosCodexFailoverScenario(orcaPage)
  await orcaPage.evaluate(async (current) => {
    const ledger = await window.api.barkosProviderCapacity.load()
    if (!ledger) {
      throw new Error('BarkOS capacity ledger is unavailable')
    }
    const now = Math.max(Date.now(), ledger.updatedAt + 1)
    await window.api.barkosProviderCapacity.save({
      ...ledger,
      failovers: [
        {
          id: 'e2e-interrupted-selection',
          taskId: current.taskId,
          assignmentId: current.assignmentId,
          dispatchId: current.dispatchId,
          workerId: current.workerId,
          provider: 'codex',
          executionHostId: 'local',
          runtimeLane: { kind: 'host' },
          attemptCeiling: 3,
          attempts: [
            {
              sequence: 1,
              account: {
                provider: 'codex',
                accountId: 'e2e-ready-account',
                executionHostId: 'local',
                runtimeLane: { kind: 'host' }
              },
              outcome: 'selected',
              conversationMode: 'unknown',
              reason: 'selected-by-policy',
              sourceOrchestrationDispatchId: 'e2e-orchestration-dispatch',
              startedAt: now,
              settledAt: null
            }
          ],
          state: 'active',
          stopReason: null,
          createdAt: now,
          updatedAt: now
        }
      ],
      revision: ledger.revision + 1,
      updatedAt: now
    })
  }, scenario)

  const userDataDir = await electronApp.evaluate(({ app }) => app.getPath('userData'))
  await closeElectronAppForE2E(electronApp)
  const { ELECTRON_RUN_AS_NODE: _unused, ...cleanEnv } = process.env
  void _unused
  const isolation = createElectronHomeIsolation({
    inheritedEnv: cleanEnv,
    launchEnv: {},
    extraEnv: {},
    userDataDir
  })
  const mainPath = path.join(process.cwd(), 'out', 'main', 'index.js')
  const restarted = await electron.launch({
    args: getOrcaElectronLaunchArgs(mainPath, false),
    env: {
      ...isolation.env,
      NODE_ENV: 'development',
      ORCA_E2E_HEADLESS: '1'
    }
  })
  try {
    const page = await restarted.firstWindow({ timeout: 120_000 })
    await page.waitForLoadState('domcontentloaded')
    await waitForSessionReady(page)
    const recovered = await page.evaluate(() => window.api.barkosProviderCapacity.load())
    expect(recovered?.failovers[0]).toMatchObject({
      state: 'uncertain',
      stopReason: 'ambiguous-side-effect',
      attempts: [{ outcome: 'uncertain', reason: 'ambiguous-side-effect' }]
    })
  } finally {
    await closeElectronAppForE2E(restarted)
  }
})
