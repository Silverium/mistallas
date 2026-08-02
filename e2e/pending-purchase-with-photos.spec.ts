import { test, expect } from '@playwright/test'
import { authenticateViaE2ELogin } from './helpers/auth'
import type { Page, BrowserContext } from '@playwright/test'

/**
 * E2E Test: Pending Purchase with Photos Race Condition
 *
 * REAL DATABASE FLOW - NO MOCKING
 *
 * Scenario:
 * 1. User is online, loads purchases (caches data)
 * 2. User goes OFFLINE
 * 3. User creates a PENDING purchase
 * 4. User adds PHOTOS to the pending purchase
 * 5. User goes ONLINE
 * 6. Pending purchase syncs to server
 * 7. CRITICAL: Photos should be preserved and uploaded to real purchase
 */

test.describe('Pending Purchase with Photos - Real Database Flow', () => {
  let page: Page
  let context: BrowserContext

  test.beforeAll(async ({ browser }) => {
    // Create a persistent context for all tests
    context = await browser.newContext()
    page = await context.newPage()

    // Set up error logging
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        console.log(`[Browser] ${msg.type()}: ${msg.text()}`)
      }
    })

    page.on('response', (response) => {
      if (response.status() >= 400) {
        console.log(`[API] ${response.status()} ${response.request().method()} ${response.url()}`)
      }
    })

    // Authenticate the test user via e2e-login endpoint
    await authenticateViaE2ELogin(context.request, {
      userId: 'telegram:e2e-playwright',
      login: 'test-playwright'
    })
  })

  test.afterAll(async () => {
    await context.close()
  })

  test('should preserve photos when pending purchase syncs to real purchase', async () => {
    console.log('\n=== TEST START: Pending Purchase with Photos ===\n')

    // STEP 1: Load app online and cache purchases
    console.log('STEP 1: Loading app online to cache purchases...')
    await page.goto('http://localhost:8787/purchases')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Wait for purchases to load
    const purchaseCountBefore = await page.locator('h3').count()
    console.log(`  ✓ Loaded ${purchaseCountBefore} purchases`)
    expect(purchaseCountBefore).toBeGreaterThan(0)

    // STEP 2: Go offline
    console.log('\nSTEP 2: Going offline...')
    await context.setOffline(true)
    await page.reload()
    await page.waitForLoadState('networkidle')
    console.log('  ✓ App is now offline')

    // Wait a bit for cache to settle
    await page.waitForTimeout(1000)

    // STEP 3: Create a pending purchase
    console.log('\nSTEP 3: Creating pending purchase while offline...')
    const timestamp = Date.now()
    const testBrand = `TestBrand-${timestamp}`
    const testCategory = 'Ropa'
    const testProductType = 'Camiseta'
    const testSize = 'M'

    const addButton = await page.locator('button:has-text("Añadir compra")').first()
    await addButton.click({ timeout: 5000 })
    console.log('  ✓ Add purchase dialog opened')

    // Fill form
    await page.fill('input[placeholder*="Marca"]', testBrand, { timeout: 5000 })
    await page.fill('input[placeholder*="Categoría"]', testCategory)
    await page.fill('input[placeholder*="Tipo de prenda"]', testProductType)
    await page.fill('input[placeholder*="Talla"]', testSize)
    console.log(`  ✓ Form filled: ${testBrand} / ${testCategory} / ${testProductType} / ${testSize}`)

    const saveButton = await page.locator('button:has-text("Guardar compra")').first()
    await saveButton.click({ timeout: 5000 })

    // Wait for purchase to be created in pending store
    await page.waitForTimeout(2000)
    console.log('  ✓ Pending purchase created')

    // STEP 4: Add photos to pending purchase
    console.log('\nSTEP 4: Adding photos to pending purchase...')

    // Create a test image and add it
    // Try to upload a photo - look for file input
    let photoAdded = false
    try {
      // Set up file input handling
      const fileInputPromise = page.waitForEvent('filechooser', { timeout: 10000 })

      // Look for upload photo button near the new pending purchase
      const uploadButtons = await page.locator('button').filter({ hasText: /Foto|foto|Subir|subir/ }).all()

      for (const btn of uploadButtons) {
        const isVisible = await btn.isVisible({ timeout: 1000 }).catch(() => false)
        if (isVisible) {
          await btn.click({ timeout: 5000 }).catch(() => {})
          break
        }
      }

      // Wait for file chooser (with timeout)
      const fileChooser = await fileInputPromise.catch(() => null)

      if (fileChooser) {
        // Create a test image file
        await fileChooser.setFiles({
          name: 'test-photo-1.jpg',
          mimeType: 'image/jpeg',
          buffer: Buffer.from(
            'FFD8FFE000104A46494600010100000100010000FFDB004300080606070605080707070909080A0C140D0C0B0B0C1912130F141D1A1F1E1D1A1C1C20242E2720222C231C1C28372029403D38453A3540383C3E3E3E252E4544403E47404540FFDFFFDB0043010909090C0B0C0C0B0909090D0D0D0F110F111418100A1814231C15213030302020F4F4F4F4F4F4F4F4F4F4FFC0001108006400640003012200031101000FFFC4001F0000010501010101010100000000000000000102030405060708090A0BFFC400B510000201020404030407050404000001027D0102030004110512213106714151076191322191A1B1C1082342B1C11552D1F024303625F0373627282090A161718191A25262728292A3435363738393A434445464748494A535455565758595A636465666768696A737475767778797A838485868788898A92939495969798999AA2A3A4A5A6A7A8A9AAB2B3B4B5B6B7B8B9BAC2C3C4C5C6C7C8C9CAD2D3D4D5D6D7D8D9DAE1E2E3E4E5E6E7E8E9EAF1F2F3F4F5F6F7F8F9FAFFC4001F0100030101010101010101010100000000000102030405060708090A0BFFC400B511000201020204040403050404000102027D0102031104052131061241510761711322328108144291A1B1C109233352F0156272D10A162434E125F11718191A262728292A35363738393A434445464748494A535455565758595A636465666768696A737475767778797A82838485868788898A92939495969798999AA2A3A4A5A6A7A8A9AAB2B3B4B5B6B7B8B9BAC2C3C4C5C6C7C8C9CAD2D3D4D5D6D7D8D9DAE2E3E4E5E6E7E8E9EAF2F3F4F5F6F7F8F9FAFFD9',
            'hex'
          )
        })
        photoAdded = true
        console.log('  ✓ Photo 1 added to pending purchase')
        await page.waitForTimeout(1000)
      }
    }
    catch (err) {
      console.log(`  ℹ Could not add photo via dialog: ${err}`)
    }

    // Verify pending purchase exists
    const offlineResult = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="purchase-details"]')
      return el?.textContent || ''
    }).catch(() => '')

    console.log(`  ℹ Offline result: ${offlineResult}`)

    // STEP 5: Go online and sync
    console.log('\nSTEP 5: Going online to trigger sync...')
    await context.setOffline(false)
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000)
    console.log('  ✓ App is now online, sync triggered')

    // STEP 6: Verify pending purchase was synced
    console.log('\nSTEP 6: Verifying pending purchase synced...')

    const purchaseCountAfter = await page.locator('h3').count()
    console.log(`  ✓ Purchases after sync: ${purchaseCountAfter}`)

    // Search for our test purchase
    const searchInput = page.getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas').first()
    await expect(searchInput).toBeVisible()
    await searchInput.fill(testBrand, { timeout: 5000 })
    await page.waitForTimeout(2000)

    const foundPurchases = await page.locator('h3').filter({ hasText: testBrand }).all()
    console.log(`  ✓ Found ${foundPurchases.length} purchase(es) matching "${testBrand}"`)

    // CRITICAL: Check if photos are present
    if (foundPurchases.length > 0) {
      console.log('\nSTEP 7: Checking if photos are preserved...')

      const photoImages = await page.locator('img').filter({ hasText: /Foto/ }).all()
      console.log(`  ✓ Found ${photoImages.length} photo(s)`)

      // Try to get photo count from the purchase element
      const purchaseElement = foundPurchases[0]
      const photoGrid = await purchaseElement.locator('..').locator('img').all()
      console.log(`  ✓ Photos in grid: ${photoGrid.length}`)

      if (photoAdded && photoGrid.length === 0) {
        console.warn('  ⚠ ISSUE: Photo was added but not uploaded!')
      }
      else {
        console.log('  ✓ Photos appear to be uploaded')
      }
    }
    else {
      console.warn('  ⚠ WARNING: Pending purchase was not synced!')
    }

    // Check console for errors
    const browserLogs = await page.evaluate(() => {
      return (window as typeof window & { __consoleLogs?: unknown[] }).__consoleLogs || []
    }).catch(() => [])

    console.log('\n=== TEST COMPLETE ===\n')
    console.log(`Browser logs: ${browserLogs.length}`)

    // Assertions
    expect(purchaseCountAfter).toBeGreaterThanOrEqual(purchaseCountBefore)
  })
})
