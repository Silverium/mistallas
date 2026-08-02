import type { Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { authenticateViaE2ELogin } from './helpers/auth'

function tinyPngBuffer() {
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmj8AAAAASUVORK5CYII='
  return Buffer.from(base64, 'base64')
}

async function createPurchase(page: Page, purchase: {
  brand: string
  category: string
  productType: string
  sizeLabel: string
}) {
  await page.getByRole('button', { name: 'Añadir compra' }).click()

  await page.getByPlaceholder('Marca (Nike, Zara...) *').fill(purchase.brand)
  await page.getByPlaceholder('Categoría (ropa, calzado...) *').fill(purchase.category)
  await page.getByPlaceholder('Tipo de prenda (t-shirt, jeans...) *').fill(purchase.productType)
  await page.getByPlaceholder('Talla (S, M, L, 42...) *').fill(purchase.sizeLabel)

  await page.getByRole('button', { name: 'Guardar compra' }).click()

  await expect(page.getByText(purchase.brand)).toBeVisible()
}

async function openRowByBrand(page: Page, brand: string) {
  await page
    .getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')
    .fill(brand)

  const row = page.locator('li', { hasText: brand }).first()
  await expect(row).toBeVisible()
  return row
}

async function addPhotoToPurchaseRow(row: ReturnType<Page['locator']>, page: Page) {
  const fileChooserPromise = page.waitForEvent('filechooser')
  await row.getByLabel('Añadir foto').first().click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles({
    name: `photo-${Date.now()}.png`,
    mimeType: 'image/png',
    buffer: tinyPngBuffer()
  })
}

async function expectButtonIconToBeRendered(button: ReturnType<Page['locator']>) {
  const svg = button.locator('svg').first()

  await expect(svg).toBeVisible()
  await expect.poll(
    () => svg.evaluate((node) => {
      const element = node as SVGElement
      const renderedChildren = element.querySelectorAll('path, circle, rect, polygon, polyline, line, ellipse, use, g').length
      const html = element.innerHTML.replace(/\s+/g, '').trim()
      const width = Number(element.getAttribute('width') || 0)
      const height = Number(element.getAttribute('height') || 0)

      return {
        renderedChildren,
        hasMarkup: html.length > 0,
        hasSize: width > 0 || height > 0 || element.getBoundingClientRect().width > 0
      }
    }),
    { timeout: 5000 }
  ).toMatchObject({
    renderedChildren: expect.any(Number),
    hasMarkup: true,
    hasSize: true
  })

  await expect.poll(
    () => svg.evaluate((node) => {
      const element = node as SVGElement
      return element.querySelectorAll('path, circle, rect, polygon, polyline, line, ellipse, use, g').length
    }),
    { timeout: 5000 }
  ).toBeGreaterThan(0)
}

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

async function waitForPurchaseRemoval(page: Page, row: ReturnType<Page['locator']>, timeoutMs = 10_000) {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const remaining = await row.count()
    if (remaining === 0) {
      return true
    }

    await page.waitForTimeout(250)
  }

  return false
}

async function deletePurchaseByBrand(page: Page, brand: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await openRowByBrand(page, brand)
    await row.getByRole('button', { name: 'Eliminar' }).click({ force: true })

    const confirmHeading = page.getByRole('heading', { name: 'Confirmar eliminación' })
    await expect(confirmHeading).toBeVisible()
    await page.getByRole('button', { name: 'Eliminar' }).last().click({ force: true })
    await expect(confirmHeading).not.toBeVisible()

    const deleted = await waitForPurchaseRemoval(page, row)

    if (deleted) {
      return
    }

    await page
      .getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')
      .fill(brand)

    const remaining = await row.count()
    if (remaining === 0) {
      return
    }

    const cancelButton = page.getByRole('button', { name: 'Cancelar' }).last()
    if (await cancelButton.isVisible().catch(() => false)) {
      await cancelButton.click({ force: true })
    }

    await page.reload({ waitUntil: 'networkidle' })
  }

  await page
    .getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')
    .fill(brand)
  await expect(page.locator('li', { hasText: brand })).toHaveCount(0)
}

