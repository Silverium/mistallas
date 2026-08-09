import type { Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { authenticateViaE2ELogin } from '../helpers/auth'
import { addPhotoToPurchaseRow } from '../helpers/addPhotoToRow'

const getReconnectToastCount = (page: Page) => {
  return page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>
    return Number(win.__reconnectToastCount ?? 0)
  })
}

test.describe('offline indicator consistency', { tag: '@offline' }, () => {
  test.beforeEach(async ({ context }) => {
    await context.setOffline(false)
  })

  test.afterEach(async ({ context }) => {
    await context.setOffline(false)
  })

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

  async function emitConnectivityEvent(page: Page, offline: boolean) {
    await page.evaluate((isOffline) => {
      window.dispatchEvent(new Event(isOffline ? 'offline' : 'online'))
    }, offline)
  }

  async function installReconnectToastCounter(page: Page) {
    await page.evaluate(() => {
      const win = window as unknown as Record<string, unknown>
      const marker = '__reconnectToastCounterInstalled'
      if (win[marker]) {
        return
      }

      win.__reconnectToastCount = 0

      const increment = () => {
        const current = Number(win.__reconnectToastCount ?? 0)
        win.__reconnectToastCount = current + 1
      }

      const countedToastItems = new WeakSet<HTMLElement>()

      const tryCountFromNode = (node: Node) => {
        if (!(node instanceof HTMLElement)) {
          return
        }

        const items: HTMLElement[] = []

        if (node instanceof HTMLLIElement) {
          items.push(node)
        }

        for (const nestedItem of Array.from(node.querySelectorAll('li'))) {
          if (nestedItem instanceof HTMLElement) {
            items.push(nestedItem)
          }
        }

        for (const item of items) {
          if (!(item.textContent?.includes('Conexión restablecida.') ?? false)) {
            continue
          }

          const notificationsRegion = item.closest('[aria-label^="Notifications"]')
          if (!notificationsRegion) {
            continue
          }

          if (countedToastItems.has(item)) {
            continue
          }

          countedToastItems.add(item)
          increment()
        }
      }

      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const addedNode of mutation.addedNodes) {
            tryCountFromNode(addedNode)
          }
        }
      })

      observer.observe(document.body, {
        childList: true,
        subtree: true
      })

      win.__reconnectToastObserver = observer
      win[marker] = true
    })
  }

  test('stays in sync after repeated offline/online toggles', async ({ page, context }) => {
    await page.goto('/')
    await waitForServiceWorkerControl(page)

    const indicator = page.getByTestId('offline-indicator')
    await expect(indicator).toHaveCount(0)

    for (let i = 0; i < 4; i++) {
      await context.setOffline(true)
      await emitConnectivityEvent(page, true)

      await expect(indicator).toBeVisible()

      await context.setOffline(false)
      await emitConnectivityEvent(page, false)

      await expect(indicator).toHaveCount(0)
    }
  })

  test('offline + refresh keeps indicator correct after hydration', async ({ page, context }) => {
    await page.goto('/')
    await waitForServiceWorkerControl(page)

    await context.setOffline(true)
    await emitConnectivityEvent(page, true)
    await page.goto('/')

    const indicator = page.getByTestId('offline-indicator')
    await expect(indicator).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Mis Tallas' })).toBeVisible()
    await page.waitForTimeout(1000) // Wait for hydration/listeners.
    await emitConnectivityEvent(page, true)
    await expect(indicator).toBeVisible()

    await context.setOffline(false)
    await emitConnectivityEvent(page, false)

    await expect(indicator).toHaveCount(0)
  })

  test('pending photo + offline refresh keeps indicator offline and pending preview visible', async ({ page, context }) => {
    const unique = Date.now()
    const brand = `E2E-OfflineIndicator-${unique}`

    await authenticateViaE2ELogin(context.request, {
      userId: `telegram:e2e-offline-indicator-${unique}`,
      login: `offline-indicator-${unique}`
    })

    await page.goto('http://localhost:8787/purchases', { waitUntil: 'networkidle' })
    await waitForServiceWorkerControl(page)

    await page.getByRole('button', { name: 'Añadir compra' }).click()
    await page.getByPlaceholder('Marca (Nike, Zara...) *').fill(brand)
    await page.getByPlaceholder('Categoría (ropa, calzado...) *').fill('Ropa E2E')
    await page.getByPlaceholder('Tipo de prenda (t-shirt, jeans...) *').fill('Camiseta')
    await page.getByPlaceholder('Talla (S, M, L, 42...) *').fill('M')
    await page.getByRole('button', { name: 'Guardar compra' }).click()

    await page
      .getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')
      .fill(brand)

    const row = page.locator('li', { hasText: brand }).first()
    await expect(row).toBeVisible()

    await context.setOffline(true)
    await emitConnectivityEvent(page, true)

    await addPhotoToPurchaseRow(row, page)

    await expect(row.getByText('Por subir')).toBeVisible()
    await expect(page.getByTestId('offline-indicator')).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Mis Tallas' })).toBeVisible()

    await page
      .getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')
      .fill(brand)

    const rowAfterReload = page.locator('li', { hasText: brand }).first()
    await expect(rowAfterReload).toBeVisible()
    await expect(rowAfterReload.getByText('Por subir')).toBeVisible()

    await emitConnectivityEvent(page, true)
    await expect(page.getByTestId('offline-indicator')).toBeVisible()
  })

  test('does not duplicate reconnect toast after pending offline work recovers on /purchases', async ({ page, context }) => {
    const unique = Date.now()
    const brand = `E2E-ReconnectToast-${unique}`

    await authenticateViaE2ELogin(context.request, {
      userId: `telegram:e2e-reconnect-toast-${unique}`,
      login: `reconnect-toast-${unique}`
    })

    await page.goto('http://localhost:8787/purchases', { waitUntil: 'networkidle' })
    await waitForServiceWorkerControl(page)
    await installReconnectToastCounter(page)

    await context.setOffline(true)
    await emitConnectivityEvent(page, true)
    await expect(page.getByTestId('offline-indicator')).toBeVisible()

    await page.getByRole('button', { name: 'Añadir compra' }).click()
    await page.getByPlaceholder('Marca (Nike, Zara...) *').fill(brand)
    await page.getByPlaceholder('Categoría (ropa, calzado...) *').fill('Ropa E2E')
    await page.getByPlaceholder('Tipo de prenda (t-shirt, jeans...) *').fill('Chaqueta')
    await page.getByPlaceholder('Talla (S, M, L, 42...) *').fill('L')
    await page.getByRole('button', { name: 'Guardar compra' }).click()

    await page
      .getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')
      .fill(brand)

    const row = page.locator('li', { hasText: brand }).first()
    await expect(row).toBeVisible()
    await expect(row.getByTestId('purchase-pending-indicator')).toBeVisible()

    await addPhotoToPurchaseRow(row, page)
    await expect(row.getByText('Por subir')).toBeVisible()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('button', { name: 'Mis Tallas' })).toBeVisible()
    await installReconnectToastCounter(page)

    await page
      .getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')
      .fill(brand)

    const rowAfterReload = page.locator('li', { hasText: brand }).first()
    await expect(rowAfterReload).toBeVisible()
    await expect(rowAfterReload.getByText('Por subir')).toBeVisible()
    await expect(page.getByTestId('offline-indicator')).toBeVisible()

    await context.setOffline(false)
    await emitConnectivityEvent(page, false)

    await expect.poll(async () => {
      const refreshedRow = page.locator('li', { hasText: brand }).first()
      if (await refreshedRow.count() === 0) {
        return false
      }

      const pendingBadgeCount = await refreshedRow.getByTestId('purchase-pending-indicator').count()
      const pendingPhotoCount = await refreshedRow.getByText('Por subir').count()

      return pendingBadgeCount === 0 && pendingPhotoCount === 0
    }, { timeout: 30_000 }).toBe(true)

    await expect.poll(
      () => getReconnectToastCount(page),
      { timeout: 10_000 }
    ).toBe(1)

    await page.waitForTimeout(4_000)
    await expect(getReconnectToastCount(page)).resolves.toBe(1)
  })

  test('shows one reconnect toast per reconnect cycle (two cycles => two toasts)', async ({ page, context }) => {
    await page.goto('http://localhost:8787/', { waitUntil: 'networkidle' })
    await waitForServiceWorkerControl(page)
    await installReconnectToastCounter(page)

    for (let i = 0; i < 2; i++) {
      await context.setOffline(true)
      await emitConnectivityEvent(page, true)
      await expect(page.getByTestId('offline-indicator')).toBeVisible()

      await context.setOffline(false)
      await emitConnectivityEvent(page, false)
      await expect(page.getByTestId('offline-indicator')).toHaveCount(0)

      await expect.poll(
        () => getReconnectToastCount(page),
        { timeout: 10_000 }
      ).toBe(i + 1)
    }

    await page.waitForTimeout(3_000)
    await expect(getReconnectToastCount(page)).resolves.toBe(2)
  })
})
