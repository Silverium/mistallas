import type { Page } from '@playwright/test'
import { test, expect } from '@playwright/test'

test.describe('offline indicator consistency', () => {
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
})
