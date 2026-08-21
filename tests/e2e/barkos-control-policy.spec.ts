import { expect, test } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

test('persists BarkOS company controls through the real Electron boundary', async ({
  orcaPage
}) => {
  await waitForSessionReady(orcaPage)
  await orcaPage.getByRole('button', { name: 'Company', exact: true }).click()
  await orcaPage.getByLabel('Company name').fill('BarkOS Control E2E')
  await orcaPage.getByLabel('Mission').fill('Prove bounded company execution.')
  await orcaPage.getByLabel('Lead worker name').fill('Ada Control')
  await orcaPage.getByRole('button', { name: 'Create company' }).click()

  await orcaPage.getByRole('tab', { name: 'Control' }).click()
  await expect(orcaPage.getByRole('heading', { name: 'Company controls' })).toBeVisible()
  await expect(orcaPage.getByText('Running', { exact: true })).toBeVisible()
  await expect(orcaPage.getByLabel('Active Dispatches')).toHaveValue('4')

  await orcaPage.getByLabel('Active Dispatches').fill('6')
  await orcaPage.getByLabel('Assignments per worker').fill('3')
  await orcaPage.getByLabel('Dispatch budget').fill('120')
  await orcaPage.getByRole('button', { name: 'Save limits' }).click()
  await expect
    .poll(
      async () => (await orcaPage.evaluate(() => window.api.barkosControlPolicy.load()))?.revision
    )
    .toBe(1)

  await orcaPage.getByRole('button', { name: 'Pause new work' }).click()
  await expect(orcaPage.getByText('Paused', { exact: true })).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: 'Resume new work' })).toBeVisible()

  await orcaPage.reload()
  await waitForSessionReady(orcaPage)
  await orcaPage.getByRole('button', { name: 'Company', exact: true }).click()
  await orcaPage.getByRole('tab', { name: 'Control' }).click()
  await expect(orcaPage.getByText('Paused', { exact: true })).toBeVisible()
  await expect(orcaPage.getByLabel('Active Dispatches')).toHaveValue('6')
  await expect(orcaPage.getByLabel('Assignments per worker')).toHaveValue('3')
  await expect(orcaPage.getByLabel('Dispatch budget')).toHaveValue('120')

  const policy = await orcaPage.evaluate(() => window.api.barkosControlPolicy.load())
  expect(policy).toMatchObject({
    executionState: 'paused',
    maxConcurrentDispatches: 6,
    maxActiveAssignmentsPerWorker: 3,
    maxDispatchesPerObjective: 120,
    revision: 2
  })
})
