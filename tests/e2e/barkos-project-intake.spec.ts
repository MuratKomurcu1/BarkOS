import path from 'node:path'
import { expect, test } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

test.use({ seedTestRepo: false })
test.setTimeout(120_000)

test.use({
  launchEnv: {
    ORCA_E2E_CLI_ENTRY: path.join(process.cwd(), 'out', 'cli', 'index.js')
  }
})

const barkosHookAgentCommand = [
  JSON.stringify(process.execPath),
  JSON.stringify(path.join(process.cwd(), 'tests', 'e2e', 'fixtures', 'barkos-hook-agent.cjs'))
].join(' ')

function encodeCompletion(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64')
}

test('klasör seçerek BarkOS proje ekibini gerçekten başlatır', async ({
  electronApp,
  orcaPage,
  testRepoPath
}) => {
  await waitForSessionReady(orcaPage)
  await orcaPage.evaluate(async (agentCommand) => {
    const store = window.__store
    if (!store) {
      throw new Error('BarkOS E2E renderer store is unavailable')
    }
    store.setState({ detectedAgentIds: ['codex'] })
    await store.getState().updateSettings({
      uiLanguage: 'tr',
      agentCmdOverrides: { codex: agentCommand },
      agentDefaultArgs: { codex: '' }
    })
  }, barkosHookAgentCommand)
  await electronApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [selectedPath],
      bookmarks: []
    })
  }, testRepoPath)

  await orcaPage.getByRole('button', { name: 'Şirket', exact: true }).click()
  await orcaPage.getByLabel('Şirket adı').fill('BarkOS Başlatma Testi')
  await orcaPage.getByLabel('Misyon').fill('Seçilen projeyi incele ve işi ekibe dağıt.')
  await orcaPage.getByLabel('Lider çalışanın adı').fill('Ada')
  await orcaPage.getByRole('button', { name: 'Şirketi kur' }).click()

  await expect(orcaPage.locator('[data-barkos-pixel-office="true"]')).toHaveCount(1)
  await orcaPage.getByRole('tab', { name: 'Canlı ofis', exact: true }).click()
  await expect(orcaPage.locator('[data-barkos-pixel-office="true"]')).toHaveCount(2)

  await orcaPage
    .getByLabel('Projeyi veya istediğiniz değişikliği anlatın')
    .fill('Bu projeyi incele, işi görevlere ayır ve uygulamayı başlat.')
  await orcaPage.getByRole('button', { name: 'Ekibi kur ve başlat' }).click()

  await expect
    .poll(
      () =>
        orcaPage.evaluate((selectedPath) => {
          const state = window.__store?.getState()
          return (
            state?.repos.some((repo) => repo.path === selectedPath) ||
            state?.folderWorkspaces.some((workspace) => workspace.path === selectedPath) ||
            false
          )
        }, testRepoPath),
      { timeout: 15_000 }
    )
    .toBe(true)
  await expect
    .poll(
      () =>
        orcaPage.evaluate(async () => {
          const [company, ledger, sessions] = await Promise.all([
            window.api.barkosCompany.load(),
            window.api.barkosWorkLedger.load(),
            window.api.barkosWorkerSessions.load()
          ])
          return {
            analystReady: company?.workers.some((worker) => worker.roleId === 'proje-analisti'),
            objectiveReady: ledger?.objectives.some((objective) =>
              objective.title.startsWith('Proje:')
            ),
            sessionCount: sessions?.bindings.length ?? 0
          }
        }),
      { timeout: 20_000 }
    )
    .toMatchObject({ analystReady: true, objectiveReady: true })
  await expect
    .poll(
      () =>
        orcaPage.evaluate(
          async () => (await window.api.barkosWorkerSessions.load())?.bindings.length
        ),
      { timeout: 20_000 }
    )
    .toBeGreaterThan(0)
  await expect
    .poll(
      () =>
        orcaPage.evaluate(async () => {
          const [company, ledger, sessions] = await Promise.all([
            window.api.barkosCompany.load(),
            window.api.barkosWorkLedger.load(),
            window.api.barkosWorkerSessions.load()
          ])
          const analyst = company?.workers.find((worker) => worker.roleId === 'proje-analisti')
          const analystTabId = sessions?.bindings.find(
            (binding) => binding.workerId === analyst?.id
          )?.tabId
          const analysisTask = ledger?.plans
            .flatMap((plan) => plan.tasks)
            .find((task) => task.requiredCapabilities.includes('project-analysis'))
          const projectObjective = ledger?.objectives.find((objective) =>
            objective.title.startsWith('Proje:')
          )
          const projectPlan = ledger?.plans.find(
            (plan) => plan.id === projectObjective?.activePlanId
          )
          const analysisDispatch = ledger?.dispatches.find((dispatch) => {
            const task = ledger.plans
              .flatMap((plan) => plan.tasks)
              .find((entry) => entry.id === dispatch.taskId)
            return task?.requiredCapabilities.includes('project-analysis')
          })
          const taskPromptDelivered = Object.values(
            window.__store?.getState().agentStatusByPaneKey ?? {}
          ).some(
            (status) =>
              Boolean(status.tabId && status.tabId === analystTabId) &&
              status.prompt.includes('=== TASK ===') &&
              status.prompt.includes('Kullanıcı isteği:')
          )
          const state = window.__store?.getState()
          const analystRole = company?.roles.find((role) => role.id === analyst?.roleId)
          return {
            analystSessionReady: Boolean(analystTabId),
            analysisTaskStatus: analysisTask?.status ?? null,
            analysisTaskMaterialized: Boolean(analysisTask?.orchestrationTaskId),
            objectiveBound: Boolean(projectObjective?.orchestrationBinding),
            objectiveStatus: projectObjective?.status ?? null,
            planStatus: projectPlan?.status ?? null,
            analysisDispatchState: analysisDispatch?.state ?? null,
            taskPromptDelivered,
            ledgerError: state?.barkosWorkLedgerError ?? null,
            ledgerLoadState: state?.barkosWorkLedgerLoadState ?? null,
            controlPolicyError: state?.barkosControlPolicyError ?? null,
            controlPolicyState: state?.barkosControlPolicy?.executionState ?? null,
            analystStatus: analyst?.status ?? null,
            analystCapabilities: analystRole?.capabilities ?? [],
            assignmentCount: ledger?.assignments.length ?? 0
          }
        }),
      { timeout: 30_000 }
    )
    .toMatchObject({
      analystSessionReady: true,
      analysisTaskStatus: 'running',
      analysisTaskMaterialized: true,
      objectiveBound: true,
      objectiveStatus: 'active',
      planStatus: 'active',
      analysisDispatchState: 'running',
      taskPromptDelivered: true,
      ledgerError: null,
      ledgerLoadState: 'ready',
      controlPolicyError: null,
      controlPolicyState: 'running',
      analystStatus: 'available',
      analystCapabilities: ['project-analysis', 'codebase-navigation', 'reporting'],
      assignmentCount: 1
    })

  const analysisCompletionMarker = encodeCompletion({
    subject: 'Proje incelemesi tamamlandı',
    body: 'Mimari incelendi. Uygulanabilir iş paketleri raporlandı. Baş ajan ekip planını hazırlayabilir.',
    filesModified: ['.barkos/reports/project-analysis.md'],
    reportPath: '.barkos/reports/project-analysis.md'
  })
  const analysisCompletion = await orcaPage.evaluate(async (marker) => {
    const [company, ledger, sessions] = await Promise.all([
      window.api.barkosCompany.load(),
      window.api.barkosWorkLedger.load(),
      window.api.barkosWorkerSessions.load()
    ])
    const analyst = company?.workers.find((worker) => worker.roleId === 'proje-analisti')
    const analystTabId = sessions?.bindings.find(
      (binding) => binding.workerId === analyst?.id
    )?.tabId
    const analystStatus = Object.values(window.__store?.getState().agentStatusByPaneKey ?? {}).find(
      (status) => status.tabId === analystTabId
    )
    if (!analystStatus?.terminalHandle || !ledger) {
      throw new Error('BarkOS analiz ajanının terminali bulunamadı')
    }
    return window.api.runtime.call({
      method: 'terminal.send',
      params: {
        terminal: analystStatus.terminalHandle,
        text: `BARKOS_E2E_COMPLETE:${marker}`,
        enter: true
      }
    })
  }, analysisCompletionMarker)
  expect(analysisCompletion).toMatchObject({
    ok: true,
    result: { send: { accepted: true } }
  })
  await expect
    .poll(
      () =>
        orcaPage.evaluate(async () => {
          const [company, sessions] = await Promise.all([
            window.api.barkosCompany.load(),
            window.api.barkosWorkerSessions.load()
          ])
          const analyst = company?.workers.find((worker) => worker.roleId === 'proje-analisti')
          const analystTabId = sessions?.bindings.find(
            (binding) => binding.workerId === analyst?.id
          )?.tabId
          const analystStatus = Object.values(
            window.__store?.getState().agentStatusByPaneKey ?? {}
          ).find((status) => status.tabId === analystTabId)
          if (!analystStatus?.terminalHandle) {
            return ''
          }
          const read = (await window.api.runtime.call({
            method: 'terminal.read',
            params: { terminal: analystStatus.terminalHandle, limit: 160 }
          })) as { ok: boolean; result?: { terminal?: { tail?: string[] } } }
          return read.result?.terminal?.tail?.join('\n').slice(-8_000) ?? ''
        }),
      { timeout: 15_000 }
    )
    .toContain('BARKOS_E2E_COMPLETION_STATUS_0')
  await expect
    .poll(
      () =>
        orcaPage.evaluate(async () => {
          const ledger = await window.api.barkosWorkLedger.load()
          const analysisTask = ledger?.plans
            .flatMap((plan) => plan.tasks)
            .find((task) => task.requiredCapabilities.includes('project-analysis'))
          const runId = ledger?.objectives.find(
            (objective) => objective.id === analysisTask?.objectiveId
          )?.orchestrationBinding?.runId
          if (!analysisTask?.orchestrationTaskId || !runId) {
            return null
          }
          const response = (await window.api.runtime.call({
            method: 'orchestration.taskList',
            params: { run: runId }
          })) as {
            ok: boolean
            result?: { tasks?: { id: string; status: string; result: string | null }[] }
          }
          return response.result?.tasks?.find(
            (task) => task.id === analysisTask.orchestrationTaskId
          )
        }),
      { timeout: 10_000 }
    )
    .toMatchObject({ status: 'completed', result: expect.stringContaining('worker_report') })

  await expect
    .poll(
      () =>
        orcaPage.evaluate(async () => {
          const [company, ledger, sessions] = await Promise.all([
            window.api.barkosCompany.load(),
            window.api.barkosWorkLedger.load(),
            window.api.barkosWorkerSessions.load()
          ])
          const leadTask = ledger?.plans
            .flatMap((plan) => plan.tasks)
            .find(
              (task) =>
                task.requiredCapabilities.includes('planning') &&
                task.requiredCapabilities.includes('delegation')
            )
          const leadDispatch = ledger?.dispatches.find(
            (dispatch) => dispatch.taskId === leadTask?.id
          )
          const analysisTask = ledger?.plans
            .flatMap((plan) => plan.tasks)
            .find((task) => task.requiredCapabilities.includes('project-analysis'))
          const analyst = company?.workers.find((worker) => worker.roleId === 'proje-analisti')
          const analystTabId = sessions?.bindings.find(
            (binding) => binding.workerId === analyst?.id
          )?.tabId
          const analystStatus = Object.values(
            window.__store?.getState().agentStatusByPaneKey ?? {}
          ).find((status) => status.tabId === analystTabId)
          const terminalRead = analystStatus?.terminalHandle
            ? ((await window.api.runtime.call({
                method: 'terminal.read',
                params: { terminal: analystStatus.terminalHandle, limit: 120 }
              })) as {
                ok: boolean
                result?: { terminal?: { tail?: string[] } }
              })
            : null
          return {
            companyReady: Boolean(company),
            analysisTaskStatus: analysisTask?.status ?? null,
            analysisEvidenceAccepted: ledger?.evidence.some(
              (evidence) => evidence.taskId === analysisTask?.id && evidence.status === 'accepted'
            ),
            leadTaskStatus: leadTask?.status ?? null,
            leadDispatchState: leadDispatch?.state ?? null,
            ledgerError: window.__store?.getState().barkosWorkLedgerError ?? null,
            analystTerminalTail:
              terminalRead?.result?.terminal?.tail?.join('\n').slice(-4_000) ?? ''
          }
        }),
      { timeout: 30_000 }
    )
    .toMatchObject({
      companyReady: true,
      analysisTaskStatus: 'completed',
      analysisEvidenceAccepted: true,
      leadTaskStatus: 'running',
      leadDispatchState: 'running',
      ledgerError: null
    })

  const staffingProposal = {
    version: 1,
    summary: 'İstenen değişiklik tek bir uygulama paketine ayrıldı.',
    roles: [
      {
        key: 'uygulama-gelistirici',
        name: 'Uygulama Geliştirici',
        mission: 'Onaylanan uygulama paketini geliştir ve doğrula.',
        capabilities: ['implementation', 'testing'],
        definitionOfDone: ['Değişiklik uygulandı ve doğrulama tamamlandı.'],
        instructions: 'Yalnızca atanan dosya ve görev kapsamında çalış.'
      }
    ],
    workers: [{ name: 'Nova', roleKey: 'uygulama-gelistirici' }],
    tasks: [
      {
        key: 'uygulama-paketi',
        title: 'İstenen değişikliği uygula',
        spec: 'Kullanıcı isteğini proje kurallarına uygun biçimde uygula ve test et.',
        roleKey: 'uygulama-gelistirici',
        dependencyKeys: [],
        workspacePolicy: 'folder',
        risk: 'low'
      }
    ]
  }
  const staffingCompletionMarker = encodeCompletion({
    subject: 'Ekip planı tamamlandı',
    body: 'İş paketi çıkarıldı. Uygulama görevi Nova adlı geliştiriciye ayrıldı. Başlatılmaya hazır.',
    filesModified: ['.barkos/staffing-proposal.json'],
    reportPath: '.barkos/staffing-proposal.json',
    staffingProposal
  })
  const staffingCompletion = await orcaPage.evaluate(async (marker) => {
    const [company, ledger, sessions] = await Promise.all([
      window.api.barkosCompany.load(),
      window.api.barkosWorkLedger.load(),
      window.api.barkosWorkerSessions.load()
    ])
    const leadTabId = sessions?.bindings.find(
      (binding) => binding.workerId === company?.leadWorkerId
    )?.tabId
    const leadStatus = Object.values(window.__store?.getState().agentStatusByPaneKey ?? {}).find(
      (status) => status.tabId === leadTabId
    )
    if (!leadStatus?.terminalHandle || !ledger) {
      throw new Error('BarkOS baş ajan terminali bulunamadı')
    }
    const response = await window.api.runtime.call({
      method: 'terminal.send',
      params: {
        terminal: leadStatus.terminalHandle,
        text: `BARKOS_E2E_COMPLETE:${marker}`,
        enter: true
      }
    })
    return { response, terminalHandle: leadStatus.terminalHandle }
  }, staffingCompletionMarker)
  expect(staffingCompletion).toMatchObject({
    response: { ok: true, result: { send: { accepted: true } } },
    terminalHandle: expect.stringMatching(/^term_/)
  })
  await expect
    .poll(
      () =>
        orcaPage.evaluate(async (terminalHandle) => {
          const read = (await window.api.runtime.call({
            method: 'terminal.read',
            params: { terminal: terminalHandle, limit: 160 }
          })) as { ok: boolean; result?: { terminal?: { tail?: string[] } } }
          return read.result?.terminal?.tail?.join('\n').slice(-8_000) ?? ''
        }, staffingCompletion.terminalHandle),
      { timeout: 15_000 }
    )
    .toContain('BARKOS_E2E_COMPLETION_STATUS_0')

  await expect
    .poll(
      () =>
        orcaPage.evaluate(async () => {
          const [company, ledger, sessions] = await Promise.all([
            window.api.barkosCompany.load(),
            window.api.barkosWorkLedger.load(),
            window.api.barkosWorkerSessions.load()
          ])
          const worker = company?.workers.find((entry) => entry.name === 'Nova')
          const implementationObjective = ledger?.objectives.find((objective) =>
            objective.title.startsWith('Uygulama:')
          )
          const implementationTask = ledger?.plans
            .find((plan) => plan.objectiveId === implementationObjective?.id)
            ?.tasks.find((task) => task.requiredCapabilities.includes('implementation'))
          const implementationDispatch = ledger?.dispatches.find(
            (dispatch) => dispatch.taskId === implementationTask?.id
          )
          const workerSession = sessions?.bindings.find(
            (binding) => binding.workerId === worker?.id
          )
          return {
            workerReady: Boolean(worker),
            workerSessionReady: Boolean(workerSession?.tabId),
            implementationObjectiveReady: Boolean(implementationObjective),
            implementationTaskStatus: implementationTask?.status ?? null,
            implementationDispatchState: implementationDispatch?.state ?? null,
            ledgerError: window.__store?.getState().barkosWorkLedgerError ?? null
          }
        }),
      { timeout: 40_000 }
    )
    .toMatchObject({
      workerReady: true,
      workerSessionReady: true,
      implementationObjectiveReady: true,
      implementationTaskStatus: 'running',
      implementationDispatchState: 'running',
      ledgerError: null
    })
})
