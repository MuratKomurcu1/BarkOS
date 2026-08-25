import { expect, test } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

const BARKOS_LIVE_OFFICE_VIEW_PREFERENCES_KEY = 'barkos.live-office.view-preferences.v1'

test('manages a BarkOS company through the real desktop persistence boundary', async ({
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await orcaPage.evaluate(async () => {
    const store = window.__store
    if (!store) {
      throw new Error('BarkOS E2E renderer store is unavailable')
    }
    await store.getState().updateSettings({ uiLanguage: 'en' })
  })
  await orcaPage.evaluate(
    (key) => localStorage.removeItem(key),
    BARKOS_LIVE_OFFICE_VIEW_PREFERENCES_KEY
  )

  const companyButton = orcaPage.getByRole('button', { name: 'Company', exact: true })
  await companyButton.click()

  await expect(companyButton).toHaveAttribute('aria-current', 'page')
  await expect(orcaPage.getByRole('heading', { name: 'Create your company' })).toBeVisible()

  await orcaPage.getByLabel('Company name').fill('BarkOS E2E')
  await orcaPage.getByLabel('Mission').fill('Prove the company persistence flow.')
  await orcaPage.getByLabel('Lead worker name').fill('Ada E2E')
  await orcaPage.getByRole('button', { name: 'Create company' }).click()

  await expect(orcaPage.getByRole('heading', { name: 'BarkOS E2E' })).toBeVisible()
  await expect(orcaPage.getByText('Ada E2E', { exact: true }).first()).toBeVisible()
  await expect(orcaPage.getByText('Baş Ajan', { exact: true }).first()).toBeVisible()
  await expect(orcaPage.getByText('Available', { exact: true })).toBeVisible()
  await expect(orcaPage.locator('[data-barkos-office-banner="true"]')).toBeVisible()
  await expect(orcaPage.getByLabel('Projeyi veya istediğiniz değişikliği anlatın')).toBeVisible()

  const companyTab = orcaPage.getByRole('tab', { name: 'Company', exact: true })
  await companyTab.focus()
  await orcaPage.keyboard.press('ArrowRight')
  const objectiveTab = orcaPage.getByRole('tab', { name: 'Objective board' })
  await expect(objectiveTab).toBeFocused()
  await expect(objectiveTab).toHaveAttribute('aria-selected', 'true')
  await orcaPage.keyboard.press('ArrowRight')
  const officeTab = orcaPage.getByRole('tab', { name: 'Live office' })
  await expect(officeTab).toBeFocused()
  await expect(officeTab).toHaveAttribute('aria-selected', 'true')
  const office = orcaPage.locator('[data-barkos-live-office="true"]')
  await expect(orcaPage.getByRole('region', { name: 'Live office', exact: true })).toBeVisible()
  await expect(
    office.getByRole('img', { name: 'BarkOS çalışanlarının canlı piksel ofisi' })
  ).toBeVisible()
  await expect(office.locator('[data-barkos-pixel-office="true"]')).toHaveAttribute('width', /\d+/)
  await expect(orcaPage.getByRole('status')).toContainText('0 with active work')
  await expect(orcaPage.getByRole('list', { name: 'Workers' })).toBeVisible()
  await expect(office).toHaveAttribute('data-density', 'comfortable')
  const defaultMotion = await orcaPage.evaluate(() =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'off' : 'system'
  )
  await expect(office).toHaveAttribute('data-motion', defaultMotion)
  const viewOptions = orcaPage.getByRole('button', { name: 'View options' })
  await viewOptions.focus()
  await orcaPage.keyboard.press('Enter')
  const compactRows = orcaPage.getByRole('menuitemcheckbox', { name: 'Compact rows' })
  await compactRows.focus()
  await orcaPage.keyboard.press('Enter')
  await expect(compactRows).toHaveAttribute('aria-checked', 'true')
  await expect(office).toHaveAttribute('data-density', 'compact')
  const noAnimation = orcaPage.getByRole('menuitemradio', { name: 'No animation' })
  await noAnimation.focus()
  await orcaPage.keyboard.press('Enter')
  await expect(office).toHaveAttribute('data-motion', 'off')
  expect(
    await office.evaluate((element) => {
      const probe = document.createElement('span')
      probe.style.animation = 'agent-spinner-rotate 1s linear infinite'
      element.appendChild(probe)
      const animationName = getComputedStyle(probe).animationName
      probe.remove()
      return animationName
    })
  ).toBe('none')
  await expect
    .poll(() =>
      orcaPage.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? 'null'),
        BARKOS_LIVE_OFFICE_VIEW_PREFERENCES_KEY
      )
    )
    .toEqual({ schemaVersion: 1, density: 'compact', motion: 'off' })
  await orcaPage.reload()
  await waitForSessionReady(orcaPage)
  await orcaPage.getByRole('button', { name: 'Company', exact: true }).click()
  await orcaPage.getByRole('tab', { name: 'Live office' }).click()
  await expect(orcaPage.locator('[data-barkos-live-office="true"]')).toHaveAttribute(
    'data-density',
    'compact'
  )
  await expect(orcaPage.locator('[data-barkos-live-office="true"]')).toHaveAttribute(
    'data-motion',
    'off'
  )
  const persistedViewOptions = orcaPage.getByRole('button', { name: 'View options' })
  await persistedViewOptions.focus()
  await orcaPage.keyboard.press('Enter')
  const persistedViewMenu = orcaPage.getByRole('menu', { name: 'View options' })
  await expect(persistedViewMenu).toBeVisible()
  expect(
    await persistedViewMenu.evaluate((element) => getComputedStyle(element).animationName)
  ).toBe('none')
  await orcaPage.keyboard.press('Escape')
  await expect(persistedViewOptions).toBeFocused()

  await orcaPage.getByRole('tab', { name: 'Objective board' }).click()
  await expect(orcaPage.getByText('No objectives yet')).toBeVisible()
  await expect(orcaPage.getByText('No evidence is waiting for review.')).toBeVisible()
  await expect(orcaPage.getByText('0/0')).toBeVisible()
  await orcaPage.getByRole('button', { name: 'Create objective' }).click()
  await expect(
    orcaPage.getByText(/does not launch workers or consume provider quota/)
  ).toBeVisible()
  await orcaPage.getByLabel('Objective title').fill('E2E release objective')
  await orcaPage.getByLabel('Objective brief').fill('Plan the verified E2E release.')
  await orcaPage.getByLabel('Task name').fill('Verify E2E release')
  await orcaPage.getByLabel('Task specification').fill('Run the bounded release verification.')
  await orcaPage.getByRole('button', { name: 'Create approved plan' }).click()
  await expect(orcaPage.getByText('E2E release objective', { exact: true })).toBeVisible()
  await expect(orcaPage.getByText('Verify E2E release', { exact: true })).toBeVisible()
  await expect(orcaPage.getByText('0/1')).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: 'Prepare in BarkOS' })).toBeDisabled()
  await expect(
    orcaPage.getByText('Launch the lead worker from the Company tab first.')
  ).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: 'Assign and start' })).toBeDisabled()
  await expect(orcaPage.getByText('Launch the company lead before starting work.')).toBeVisible()
  await orcaPage.getByRole('tab', { name: 'Decisions' }).click()
  await expect(orcaPage.getByRole('heading', { name: 'Decision inbox' })).toBeVisible()
  await expect(orcaPage.getByText('No current BarkOS Run')).toBeVisible()
  await orcaPage.getByRole('tab', { name: 'Memory' }).click()
  await expect(orcaPage.getByRole('heading', { name: 'Company memory' })).toBeVisible()
  await expect(orcaPage.getByText('No memory proposals yet.')).toBeVisible()
  await expect(orcaPage.getByText('No promoted memory is active.')).toBeVisible()
  await orcaPage.getByRole('tab', { name: 'Capacity' }).click()
  await expect(orcaPage.getByRole('heading', { name: 'Provider capacity' })).toBeVisible()
  await expect(orcaPage.getByText(/Account recovery runs only when you choose/)).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: 'Sync BarkOS snapshot' })).toBeVisible()
  await orcaPage.getByRole('tab', { name: 'Usage & cost' }).click()
  await expect(orcaPage.getByRole('heading', { name: 'Usage & cost' })).toBeVisible()
  await expect(orcaPage.getByText(/not provider invoices/)).toBeVisible()
  await expect(orcaPage.getByText(/never change execution-unit limits/)).toBeVisible()
  await orcaPage.getByRole('button', { name: 'Sync usage records' }).click()
  await expect(
    orcaPage.getByText('Provider usage records synchronized. No provider was contacted.')
  ).toBeVisible()
  await expect
    .poll(() => orcaPage.evaluate(async () => (await window.api.barkosUsageCost.load())?.revision))
    .toBe(1)

  await orcaPage.evaluate(async () => {
    const [company, workLedger, capacityLedger] = await Promise.all([
      window.api.barkosCompany.load(),
      window.api.barkosWorkLedger.load(),
      window.api.barkosProviderCapacity.load()
    ])
    const worker = company?.workers.find((entry) => entry.id === company.leadWorkerId)
    const plan = workLedger?.plans[0]
    const task = plan?.tasks[0]
    const objective = workLedger?.objectives.find((entry) => entry.id === plan?.objectiveId)
    if (!company || !worker || !workLedger || !capacityLedger || !plan || !task || !objective) {
      throw new Error('BarkOS E2E failover boundary was not ready')
    }
    const now = Math.max(Date.now(), workLedger.updatedAt + 1, capacityLedger.updatedAt + 1)
    const runId = 'e2e-orchestration-run'
    const taskId = 'e2e-orchestration-task'
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
                      orchestrationTaskId: taskId,
                      updatedAt: now
                    }
                  : candidate
              )
            }
          : entry
      ),
      assignments: [
        ...workLedger.assignments,
        {
          id: 'e2e-capacity-assignment',
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
        ...workLedger.dispatches,
        {
          id: 'e2e-capacity-dispatch',
          assignmentId: 'e2e-capacity-assignment',
          taskId: task.id,
          workerId: worker.id,
          attempt: 1,
          state: 'running',
          workspaceId: 'e2e-workspace',
          executionHostId: 'local',
          orchestrationRunId: runId,
          orchestrationTaskId: taskId,
          orchestrationDispatchId: 'e2e-orchestration-dispatch',
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
            accountId: 'e2e-limited-account',
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
            accountId: 'e2e-ready-account',
            executionHostId: 'local',
            runtimeLane: { kind: 'host' }
          },
          active: false,
          status: 'available',
          reason: 'within-limits',
          usedPercent: 10,
          resetsAt: null,
          retryAt: null,
          sourceUpdatedAt: now,
          observedAt: now
        }
      ],
      failovers: [
        {
          id: 'e2e-previous-failover',
          taskId: task.id,
          assignmentId: 'e2e-capacity-assignment',
          dispatchId: 'e2e-previous-dispatch',
          workerId: worker.id,
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
              outcome: 'failed',
              conversationMode: 'same-conversation',
              reason: 'execution-failed',
              startedAt: now,
              settledAt: now
            }
          ],
          state: 'stopped',
          stopReason: 'no-eligible-account',
          createdAt: now,
          updatedAt: now
        }
      ],
      revision: capacityLedger.revision + 1,
      updatedAt: now
    })
    await window.api.barkosWorkerSessions.record({
      workerId: worker.id,
      agent: 'codex',
      targetId: 'e2e-workspace',
      workspaceId: 'e2e-workspace',
      workspaceKind: 'worktree',
      executionHostId: 'local',
      tabId: 'e2e-capacity-tab',
      state: 'created',
      launchedAt: now
    })
  })

  await orcaPage.reload()
  await waitForSessionReady(orcaPage)
  await orcaPage.getByRole('button', { name: 'Company', exact: true }).click()
  await orcaPage.evaluate(() => {
    const now = Date.now()
    window.__store?.getState().setAgentStatus(
      'e2e-capacity-tab:e2e-capacity-leaf',
      {
        state: 'done',
        prompt: 'Run bounded recovery.',
        agentType: 'codex',
        providerFailure: { kind: 'usage-limit-exceeded' },
        orchestration: {
          taskId: 'e2e-orchestration-task',
          dispatchId: 'e2e-orchestration-dispatch',
          dispatchStatus: 'dispatched'
        }
      },
      'Codex recovery candidate',
      { updatedAt: now, stateStartedAt: now },
      {
        tabId: 'e2e-capacity-tab',
        worktreeId: 'e2e-workspace',
        terminalHandle: 'e2e-capacity-terminal',
        connectionId: null
      }
    )
  })
  await orcaPage.getByRole('tab', { name: 'Live office' }).click()
  const communicationFlow = orcaPage.getByRole('region', { name: 'Agent communication flow' })
  await expect(communicationFlow).toBeVisible()
  await expect(communicationFlow.getByText('Verify E2E release', { exact: true })).toBeVisible()
  await expect(communicationFlow.getByText('Run the bounded release verification.')).toBeVisible()
  await orcaPage.getByRole('tab', { name: 'Capacity' }).click()
  await expect(orcaPage.getByText('Codex Dispatch recovery')).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: 'Recover Dispatch' })).toBeVisible()
  await expect(orcaPage.getByText('Recovery history')).toBeVisible()
  await expect(orcaPage.getByText(/Same conversation/)).toBeVisible()
  await orcaPage.evaluate(async () => {
    const [company, ledger, inbox] = await Promise.all([
      window.api.barkosCompany.load(),
      window.api.barkosWorkLedger.load(),
      window.api.barkosDecisionInbox.load()
    ])
    const dispatch = ledger?.dispatches.find((entry) => entry.state === 'running')
    const assignment = ledger?.assignments.find((entry) => entry.id === dispatch?.assignmentId)
    const task = ledger?.plans
      .flatMap((plan) => plan.tasks)
      .find((entry) => entry.id === dispatch?.taskId)
    if (
      !company ||
      !ledger ||
      !inbox ||
      !dispatch ||
      !assignment ||
      !task ||
      !dispatch.orchestrationRunId ||
      !dispatch.orchestrationTaskId ||
      !dispatch.orchestrationDispatchId
    ) {
      throw new Error('BarkOS E2E side-effect boundary was not ready')
    }
    const now = Math.max(Date.now(), inbox.updatedAt + 1)
    const hash = 'a'.repeat(64)
    await window.api.barkosDecisionInbox.save({
      ...inbox,
      revision: inbox.revision + 1,
      requests: [
        {
          id: `side-effect:${dispatch.id}:${hash}:1`,
          sourceKind: 'side-effect',
          status: 'pending',
          resolutionKind: null,
          taskId: task.id,
          assignmentId: assignment.id,
          dispatchId: dispatch.id,
          requestedByWorkerId: assignment.workerId,
          risk: 'critical',
          executionHostId: dispatch.executionHostId,
          orchestrationRunId: dispatch.orchestrationRunId,
          orchestrationTaskId: dispatch.orchestrationTaskId,
          orchestrationDispatchId: dispatch.orchestrationDispatchId,
          orchestrationMessageId: null,
          orchestrationGateId: null,
          question: 'Allow Bash to perform this destructive action?',
          details: 'Bash: rm -rf build',
          options: [],
          priority: 'urgent',
          sideEffect: {
            categories: ['destructive'],
            toolName: 'Bash',
            toolInputSha256: hash,
            summary: 'Bash: rm -rf build',
            paneKey: 'e2e-capacity-tab:e2e-capacity-leaf',
            expiresAt: now + 30 * 60 * 1_000,
            consumedAt: null
          },
          proposedResolution: null,
          resolution: null,
          createdAt: now,
          lastSeenAt: now,
          resolvedAt: null
        },
        ...inbox.requests
      ],
      updatedAt: now
    })
  })
  await orcaPage.getByRole('tab', { name: 'Decisions' }).click()
  await expect(orcaPage.getByText('Tool side effect', { exact: true })).toBeVisible()
  await expect(orcaPage.getByText('Bash: rm -rf build', { exact: true })).toBeVisible()
  await expect(orcaPage.getByLabel('Response')).toHaveCount(0)
  await orcaPage.getByRole('button', { name: 'Reject', exact: true }).click()
  await expect(orcaPage.getByText('Recorded response', { exact: true })).toBeVisible()
  await expect
    .poll(async () => {
      const inbox = await orcaPage.evaluate(() => window.api.barkosDecisionInbox.load())
      return inbox?.requests.find((entry) => entry.sourceKind === 'side-effect')?.resolutionKind
    })
    .toBe('rejected')
  await orcaPage.getByRole('tab', { name: 'Memory' }).click()

  await orcaPage.evaluate(async () => {
    const [company, vault] = await Promise.all([
      window.api.barkosCompany.load(),
      window.api.barkosMemoryVault.load()
    ])
    const worker = company?.workers.find((entry) => entry.id === company.leadWorkerId)
    if (!company || !worker || !vault) {
      throw new Error('BarkOS E2E memory boundary was not ready')
    }
    const now = Date.now()
    await window.api.barkosMemoryVault.save({
      ...vault,
      candidates: [
        ...vault.candidates,
        {
          id: 'e2e-memory-proposal',
          status: 'pending',
          scope: { kind: 'project', targetId: 'e2e-workspace' },
          title: 'Verified release guidance',
          content: 'Preserve the accepted E2E release check.',
          source: {
            kind: 'accepted-evidence',
            evidenceId: 'e2e-memory-proposal',
            taskId: 'verify-e2e-memory',
            assignmentId: 'e2e-memory-assignment',
            dispatchId: 'e2e-memory-dispatch',
            workerId: worker.id,
            roleId: worker.roleId,
            workspaceId: 'e2e-workspace',
            capturedAt: now
          },
          confidence: 80,
          expiresAt: null,
          createdAt: now,
          lastSeenAt: now,
          resolvedAt: null,
          promotedMemoryId: null
        }
      ],
      revision: vault.revision + 1,
      updatedAt: Math.max(now, vault.updatedAt + 1)
    })
  })

  await orcaPage.reload()
  await waitForSessionReady(orcaPage)
  await orcaPage.getByRole('button', { name: 'Company', exact: true }).click()
  await orcaPage.getByRole('tab', { name: 'Memory' }).click()
  await expect(orcaPage.getByText('Verified release guidance')).toBeVisible()
  await orcaPage.getByRole('combobox', { name: 'Memory scope' }).click()
  await orcaPage.getByRole('option', { name: 'task', exact: true }).click()
  await orcaPage.getByLabel('Confidence (0–100)').fill('72')
  await orcaPage.getByRole('button', { name: 'Promote to memory' }).click()
  await expect(orcaPage.getByRole('heading', { name: 'Promotion proposals (0)' })).toBeVisible()
  await expect(orcaPage.getByRole('heading', { name: 'Active memory (1)' })).toBeVisible()
  await orcaPage.getByRole('tab', { name: 'Company', exact: true }).click()

  await orcaPage.getByRole('button', { name: 'Edit company', exact: true }).click()
  await expect(orcaPage.getByRole('dialog')).toBeVisible()
  await orcaPage.getByLabel('Company name').fill('BarkOS E2E Systems')
  await orcaPage.getByLabel('Mission').fill('Run a verified multi-agent company.')
  await orcaPage.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(orcaPage.getByRole('heading', { name: 'BarkOS E2E Systems' })).toBeVisible()

  await orcaPage.getByRole('button', { name: 'Add role' }).click()
  await orcaPage.getByLabel('Name').fill('Research')
  await orcaPage.getByLabel('Mission').fill('Turn evidence into clear product decisions.')
  await orcaPage.getByLabel('Capabilities').fill('research\nsynthesis')
  await orcaPage
    .getByLabel('Definition of done')
    .fill('Sources are recorded.\nFindings are reviewed.')
  await orcaPage.getByRole('button', { name: 'Save role' }).click()
  await expect(orcaPage.getByText('Research', { exact: true })).toBeVisible()

  await orcaPage.getByRole('button', { name: 'Edit Research', exact: true }).click()
  await orcaPage.getByLabel('Mission').fill('Turn verified evidence into product decisions.')
  await orcaPage.getByRole('button', { name: 'Save role' }).click()
  await expect(orcaPage.getByText('Turn verified evidence into product decisions.')).toBeVisible()

  await orcaPage.getByRole('button', { name: 'Add worker' }).last().click()
  await orcaPage.getByLabel('Name').fill('Grace E2E')
  await orcaPage.getByLabel('Agent ID').fill('codex')
  await orcaPage.getByRole('combobox', { name: 'Role' }).click()
  await orcaPage.getByRole('option', { name: 'Research' }).click()
  await orcaPage.getByLabel('Model override (optional)').fill('gpt-5.6')
  await orcaPage.getByLabel('Make this worker the company lead').check()
  await orcaPage.getByRole('button', { name: 'Save worker' }).click()
  await expect(
    orcaPage.getByLabel('Company', { exact: true }).getByText('Grace E2E', { exact: true })
  ).toBeVisible()
  await expect(orcaPage.getByText('Research · codex · gpt-5.6')).toBeVisible()

  await orcaPage.getByRole('button', { name: 'Edit Grace E2E', exact: true }).click()
  await orcaPage.getByRole('combobox', { name: 'Status' }).click()
  await orcaPage.getByRole('option', { name: 'Busy' }).click()
  await orcaPage.getByRole('button', { name: 'Save worker' }).click()
  await expect(orcaPage.getByText('Busy', { exact: true })).toBeVisible()

  await orcaPage
    .getByRole('tabpanel', { name: 'Company' })
    .getByRole('button', { name: 'Launch Grace E2E', exact: true })
    .click()
  await expect(orcaPage.getByRole('dialog')).toBeVisible()
  await expect(orcaPage.getByRole('heading', { name: 'Launch Grace E2E' })).toBeVisible()
  await expect(
    orcaPage.getByText(/automatically sends the BarkOS identity and role briefing/)
  ).toBeVisible()
  await expect(orcaPage.getByText('Full agent access', { exact: true })).toBeVisible()
  await expect(orcaPage.getByText(/Provider permission prompts are bypassed/)).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: 'Launch worker' })).toBeVisible()
  await orcaPage.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(orcaPage.getByRole('dialog')).not.toBeVisible()

  await orcaPage.evaluate(async () => {
    const company = await window.api.barkosCompany.load()
    const worker = company?.workers.find((entry) => entry.id === company.leadWorkerId)
    if (!company || !worker) {
      throw new Error('BarkOS E2E company lead was not persisted')
    }
    await window.api.barkosWorkerSessions.record({
      workerId: worker.id,
      agent: worker.agentId,
      targetId: 'e2e-runtime-target',
      workspaceId: 'e2e-workspace',
      workspaceKind: 'worktree',
      executionHostId: 'runtime:e2e-host',
      tabId: null,
      state: 'requested',
      launchedAt: Date.now()
    })
  })

  await orcaPage.reload()
  await waitForSessionReady(orcaPage)
  await orcaPage.getByRole('button', { name: 'Company', exact: true }).click()
  await expect(orcaPage.getByRole('heading', { name: 'BarkOS E2E Systems' })).toBeVisible()
  await expect(orcaPage.getByText('Remote launch identity unconfirmed')).toBeVisible()
})
