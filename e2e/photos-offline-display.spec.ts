import { test, expect } from '@playwright/test'
import { authenticateViaE2ELogin } from './helpers/auth'
import type { APIRequestContext } from '@playwright/test'
import { createImage } from './helpers/createImage'

/**
 * Real integration test for offline photo display
 * Tests the complete flow: online → create purchases with photos → offline → photos should display from cache
 *
 * This test does NOT mock APIs - it uses the real backend
 */

interface SeededPurchase {
  id: number
  brand: string
}

async function seedPurchasesWithPhoto(request: APIRequestContext): Promise<SeededPurchase[]> {
  const timestamp = Date.now()
  const imageBuffer = createImage()
  const seeded: SeededPurchase[] = []

  for (let i = 1; i <= 3; i++) {
    const brand = `TestBrand-OfflinePhotos-${timestamp}-${i}`

    const createPurchaseResponse = await request.post('http://localhost:8787/api/purchases', {
      data: {
        brand,
        category: `Test Category ${i}`,
        productType: `Test Product ${i}`,
        sizeLabel: i === 1 ? 'S' : i === 2 ? 'M' : 'L',
        purchasedAt: new Date().toISOString()
      }
    })

    if (!createPurchaseResponse.ok()) {
      continue
    }

    const purchaseData = await createPurchaseResponse.json() as { purchase?: { id: number } }
    const purchaseId = purchaseData.purchase?.id

    if (!purchaseId) {
      continue
    }

    seeded.push({ id: purchaseId, brand })

    // Attach a photo to the first seeded purchase so offline photo rendering has real data.
    if (i === 1) {
      await request.post(`http://localhost:8787/api/purchases/${purchaseId}/photos`, {
        headers: {
          'content-type': 'application/json'
        },
        data: {
          fileBase64: `data:image/png;base64,${imageBuffer.toString('base64')}`,
          mimeType: 'image/png'
        }
      })
    }
  }

  return seeded
}

test.describe('Offline Photo Display', () => {
  let seededPurchases: SeededPurchase[] = []

  test.beforeEach(async ({ context, page }) => {
    // Ensure auth is established in the same browser context used by the test page.
    await authenticateViaE2ELogin(context.request, {
      userId: 'telegram:e2e-offline-photos',
      login: 'test-offline-photos'
    })

    seededPurchases = await seedPurchasesWithPhoto(context.request)

    // Load page after login/seed so UI reflects authenticated + seeded state.
    await page.goto('http://localhost:8787/purchases', { waitUntil: 'networkidle' })

    // Hard guard: if redirected to auth, login did not stick.
    expect(page.url()).not.toContain('/auth')

    expect(seededPurchases.length).toBeGreaterThan(0)
  })

  test('should display cached photos when going offline', async ({ page, context }) => {
    // Step 1: Wait for purchases to load
    await page.waitForSelector('[data-testid="purchase-info"]', { timeout: 10000 }).catch(() => {
      // Fallback: wait for any purchase content to load
      return page.waitForSelector('h3', { timeout: 10000 })
    })

    // Verify we have some purchases loaded
    const purchaseHeaders = await page.locator('h3').all()
    expect(purchaseHeaders.length).toBeGreaterThan(0)

    // Verify seeded purchase is visible online.
    const seededPurchase = seededPurchases[0]
    expect(seededPurchase).toBeDefined()

    const seededBrand = seededPurchase?.brand || 'TestBrand-OfflinePhotos'

    const searchInput = page.getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas').first()
    await expect(searchInput).toBeVisible()
    await searchInput.fill(seededBrand)

    await expect(page.getByText(seededBrand)).toBeVisible()

    // Capture one actually rendered uploaded photo while online.
    const renderedUploadedPhotoOnline = page.locator('img[alt^="Foto "][alt*=" de "]').first()
    await expect(renderedUploadedPhotoOnline).toBeVisible()

    const onlinePhotoAlt = await renderedUploadedPhotoOnline.getAttribute('alt')
    expect(onlinePhotoAlt).toBeTruthy()

    const onlinePhotoSrc = await renderedUploadedPhotoOnline.getAttribute('src')
    expect(onlinePhotoSrc).toBeTruthy()

    // Assert image is actually rendered (decoded dimensions), not just present in DOM.
    await expect.poll(async () => {
      return await renderedUploadedPhotoOnline.evaluate((img) => {
        const image = img as HTMLImageElement
        return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
      })
    }, { timeout: 15000 }).toBe(true)

    // Ensure the seeded purchase is actually persisted to offline storage before switching offline.
    await expect.poll(async () => {
      return await page.evaluate((brand) => {
        const storageKeys = ['offlineData', 'pinia-offlineData', 'pinia-persistedstate-offlineData']
        return storageKeys.some((key) => {
          const raw = localStorage.getItem(key)
          return typeof raw === 'string' && raw.includes(brand)
        })
      }, seededBrand)
    }, { timeout: 15000 }).toBe(true)

    // Step 2: Wait for Service Worker to cache the resources
    await page.waitForTimeout(2000)

    // Step 3: Simulate going offline by disabling network
    await context.setOffline(true)

    // Step 4: Stay on the same purchases view and verify rendered content remains visible offline.
    await page.waitForTimeout(500)

    // Step 5: CRITICAL TEST - Purchases and cached content should still be visible in the current view.
    await expect(page.locator('[data-testid="purchase-info"]').first()).toBeVisible()

    // CRITICAL: verify the exact same online-rendered uploaded photo remains rendered offline.
    const renderedUploadedPhotoOffline = page.getByAltText(onlinePhotoAlt as string).first()
    await expect(renderedUploadedPhotoOffline).toBeVisible()
    await expect(renderedUploadedPhotoOffline).toHaveAttribute('src', onlinePhotoSrc as string)

    await expect.poll(async () => {
      return await renderedUploadedPhotoOffline.evaluate((img) => {
        const image = img as HTMLImageElement
        return image.complete && image.naturalWidth > 0 && image.naturalHeight > 0
      })
    }, { timeout: 15000 }).toBe(true)
  })
})