async function assertBrandsAbsentFromLocalOfflineData(page: Page, brands: string[]) {
  const absentInLocalStorage = await page.evaluate((targetBrands) => {
    const hasDeletedBrandInEffectiveOfflinePages = (raw: string | null) => {
      if (!raw) {
        return false
      }

      try {
        const parsed = JSON.parse(raw) as {
          purchasePages?: Record<string, { purchases?: Array<{ brand?: string | null }> }>
          state?: {
            purchasePages?: Record<string, { purchases?: Array<{ brand?: string | null }> }>
          }
        }

        const pages = parsed.purchasePages ?? parsed.state?.purchasePages ?? {}
        const unfilteredEntries = Object.entries(pages).filter(([key]) => /^\d+:\d+:$/.test(key))

        for (const [, pageData] of unfilteredEntries) {
          const purchases = Array.isArray(pageData?.purchases) ? pageData.purchases : []
          for (const purchase of purchases) {
            if (purchase?.brand && targetBrands.includes(purchase.brand)) {
              return true
            }
          }
        }
      }
      catch {
        return false
      }

      return false
    }

    const hasDeletedBrandInPendingPurchases = (raw: string | null) => {
      if (!raw) {
        return false
      }

      try {
        const parsed = JSON.parse(raw) as {
          pendingPurchases?: Array<{ brand?: string | null }>
          state?: {
            pendingPurchases?: Array<{ brand?: string | null }>
          }
        }

        const pending = parsed.pendingPurchases ?? parsed.state?.pendingPurchases ?? []
        return pending.some(item => item?.brand != null && targetBrands.includes(item.brand))
      }
      catch {
        return false
      }
    }

    const offlineKeys = ['offlineData', 'pinia-offlineData', 'pinia-persistedstate-offlineData']
    const pendingKeys = ['pendingPurchases', 'pinia-pendingPurchases', 'pinia-persistedstate-pendingPurchases']

    const foundInOfflinePages = offlineKeys.some(key => hasDeletedBrandInEffectiveOfflinePages(localStorage.getItem(key)))
    const foundInPendingPurchases = pendingKeys.some(key => hasDeletedBrandInPendingPurchases(localStorage.getItem(key)))

    return !foundInOfflinePages && !foundInPendingPurchases
  }, brands)

  expect(absentInLocalStorage).toBe(true)
}

