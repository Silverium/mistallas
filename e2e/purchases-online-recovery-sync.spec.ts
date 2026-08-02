/// <reference types="node" />
import { test, expect } from '@playwright/test'
import { authenticateViaE2ELogin } from './helpers/auth'

const cachedPurchase = {
  id: 302,
  brand: 'Acme',
  category: 'ropa',
  productType: 'Chaqueta',
  sizeLabel: 'M',
  purchasedAt: '2026-07-01T00:00:00.000Z',
  photoSlots: []
}

function purchasesResponse() {
  return {
    purchases: [cachedPurchase],
    pagination: {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1
    }
  }
}

function tinyPngBuffer() {
  const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+nmj8AAAAASUVORK5CYII='
  return Buffer.from(base64, 'base64')
}

test.describe('purchases offline navigation and recovery', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext()

    // Authenticate the test user via e2e-login endpoint
    await authenticateViaE2ELogin(context.request)

    // Create a test purchase in the real database so tests have data to work with
    try {
      await context.request.post('http://localhost:8787/api/purchases', {
        data: {
          brand: 'Acme',
          category: 'ropa',
          productType: 'Chaqueta',
          sizeLabel: 'M',
          purchasedAt: '2026-07-01T00:00:00.000Z'
        }
      })
      console.log('✓ Created test purchase for offline navigation tests')
    }
    catch (err) {
      console.log('ℹ Test purchase creation skipped (may already exist)')
    }

    await context.close()
  })

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((purchase) => {
      const seedPersistedStore = (key: string, value: unknown) => {
        const payload = JSON.stringify(value)
        localStorage.setItem(key, payload)
        localStorage.setItem(`pinia-${key}`, payload)
        localStorage.setItem(`pinia-persistedstate-${key}`, payload)
      }

      localStorage.setItem('offline-user-snapshot', JSON.stringify({
        id: 'e2e-user',
        name: 'E2E User',
        email: 'e2e@example.com'
      }))

      if (!localStorage.getItem('__e2e_force_offline')) {
        localStorage.setItem('__e2e_force_offline', '0')
      }

      Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        get: () => localStorage.getItem('__e2e_force_offline') !== '1'
      })

      localStorage.setItem('offline-last-synced', new Date().toISOString())
      localStorage.setItem('offline-resources-status', 'ready')
      localStorage.setItem('offline-pages-status', 'ready')
      localStorage.setItem('offline-resources-ready-at', new Date().toLocaleString('es'))
      localStorage.setItem('offline-pages-ready-at', new Date().toLocaleString('es'))

      seedPersistedStore('offlineData', {
        purchasePages: {
          '1:20:': {
            purchases: [purchase],
            pagination: {
              page: 1,
              limit: 20,
              total: 1,
              totalPages: 1
            }
          }
        },
        measurements: []
      })
      seedPersistedStore('offlineQueue', { queue: [] })
    }, cachedPurchase)
  })

  test('offline navigation from home keeps action icons rendered', async ({ page }) => {
    const prefetchedIcons = new Set<string>()

    await page.route('**/api/_nuxt_icon/**', async (route) => {
      const url = new URL(route.request().url())
      const rawIcons = url.searchParams.get('icons')

      if (rawIcons) {
        for (const icon of rawIcons.split(',')) {
          prefetchedIcons.add(icon)
        }
      }

      await route.continue()
    })

    // Scenario 1: Online first, then go offline via app state
    await page.goto('/')
    await expect(page.getByText('Disponible offline')).toBeVisible()
    await expect.poll(() => prefetchedIcons.has('plus')).toBe(true)
    await expect.poll(() => prefetchedIcons.has('filter')).toBe(true)
    await expect.poll(() => prefetchedIcons.has('pencil')).toBe(true)
    await expect.poll(() => prefetchedIcons.has('git-compare')).toBe(true)

    await page.evaluate(() => {
      localStorage.setItem('__e2e_force_offline', '1')
      window.dispatchEvent(new Event('offline'))
    })

    await page.getByRole('button', { name: 'Compras' }).click()
    await expect(page).toHaveURL(/\/purchases/)
    await expect(page.getByText('Acme · Chaqueta · Talla M')).toBeVisible()

    const addPurchaseButton = page.getByRole('button', { name: 'Añadir compra' })
    const editButton = page.getByRole('button', { name: 'Editar' })
    const compareButton = page.getByRole('button', { name: 'Comparar medidas' })

    await expect(addPurchaseButton).toBeVisible()
    await expect(editButton).toBeVisible()
    await expect(compareButton).toBeVisible()

    // Critical: Icons should be visible (not loading)
    await expect(addPurchaseButton.locator('svg').first()).toBeVisible()
    await expect(editButton.locator('svg').first()).toBeVisible()
    await expect(compareButton.locator('svg').first()).toBeVisible()

    await expect(page.getByRole('button', { name: 'Editar' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Comparar medidas' })).toBeVisible()
    await expect(page.getByLabel('Añadir foto').first()).toBeVisible()
  })

  test('offline icon API request with subset query is served from cache', async ({ page }) => {
    const prefetchedIcons = new Set<string>()

    await page.route('**/api/_nuxt_icon/**', async (route) => {
      const url = new URL(route.request().url())
      const rawIcons = url.searchParams.get('icons')

      if (rawIcons) {
        for (const icon of rawIcons.split(',')) {
          prefetchedIcons.add(icon)
        }
      }

      await route.continue()
    })

    await page.goto('/')
    await expect(page.getByText('Disponible offline')).toBeVisible()

    await expect.poll(() => prefetchedIcons.has('plus')).toBe(true)
    await expect.poll(() => prefetchedIcons.has('pencil')).toBe(true)
    await expect.poll(() => prefetchedIcons.has('git-compare')).toBe(true)

    await page.evaluate(() => {
      localStorage.setItem('__e2e_force_offline', '1')
      window.dispatchEvent(new Event('offline'))
    })

    await page.getByRole('button', { name: 'Compras' }).click()
    await expect(page).toHaveURL(/\/purchases/)

    const iconRequestResult = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/_nuxt_icon/lucide.json?icons=git-compare%2Cpencil%2Cplus')
        if (!response.ok) {
          return { ok: false, status: response.status }
        }

        const body = await response.json() as {
          icons?: Record<string, unknown>
        }

        return {
          ok: true,
          iconKeys: Object.keys(body.icons ?? {})
        }
      }
      catch {
        return { ok: false, status: -1 }
      }
    })

    expect(iconRequestResult).toMatchObject({ ok: true })
    expect(iconRequestResult).toMatchObject({
      iconKeys: expect.arrayContaining(['plus', 'pencil', 'git-compare'])
    })
  })

  test('queued photo upload flushes automatically on first online recovery after offline refresh', async ({ page }) => {
    let uploadHits = 0

    await page.route('**/api/purchases**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())

      if (request.method() === 'POST' && /\/api\/purchases\/302\/photos\/?$/.test(url.pathname)) {
        uploadHits++
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true })
        })
        return
      }

      if (request.method() === 'GET' && /\/api\/purchases\/302\/photos\/?$/.test(url.pathname)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(purchasesResponse())
      })
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Ir a compras' }).click()
    await expect(page).toHaveURL(/\/purchases/)

    await page.evaluate(() => {
      localStorage.setItem('__e2e_force_offline', '1')
      window.dispatchEvent(new Event('offline'))
    })
    await page.reload()

    // Re-enter purchases route if SSR redirected to home.
    await expect(page.getByRole('button', { name: 'Ir a compras' })).toBeVisible()
    await page.getByRole('button', { name: 'Ir a compras' }).click()
    await expect(page).toHaveURL(/\/purchases/)
    await expect(page.getByText('Acme')).toBeVisible()

    // Simulate queued photo upload created while offline.
    await page.evaluate(() => {
      const root = document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null
      const app = root?.__vue_app__ as
        | { config?: { globalProperties?: Record<string, unknown> }, _context?: { provides?: Record<string, unknown> } }
        | undefined

      const pinia = (app?.config?.globalProperties?.$pinia
        ?? app?._context?.provides?.pinia) as
        | { _s?: Map<string, Record<string, unknown>> }
        | undefined

      const queueStore = pinia?._s?.get('offlineQueue') as
        | { enqueue?: (entry: { method: 'POST' | 'PATCH' | 'DELETE' | 'GET', url: string, body?: unknown }) => void }
        | undefined

      if (!queueStore?.enqueue) {
        throw new Error('offlineQueue store unavailable in E2E')
      }

      queueStore.enqueue({
        method: 'POST',
        url: '/api/purchases/302/photos',
        body: {
          fileBase64: 'data:image/webp;base64,AAAA',
          mimeType: 'image/webp'
        }
      })
    })

    await page.evaluate(() => {
      localStorage.setItem('__e2e_force_offline', '0')
      window.dispatchEvent(new Event('online'))
    })

    await expect.poll(() => uploadHits).toBeGreaterThan(0)
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const root = document.querySelector('#__nuxt') as { __vue_app__?: unknown } | null
        const app = root?.__vue_app__ as
          | { config?: { globalProperties?: Record<string, unknown> }, _context?: { provides?: Record<string, unknown> } }
          | undefined

        const pinia = (app?.config?.globalProperties?.$pinia
          ?? app?._context?.provides?.pinia) as
          | { _s?: Map<string, Record<string, unknown>> }
          | undefined

        const queueStore = pinia?._s?.get('offlineQueue') as
          | { queue?: Array<Record<string, unknown>> }
          | undefined

        return queueStore?.queue?.length ?? -1
      })
    }).toBe(0)
  })

  test('when back online, purchases list stays visible and does not disappear', async ({ page }) => {
    await page.route('**/api/purchases**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(purchasesResponse())
      })
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Compras' }).click()
    await expect(page).toHaveURL(/\/purchases/)
    await expect(page.getByText('Acme · Chaqueta · Talla M')).toBeVisible()

    await page.evaluate(() => {
      localStorage.setItem('__e2e_force_offline', '1')
      window.dispatchEvent(new Event('offline'))
    })
    await page.waitForTimeout(300)
    await page.evaluate(() => {
      localStorage.setItem('__e2e_force_offline', '0')
      window.dispatchEvent(new Event('online'))
    })

    await expect(page.getByTestId('purchase-summary').first()).toBeVisible()
    await expect(page.getByText('No hay compras que coincidan con el filtro.')).not.toBeVisible()
  })

  test('online event burst while recovering does not trigger purchases refetch loop', async ({ page }) => {
    let allPurchasesGetHits = 0
    let recoveryFetchHits = 0

    await page.route('**/api/purchases**', async (route) => {
      if (route.request().method() === 'GET') {
        allPurchasesGetHits++

        const url = new URL(route.request().url())
        if (url.pathname === '/api/purchases' && url.searchParams.has('_recovery')) {
          recoveryFetchHits++
        }
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(purchasesResponse())
      })
    })

    await page.route('**/api/measurements**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      })
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Compras' }).click()
    await expect(page).toHaveURL(/\/purchases/)

    await expect.poll(() => allPurchasesGetHits).toBeGreaterThan(0)

    await page.evaluate(() => {
      localStorage.setItem('__e2e_force_offline', '1')
      window.dispatchEvent(new Event('offline'))
    })

    const recoveryHitsBeforeBurst = recoveryFetchHits

    await page.evaluate(() => {
      localStorage.setItem('__e2e_force_offline', '0')

      for (let i = 0; i < 10; i++) {
        window.dispatchEvent(new Event('online'))
      }
    })

    await expect.poll(() => recoveryFetchHits, { timeout: 5_000 }).toBeGreaterThan(recoveryHitsBeforeBurst)
    await page.waitForTimeout(2_500)

    const reconnectRecoveryDelta = recoveryFetchHits - recoveryHitsBeforeBurst
    expect(reconnectRecoveryDelta).toBeLessThanOrEqual(2)

    await expect(page.getByTestId('purchase-summary').first()).toBeVisible()
    await expect(page.getByText('No hay compras que coincidan con el filtro.')).not.toBeVisible()
  })

  test('offline add photo then online: uploads and refreshes purchase item with uploaded photo slot', async ({ page }) => {
    let uploaded = false

    await page.route('**/api/purchases**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())

      if (request.method() === 'POST' && /\/api\/purchases\/302\/photos\/?$/.test(url.pathname)) {
        uploaded = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true })
        })
        return
      }

      const payload = uploaded
        ? {
            purchases: [{ ...cachedPurchase, photoSlots: [1] }],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
          }
        : purchasesResponse()

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload)
      })
    })

    await page.route('**/api/purchases/302/photos/1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: tinyPngBuffer()
      })
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Compras' }).click()
    await expect(page).toHaveURL(/\/purchases/)
    await expect(page.getByText('Acme · Chaqueta · Talla M')).toBeVisible()

    // Offline: add a photo through the real file input flow.
    await page.evaluate(() => {
      localStorage.setItem('__e2e_force_offline', '1')
      window.dispatchEvent(new Event('offline'))
    })

    await page.getByLabel('Añadir foto').first().click()
    await page.locator('#purchase-photo-input').setInputFiles({
      name: 'tiny.png',
      mimeType: 'image/png',
      buffer: tinyPngBuffer()
    })

    await expect(page.getByText('Por subir')).toBeVisible()

    // Online recovery: queued upload should flush and purchase item should refresh.
    await page.evaluate(() => {
      localStorage.setItem('__e2e_force_offline', '0')
      window.dispatchEvent(new Event('online'))
    })

    await expect.poll(() => uploaded).toBe(true)
    await expect(page.getByLabel('Abrir foto 1 de Acme')).toBeVisible()
  })

  test('from home -> offline -> purchases -> add picture preview -> online uploads and refreshes item', async ({ page }) => {
    let uploaded = false

    await page.route('**/api/purchases**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())

      if (request.method() === 'POST' && /\/api\/purchases\/302\/photos\/?$/.test(url.pathname)) {
        uploaded = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true })
        })
        return
      }

      const payload = uploaded
        ? {
            purchases: [{ ...cachedPurchase, photoSlots: [1] }],
            pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
          }
        : purchasesResponse()

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload)
      })
    })

    await page.route('**/api/purchases/302/photos/1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: tinyPngBuffer()
      })
    })

    // 1) user opens /
    await page.goto('/')

    // 2) user goes offline
    await page.evaluate(() => {
      localStorage.setItem('__e2e_force_offline', '1')
      window.dispatchEvent(new Event('offline'))
    })

    // 3) user clicks /purchases and sees items
    await page.getByRole('button', { name: 'Compras' }).click()
    await expect(page).toHaveURL(/\/purchases/)
    await expect(page.getByText('Acme · Chaqueta · Talla M')).toBeVisible()

    // 4) user adds a picture and sees pending preview
    await page.getByLabel('Añadir foto').first().click()
    await page.locator('#purchase-photo-input').setInputFiles({
      name: 'tiny.png',
      mimeType: 'image/png',
      buffer: tinyPngBuffer()
    })
    await expect(page.getByText('Por subir')).toBeVisible()

    // 5) user goes online and sees uploaded slot
    await page.evaluate(() => {
      localStorage.setItem('__e2e_force_offline', '0')
      window.dispatchEvent(new Event('online'))
    })

    await expect.poll(() => uploaded).toBe(true)
    await expect(page.getByText('Por subir')).not.toBeVisible()
    await expect(page.getByText('Acme · Chaqueta · Talla M')).toBeVisible()
  })

  test('offline refresh from purchases keeps items available', async ({ page }) => {
    await page.route('**/api/purchases**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(purchasesResponse())
      })
    })

    await page.goto('/')
    await page.getByRole('button', { name: 'Compras' }).click()
    await expect(page).toHaveURL(/\/purchases/)
    await expect(page.getByText('Acme · Chaqueta · Talla M')).toBeVisible()

    await page.evaluate(() => {
      localStorage.setItem('__e2e_force_offline', '1')
      window.dispatchEvent(new Event('offline'))
    })

    await page.reload()

    // Depending on SSR/auth middleware, an offline hard refresh may land on '/'.
    // In either case, the user should still be able to access purchases offline
    // and see cached items.
    if (!/\/purchases/.test(page.url())) {
      await expect(page.getByRole('button', { name: 'Ir a compras' })).toBeVisible()
      await page.getByRole('button', { name: 'Ir a compras' }).click()
      await expect(page).toHaveURL(/\/purchases/)
    }

    await expect(page.getByText('Acme · Chaqueta · Talla M')).toBeVisible()
    await expect(page.getByText('No hay compras que coincidan con el filtro.')).not.toBeVisible()
  })

  test('online navigation with filter query fetches and shows filtered purchases', async ({ page }) => {
    let filteredSearchHits = 0

    await page.route('**/api/purchases**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const search = (url.searchParams.get('search') ?? '').toLowerCase()

      if (search === 'adidas') {
        filteredSearchHits++
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            purchases: [{
              id: 901,
              brand: 'Adidas',
              category: 'calzado',
              productType: 'Zapatillas',
              sizeLabel: '42',
              purchasedAt: '2026-07-02T00:00:00.000Z',
              photoSlots: []
            }],
            pagination: {
              page: 1,
              limit: 20,
              total: 1,
              totalPages: 1
            }
          })
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(purchasesResponse())
      })
    })

    await page.route('**/api/measurements**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      })
    })

    // In this harness, hard-refresh deep links can SSR-redirect due auth,
    // so validate the same first-load filter behavior via client navigation.
    await page.goto('/')
    await page.getByPlaceholder('Busca una compra por marca, categoría o talla...').fill('adidas')
    await page.getByRole('button', { name: 'Ir a compras' }).click()
    await expect(page).toHaveURL(/\/purchases\?filter=adidas/)

    await expect.poll(() => filteredSearchHits).toBeGreaterThan(0)
    await expect(page.getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')).toHaveValue('adidas')
    await expect(page.getByText('Adidas · Zapatillas · Talla 42')).toBeVisible()
    await expect(page.getByText('Acme · Chaqueta · Talla M')).not.toBeVisible()
  })
})
