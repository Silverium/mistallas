import type { Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { authenticateViaE2ELogin } from '../helpers/auth'
import { addPhotoToPurchaseRow } from '../helpers/addPhotoToRow'
import { expectImageToBeLoaded } from '../helpers/expectImageToBeLoaded'

async function waitForServiceWorkerControl(page: Page, timeoutMs = 15_000) {
  await expect.poll(
    () => page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        return false
      }

      const registration = await navigator.serviceWorker.ready.catch(() => null)
      return Boolean(registration?.active)
    }),
    { timeout: timeoutMs }
  ).toBe(true)

  const hasController = await page.evaluate(() => Boolean(navigator.serviceWorker.controller))

  if (!hasController) {
    await page.reload({ waitUntil: 'networkidle' })
  }

  await expect.poll(
    () => page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    { timeout: timeoutMs }
  ).toBe(true)
}

test.describe('E2E: root warmup keeps purchase photos available offline', { tag: '@offline' }, () => {
  test.beforeEach(async ({ context }) => {
    await context.setOffline(false)
  })

  test.afterEach(async ({ context }) => {
    await context.setOffline(false)
  })

  test('loading / online then navigating to /purchases offline still renders warmed purchase photos', async ({ page, context }) => {
    const unique = Date.now()
    const brand = `E2E-RootOffline-${unique}`

    await authenticateViaE2ELogin(context.request, {
      userId: `telegram:e2e-root-offline-${unique}`,
      login: `test-root-offline-${unique}`
    })

    await page.goto('/purchases', { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/purchases/)
    await waitForServiceWorkerControl(page)

    await page.getByRole('button', { name: 'Añadir compra' }).click()
    await page.getByPlaceholder('Marca (Nike, Zara...) *').fill(brand)
    await page.getByPlaceholder('Categoría (ropa, calzado...) *').fill('Ropa E2E')
    await page.getByPlaceholder('Tipo de prenda (t-shirt, jeans...) *').fill('Camiseta Warmup')
    await page.getByPlaceholder('Talla (S, M, L, 42...) *').fill(`M-${unique}`)
    await page.getByRole('button', { name: 'Guardar compra' }).click()

    await page
      .getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')
      .fill(brand)
    const row = page.locator('li', { hasText: brand }).first()
    await expect(row).toBeVisible()

    await addPhotoToPurchaseRow(row, page)
    const uploadedPhoto = row.locator('img[alt^="Foto 1"]:not([alt="Foto pendiente"])').first()
    await expect(uploadedPhoto).toBeVisible()
    await expectImageToBeLoaded(uploadedPhoto)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Mis Tallas' })).toBeVisible()
    await waitForServiceWorkerControl(page)
    await page.waitForTimeout(1500)

    await expect(page.getByRole('button', { name: 'Compras' })).toBeVisible()
    await context.setOffline(true)

    await page.getByRole('button', { name: 'Compras' }).click()
    await expect(page).toHaveURL(/\/purchases/)
    await expect(page.getByRole('heading', { name: 'Compras', exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')).toBeVisible()

    await page
      .getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')
      .fill(brand)
    const offlineRow = page.locator('li', { hasText: brand }).first()
    await expect(offlineRow).toBeVisible()

    const offlinePhoto = offlineRow.locator('img[alt^="Foto 1"]:not([alt="Foto pendiente"])').first()
    await expect(offlinePhoto).toBeVisible()
    await expectImageToBeLoaded(offlinePhoto)
  })
})
