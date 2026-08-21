import { expect, test } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

test.use({ dismissOnboarding: false })

test('renders the BarkOS shell and native menu in Turkish', async ({ electronApp, orcaPage }) => {
  await waitForSessionReady(orcaPage)
  await orcaPage.evaluate(async () => {
    const store = window.__store
    if (!store) {
      throw new Error('BarkOS E2E renderer store is unavailable')
    }
    await store.getState().updateSettings({ uiLanguage: 'tr' })
  })

  await expect(orcaPage.getByRole('button', { name: 'Görevler', exact: true })).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: 'Şirket', exact: true })).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: 'Otomasyonlar', exact: true })).toBeVisible()
  await expect(orcaPage.getByRole('button', { name: /^BarkOS Mobil/ })).toBeVisible()
  await expect(
    orcaPage.getByRole('button', {
      name: 'Çalışma alanlarında ve tarayıcı sekmelerinde ara',
      exact: true
    })
  ).toBeVisible()
  await expect(orcaPage.getByRole('heading', { name: 'Şirketinizi kurun' })).toBeVisible()

  const windowTitle = await electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.getTitle()
  )
  expect(windowTitle).toContain('BarkOS')
  expect(windowTitle).not.toContain('Orca')

  await expect
    .poll(() =>
      electronApp.evaluate(({ Menu }) => {
        const collect = (items: Electron.MenuItem[]): string[] =>
          items.flatMap((item) => [
            item.label.split('\t')[0],
            ...(item.submenu ? collect(item.submenu.items) : [])
          ])
        return collect(Menu.getApplicationMenu()?.items ?? [])
      })
    )
    .toEqual(expect.arrayContaining(['Ayarlar', 'Güncellemeleri Denetle...']))

  await orcaPage.getByLabel('Şirket adı').fill('BarkOS Türkçe')
  await orcaPage.getByLabel('Misyon').fill('Türkçe çalışan ajan şirketini doğrula.')
  await orcaPage.getByLabel('Lider çalışanın adı').fill('Ada')
  await orcaPage.getByRole('button', { name: 'Şirketi kur' }).click()

  await expect(orcaPage.locator('[data-barkos-office-banner="true"]')).toBeVisible()
  await expect(orcaPage.getByText('BarkOS canlı ofis')).toBeVisible()
  const pixelOffice = orcaPage.locator('[data-barkos-pixel-office="true"]')
  await expect(pixelOffice).toBeVisible()
  await expect
    .poll(() =>
      pixelOffice.evaluate((canvas: HTMLCanvasElement) => canvas.width > 0 && canvas.height > 0)
    )
    .toBe(true)
  await expect(orcaPage.getByLabel('Projeyi veya istediğiniz değişikliği anlatın')).toBeVisible()
  await expect(orcaPage.getByRole('tab', { name: 'Hedef panosu' })).toBeVisible()
  await expect(orcaPage.getByRole('tab', { name: 'Canlı ofis' })).toBeVisible()
  await orcaPage.getByRole('tab', { name: 'Kararlar' }).click()
  await expect(orcaPage.getByRole('heading', { name: 'Karar kutusu' })).toBeVisible()
  await expect(orcaPage.getByText('Etkin BarkOS çalışması yok')).toBeVisible()

  const visibleText = await orcaPage.locator('body').innerText()
  expect(visibleText).not.toMatch(/\bOrca\b/)
  expect(visibleText).not.toMatch(/\b(Company|Decision|Refresh|Worker|Objective)\b/)
})
