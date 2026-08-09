import type { Page } from '@playwright/test'

const tShirtGirlFilePath = 'e2e/helpers/tShirtGirl.jpeg'

export async function addPhotoToPurchaseRow(row: ReturnType<Page['locator']>, page: Page) {
  const fileChooserPromise = page.waitForEvent('filechooser')
  await row.getByLabel('Añadir foto').first().click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(tShirtGirlFilePath)
}
