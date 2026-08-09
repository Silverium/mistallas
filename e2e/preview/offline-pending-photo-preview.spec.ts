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

test.describe('E2E: offline pending photo preview renders correctly', { tag: '@offline' }, () => {
  test.beforeEach(async ({ context }) => {
    await context.setOffline(false)
  })
  test.afterEach(async ({ context }) => {
    await context.setOffline(false)
  })

  test('pending photo renders with real size offline, then syncs and shows uploaded photo online', async ({ page, context }) => {
    await authenticateViaE2ELogin(context.request, {
      userId: `telegram:e2e-photo-preview-${Date.now()}`,
      login: `test-photo-preview-${Date.now()}`
    })

    // Load the app online first so the service worker caches the app shell
    await page.goto('http://localhost:8787/purchases', { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/purchases/)
    await waitForServiceWorkerControl(page)

    // Reload once more online so the service worker has a warm cache of the purchases page
    await page.reload({ waitUntil: 'networkidle' })

    // Go offline and reload to serve the cached app shell
    await context.setOffline(true)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Compras' })).toBeVisible()

    // Navigate to purchases via SPA while offline
    await page.getByRole('button', { name: 'Compras' }).click()
    await expect(page).toHaveURL(/\/purchases/)
    await page.waitForLoadState('networkidle')

    // Create a pending purchase while offline
    const unique = Date.now()
    const brand = `E2E-PhotoPreview-${unique}`

    await page.getByRole('button', { name: 'Añadir compra' }).click()
    await page.getByPlaceholder('Marca (Nike, Zara...) *').fill(brand)
    await page.getByPlaceholder('Categoría (ropa, calzado...) *').fill('Ropa E2E')
    await page.getByPlaceholder('Tipo de prenda (t-shirt, jeans...) *').fill('Camiseta Offline')
    await page.getByPlaceholder('Talla (S, M, L, 42...) *').fill(`M-${unique}`)
    await page.getByRole('button', { name: 'Guardar compra' }).click()
    await expect(page.getByText(brand)).toBeVisible()

    // Find the row and confirm it has the pending indicator
    await page
      .getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')
      .fill(brand)
    const row = page.locator('li', { hasText: brand }).first()
    await expect(row).toBeVisible()
    await expect(row.getByTestId('purchase-pending-indicator')).toBeVisible()

    // Add one photo to the pending purchase while offline
    await addPhotoToPurchaseRow(row, page)

    // Confirm the "Por subir" indicator and pending photo thumbnail appear
    await expect(row.getByText('Por subir')).toBeVisible()
    const pendingPhotoImg = row.locator('img[alt="Foto pendiente"]').first()
    await expect(pendingPhotoImg).toBeVisible()

    // Refresh the app — still offline — to verify the photo survives a reload
    await page.reload({ waitUntil: 'domcontentloaded' })

    // Re-locate the row after reload
    await page
      .getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')
      .fill(brand)
    const rowAfterReload = page.locator('li', { hasText: brand }).first()
    await expect(rowAfterReload).toBeVisible()
    await expect(rowAfterReload.getByTestId('purchase-pending-indicator')).toBeVisible()
    await expect(rowAfterReload.getByText('Por subir')).toBeVisible()

    // The pending photo preview image must be fully decoded (naturalWidth > 0)
    const pendingPhotoAfterReload = rowAfterReload.locator('img[alt="Foto pendiente"]').first()
    await expect(pendingPhotoAfterReload).toBeVisible()
    await expectImageToBeLoaded(pendingPhotoAfterReload)

    // Go online and wait for the pending purchase + photo to sync
    await context.setOffline(false)

    await expect.poll(async () => {
      const refreshedRow = page.locator('li', { hasText: brand }).first()
      if (await refreshedRow.count() === 0) {
        return false
      }

      const pendingBadgeCount = await refreshedRow.getByTestId('purchase-pending-indicator').count()
      const pendingPhotoCount = await refreshedRow.getByText('Por subir').count()
      const uploadedPhotoCount = await refreshedRow.locator('img[alt^="Foto 1"]:not([alt="Foto pendiente"])').count()

      return pendingBadgeCount === 0 && pendingPhotoCount === 0 && uploadedPhotoCount >= 1
    }, { timeout: 30_000 }).toBe(true)

    // Confirm synced state: no pending indicators, uploaded photo is visible and decoded
    const syncedRow = page.locator('li', { hasText: brand }).first()
    await expect(syncedRow.getByTestId('purchase-pending-indicator')).toHaveCount(0)
    await expect(syncedRow.getByText('Por subir')).toHaveCount(0)

    const uploadedPhoto = syncedRow.locator('img[alt^="Foto "]:not([alt="Foto pendiente"])').first()
    await expect(uploadedPhoto).toBeVisible()
    await expectImageToBeLoaded(uploadedPhoto)

    // Remove the synced purchase
    await page
      .getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')
      .fill(brand)
    const rowToDelete = page.locator('li', { hasText: brand }).first()
    await expect(rowToDelete).toBeVisible()
    await rowToDelete.getByRole('button', { name: 'Eliminar' }).click({ force: true })

    const confirmHeading = page.getByRole('heading', { name: 'Confirmar eliminación' })
    await expect(confirmHeading).toBeVisible()
    await page.getByRole('button', { name: 'Eliminar' }).last().click({ force: true })
    await expect(confirmHeading).not.toBeVisible()

    await expect.poll(
      async () => page.locator('li', { hasText: brand }).count(),
      { timeout: 10_000 }
    ).toBe(0)
  })
})
