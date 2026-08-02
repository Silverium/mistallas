import { test, expect } from '@playwright/test'

test.describe('offline indicator consistency', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!localStorage.getItem('__e2e_force_offline')) {
        localStorage.setItem('__e2e_force_offline', '0')
      }

      Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        get: () => localStorage.getItem('__e2e_force_offline') !== '1'
      })
    })
  })

  test('stays in sync after repeated offline/online toggles', async ({ page }) => {
    await page.goto('/')

    const indicator = page.getByTestId('offline-indicator')
    await expect(indicator).toHaveCount(0)

    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => {
        localStorage.setItem('__e2e_force_offline', '1')
        window.dispatchEvent(new Event('offline'))
      })

      await expect(indicator).toBeVisible()

      await page.evaluate(() => {
        localStorage.setItem('__e2e_force_offline', '0')
        window.dispatchEvent(new Event('online'))
      })

      await expect(indicator).toHaveCount(0)
    }
  })

  test('offline + refresh keeps indicator correct on first render', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('__e2e_force_offline', '1')
    })

    await page.goto('/')

    const indicator = page.getByTestId('offline-indicator')
    await expect(indicator).toBeVisible()

    await page.reload()
    await expect(indicator).toBeVisible()

    await page.evaluate(() => {
      localStorage.setItem('__e2e_force_offline', '0')
      window.dispatchEvent(new Event('online'))
    })

    await expect(indicator).toHaveCount(0)
  })
})