test.describe('E2E: create and remove purchases with pending photos sync', () => {
  test.beforeEach(async ({ context }) => {
    await context.setOffline(false)
  })
  test.afterEach(async ({ context }) => {
    await context.setOffline(false)
  })

  test('auth -> create online purchase with photo -> offline pending purchase with 2 photos -> sync -> photos visible -> remove purchases one by one', async ({ page, context }) => {
    await authenticateViaE2ELogin(context.request, {
      userId: `telegram:e2e-create-remove-${Date.now()}`,
      login: `test-create-remove-${Date.now()}`
    })

    await page.goto('http://localhost:8787/purchases', { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/purchases/)
    await waitForServiceWorkerControl(page)

    const unique = Date.now()
    const onlinePurchase = {
      brand: `E2E-Online-${unique}`,
      category: 'Ropa E2E',
      productType: 'Camiseta Online',
      sizeLabel: `M-${unique}`
    }

    const pendingPurchase = {
      brand: `E2E-Pending-${unique}`,
      category: 'Ropa E2E',
      productType: 'Sudadera Pending',
      sizeLabel: `L-${unique}`
    }

    // 1.2 user creates 1 purchase and uploads a photo to it (online)
    await createPurchase(page, onlinePurchase)
    const onlineRow = await openRowByBrand(page, onlinePurchase.brand)
    await addPhotoToPurchaseRow(onlineRow, page)
    await expect(onlineRow.locator('img[alt^="Foto "][alt*=" de "]')).toHaveCount(1)

    // Capture photo identity and verify it is fully decoded while online
    const onlinePhotoImg = onlineRow.locator('img[alt^="Foto "][alt*=" de "]').first()
    const onlinePhotoAlt = await onlinePhotoImg.getAttribute('alt')
    const onlinePhotoSrc = await onlinePhotoImg.getAttribute('src')
    await expect.poll(
      async () => onlinePhotoImg.evaluate((img) => {
        const i = img as HTMLImageElement
        return i.complete && i.naturalWidth > 0 && i.naturalHeight > 0
      }),
      { timeout: 15000 }
    ).toBe(true)

    // 2. User loads purchases
    await page.reload({ waitUntil: 'networkidle' })
    await expect.poll(async () => {
      return await page.locator('[data-testid="purchase-summary"]').count()
    }).toBeGreaterThan(0)

    // 3. User goes OFFLINE
    await context.setOffline(true)
    // Refresh the app while offline to ensure the cached app shell is used
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Compras' })).toBeVisible()

    // SPA navigation from home to purchases must keep cached data and action icons rendered offline
    await page.getByRole('button', { name: 'Compras' }).click()
    await expect(page).toHaveURL(/\/purchases/)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('[data-testid="purchase-summary"]').first()).toBeVisible()
    await expectButtonIconToBeRendered(page.getByRole('button', { name: 'Añadir compra' }))
    await expectButtonIconToBeRendered(page.getByRole('button', { name: 'Editar' }).first())
    await expectButtonIconToBeRendered(page.getByRole('button', { name: 'Comparar medidas' }).first())
    // Icon API must be served from service worker cache while offline
    const iconCacheResult = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/_nuxt_icon/lucide.json?icons=git-compare%2Cpencil%2Cplus')
        if (!response.ok) {
          return { ok: false }
        }
        const body = await response.json() as { icons?: Record<string, unknown> }
        return { ok: true, iconKeys: Object.keys(body.icons ?? {}) }
      }
      catch {
        return { ok: false }
      }
    })
    expect(iconCacheResult).toMatchObject({ ok: true })
    expect((iconCacheResult as { ok: true, iconKeys: string[] }).iconKeys.length).toBeGreaterThan(0)

    // Cached online photo must remain visible and decoded offline (same src/alt, naturalWidth > 0)
    const cachedOnlineRow = await openRowByBrand(page, onlinePurchase.brand)
    const cachedPhoto = cachedOnlineRow.locator('img[alt^="Foto "][alt*=" de "]').first()
    await expect(cachedPhoto).toBeVisible()
    await expect(cachedPhoto).toHaveAttribute('src', onlinePhotoSrc as string)
    await expect(cachedPhoto).toHaveAttribute('alt', onlinePhotoAlt as string)
    await expect.poll(
      async () => cachedPhoto.evaluate((img) => {
        const i = img as HTMLImageElement
        return i.complete && i.naturalWidth > 0 && i.naturalHeight > 0
      }),
      { timeout: 15000 }
    ).toBe(true)

    // 4. User creates a PENDING purchase
    await createPurchase(page, pendingPurchase)
    let pendingRow = await openRowByBrand(page, pendingPurchase.brand)
    await expect(pendingRow.getByTestId('purchase-pending-indicator')).toBeVisible()

    // 5. User adds 2 PHOTOS to that pending purchase (while offline)
    await addPhotoToPurchaseRow(pendingRow, page)
    await addPhotoToPurchaseRow(pendingRow, page)

    await expect(pendingRow.getByText('Por subir')).toHaveCount(2)

    // We refresh the page and we expect the pending rows to still be there with the "Por subir" indicator
    await page.reload()
    pendingRow = await openRowByBrand(page, pendingPurchase.brand)
    await expect(pendingRow.getByTestId('purchase-pending-indicator')).toBeVisible()
    await expect(pendingRow.getByText('Por subir')).toHaveCount(2)

    // 6-8. User goes ONLINE, pending purchase syncs, photos migrate/sync
    await context.setOffline(false)

    await expect.poll(async () => {
      const refreshedRow = page.locator('li', { hasText: pendingPurchase.brand }).first()
      if (await refreshedRow.count() === 0) {
        return false
      }

      const pendingBadgeCount = await refreshedRow.getByTestId('purchase-pending-indicator').count()
      const pendingPhotoCount = await refreshedRow.getByText('Por subir').count()
      const uploadedPhotoCount = await refreshedRow.locator('img[alt^="Foto "][alt*=" de "]').count()

      return pendingBadgeCount === 0 && pendingPhotoCount === 0 && uploadedPhotoCount >= 2
    }, { timeout: 30000 }).toBe(true)

    pendingRow = await openRowByBrand(page, pendingPurchase.brand)
    await expect(pendingRow.getByTestId('purchase-pending-indicator')).toHaveCount(0)
    await expect(pendingRow.getByText('Por subir')).toHaveCount(0)
    await expect(pendingRow.locator('img[alt^="Foto "][alt*=" de "]')).toHaveCount(2)
    const pendingDbId = await pendingRow.getAttribute('data-db-id')

    // Purchases list must not flash to an empty state when briefly toggling offline → online
    await context.setOffline(true)
    await context.setOffline(false)
    await expect(page.locator('[data-testid="purchase-summary"]').first()).toBeVisible()
    await expect(page.getByText('No hay compras que coincidan con el filtro.')).not.toBeVisible()

    // Clear any stale filter so the unfiltered online query runs and both purchases settle
    await page.getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas').fill('')
    await page.waitForLoadState('networkidle')
    await expect.poll(
      async () => page.locator('[data-testid="purchase-summary"]').count(),
      { timeout: 15000 }
    ).toBeGreaterThanOrEqual(2)

    // Photo added to an already-synced purchase while offline must queue and upload on reconnect
    const onlineRowForOfflinePhoto = await openRowByBrand(page, onlinePurchase.brand)
    await context.setOffline(true)
    await addPhotoToPurchaseRow(onlineRowForOfflinePhoto, page)
    await expect(onlineRowForOfflinePhoto.getByText('Por subir')).toBeVisible()
    await context.setOffline(false)
    await expect.poll(async () => {
      return await onlineRowForOfflinePhoto.getByText('Por subir').count() === 0
        && await onlineRowForOfflinePhoto.locator('img[alt^="Foto "][alt*=" de "]').count() >= 2
    }, { timeout: 30000 }).toBe(true)
    const onlineDbId = await onlineRowForOfflinePhoto.getAttribute('data-db-id')

    // 10. purchases are removed one by one
    await context.setOffline(false)
    await deletePurchaseByBrand(page, pendingPurchase.brand)
    await deletePurchaseByBrand(page, onlinePurchase.brand)

    // Wait for pinia persistence to flush both deletions to localStorage before going offline
    await expect.poll(
      () => page.evaluate((brands) => {
        const rawOffline = ['offlineData', 'pinia-offlineData', 'pinia-persistedstate-offlineData']
          .map(k => localStorage.getItem(k) ?? '').join('')
        const rawPending = ['pendingPurchases', 'pinia-pendingPurchases', 'pinia-persistedstate-pendingPurchases']
          .map(k => localStorage.getItem(k) ?? '').join('')
        return brands.every(b => !rawOffline.includes(b) && !rawPending.includes(b))
      }, [pendingPurchase.brand, onlinePurchase.brand]),
      { timeout: 15000 }
    ).toBe(true)

    // Navigate to a clean purchases URL so the service worker caches a fresh
    // (empty) page before the offline reload — avoids stale SSR payload in cache
    await page.goto('http://localhost:8787/purchases', { waitUntil: 'networkidle' })

    // 11. go back offline and ensure deleted purchases are absent in local DB/cache too
    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded' })

    await expect(page.locator(`li[data-db-id="${pendingDbId}"]`)).toHaveCount(0)
    await expect(page.locator(`li[data-db-id="${onlineDbId}"]`)).toHaveCount(0)

    await assertBrandsAbsentFromLocalOfflineData(page, [pendingPurchase.brand, onlinePurchase.brand])
  })
})
