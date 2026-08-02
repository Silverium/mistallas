import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export async function expectImageToBeLoaded(image: ReturnType<Page['locator']>, timeoutMs = 15_000) {
  await expect.poll(
    async () => image.evaluate((img) => {
      const i = img as HTMLImageElement
      return i.complete && i.naturalWidth > 0 && i.naturalHeight > 0
    }),
    { timeout: timeoutMs }
  ).toBe(true)
}
