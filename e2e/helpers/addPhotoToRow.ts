import type { Page } from '@playwright/test'
import { createImageFile } from './createImage'

export async function addPhotoToPurchaseRow(row: ReturnType<Page['locator']>, page: Page) {
  const fileChooserPromise = page.waitForEvent('filechooser')
  await row.getByLabel('Añadir foto').first().click()
  const fileChooser = await fileChooserPromise
  await fileChooser.setFiles(createImageFile())
}
