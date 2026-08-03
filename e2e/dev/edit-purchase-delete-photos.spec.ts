import { expect, test } from '@playwright/test'
import { authenticateViaE2ELogin } from '../helpers/auth'
import { addPhotoToPurchaseRow } from '../helpers/addPhotoToRow'
import { expectImageToBeLoaded } from '../helpers/expectImageToBeLoaded'

test.describe('E2E: edit purchase — delete photos one by one', { tag: '@online' }, () => {
  test.beforeEach(async ({ context }) => {
    await context.setOffline(false)
  })
  test.afterEach(async ({ context }) => {
    await context.setOffline(false)
  })

  test('auth -> create purchase -> add 3 photos -> open edit -> delete photos one by one -> cleanup', async ({ page }) => {
    await authenticateViaE2ELogin(page.request, {
      userId: `telegram:e2e-photo-delete-${Date.now()}`,
      login: `test-photo-delete-${Date.now()}`
    })

    await page.goto('/purchases', { waitUntil: 'networkidle' })
    await expect(page).toHaveURL(/\/purchases/)

    // 1. Create a purchase
    const unique = Date.now()
    const brand = `E2E-PhotoDelete-${unique}`

    await page.getByRole('button', { name: 'Añadir compra' }).click()
    await page.getByPlaceholder('Marca (Nike, Zara...) *').fill(brand)
    await page.getByPlaceholder('Categoría (ropa, calzado...) *').fill('Ropa E2E')
    await page.getByPlaceholder('Tipo de prenda (t-shirt, jeans...) *').fill('Camiseta Test')
    await page.getByPlaceholder('Talla (S, M, L, 42...) *').fill(`M-${unique}`)
    await page.getByRole('button', { name: 'Guardar compra' }).click()
    await expect(page.getByText(brand)).toBeVisible()

    // 2. Filter to the created row and add 3 photos via the list-view quick-add button
    await page
      .getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')
      .fill(brand)
    const row = page.locator('li', { hasText: brand }).first()
    await expect(row).toBeVisible()

    for (let i = 0; i < 3; i++) {
      await addPhotoToPurchaseRow(row, page)

      // Wait for the newly uploaded photo to appear before adding the next one
      await expect.poll(
        () => row.locator('img[alt^="Foto "]:not([alt="Foto pendiente"])').count(),
        { timeout: 5_000 }
      ).toBe(i + 1)

      const latestPhoto = row.locator('img[alt^="Foto "]:not([alt="Foto pendiente"])').nth(i)
      await expectImageToBeLoaded(latestPhoto)
    }

    await expect(row.locator('img[alt^="Foto "]:not([alt="Foto pendiente"])')).toHaveCount(3)

    // 3. Open the edit dialog
    await row.getByRole('button', { name: 'Editar' }).click()
    const editDialog = page.locator('[role="dialog"]').filter({ hasText: 'Editar compra' })
    await expect(editDialog).toBeVisible()

    // Delete photos one by one, verifying each disappears from the edit dialog
    for (let remaining = 3; remaining >= 1; remaining--) {
      await expect.poll(
        () => editDialog.locator('img[alt^="Foto "]:not([alt="Foto pendiente"])').count(),
        { timeout: 10_000 }
      ).toBe(remaining)

      // Click the delete (×) button on the first uploaded photo in the dialog
      const firstDeleteBtn = editDialog.getByTestId('delete-photo-button').first()
      await firstDeleteBtn.click({ force: true })

      // Confirm the photo deletion modal
      const confirmDeletePhotoDialog = page
        .locator('[role="dialog"]')
        .filter({ hasText: '¿Seguro que quieres eliminar esta foto?' })
      await expect(confirmDeletePhotoDialog).toBeVisible()
      await confirmDeletePhotoDialog.getByRole('button', { name: 'Eliminar' }).click({ force: true })
      await expect(confirmDeletePhotoDialog).not.toBeVisible()

      // Verify the photo count dropped
      await expect.poll(
        () => editDialog.locator('img[alt^="Foto "]:not([alt="Foto pendiente"])').count(),
        { timeout: 10_000 }
      ).toBe(remaining - 1)
    }

    // No uploaded photos remain in the edit dialog
    await expect(editDialog.locator('img[alt^="Foto "]:not([alt="Foto pendiente"])')).toHaveCount(0)

    // Close the edit dialog
    await editDialog.getByRole('button', { name: /cerrar|cancelar/i }).last().click()
    await expect(editDialog).not.toBeVisible()

    // 4. Cleanup: delete the purchase
    await page
      .getByPlaceholder('Filtrar por marca, categoría, prenda, talla o notas')
      .fill(brand)
    const rowToDelete = page.locator('li', { hasText: brand }).first()
    await expect(rowToDelete).toBeVisible()
    await rowToDelete.getByRole('button', { name: 'Eliminar' }).click({ force: true })

    const confirmDeletePurchaseDialog = page
      .locator('[role="dialog"]')
      .filter({ hasText: '¿Seguro que quieres eliminar esta compra?' })
    await expect(confirmDeletePurchaseDialog).toBeVisible()
    await confirmDeletePurchaseDialog.getByRole('button', { name: 'Eliminar' }).click({ force: true })
    await expect(confirmDeletePurchaseDialog).not.toBeVisible()

    await expect.poll(
      async () => page.locator('li', { hasText: brand }).count(),
      { timeout: 10_000 }
    ).toBe(0)
  })
})
