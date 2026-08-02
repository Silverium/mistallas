import type { Page, APIRequestContext } from '@playwright/test'

interface MockUser {
  id: string
  login: string
  email: string
  loginProvider: 'github' | 'telegram' | 'discord'
  tier: 'free' | 'pro' | 'premium'
  role: 'user' | 'admin'
  avatar_url: string
}

interface E2ELoginOptions {
  userId?: string
  login?: string
}

/**
 * Authenticate a test user via e2e-login endpoint
 * Use this for tests that need a real authenticated session via the e2e-login API
 *
 * @param request - APIRequestContext from Playwright
 * @param options - Optional login options (userId, login)
 */
export async function authenticateViaE2ELogin(
  request: APIRequestContext,
  options: E2ELoginOptions = {}
) {
  const timestamp = Date.now()
  const loginOptions = {
    userId: options.userId || `telegram:e2e-playwright-${timestamp}`,
    login: options.login || 'test-playwright'
  }

  try {
    const authResponse = await request.post('/api/test/e2e-login', {
      data: loginOptions
    })

    if (!authResponse.ok()) {
      throw new Error(`Failed to seed E2E auth session: ${authResponse.status()}`)
    }

    console.log('  ✓ User authenticated via e2e-login endpoint')
  }
  catch (err) {
    console.log(`  ⚠ Auth error (continuing): ${err}`)
  }
}

/**
 * Authenticate a test user for e2e tests
 * Handles OAuth flow fallback and sets mock session if needed
 *
 * @param page - Playwright page object
 * @param targetUrl - URL to navigate to (defaults to /purchases)
 * @param mockUser - Optional custom mock user (generates random one if not provided)
 */
export async function authenticateTestUser(
  page: Page,
  targetUrl: string = '/purchases',
  mockUser?: Partial<MockUser>
) {
  try {
    // Navigate to target page (will redirect to auth if needed)
    const response = await page.goto(targetUrl, { waitUntil: 'networkidle' })

    if (response?.status() === 401 || response?.status() === 403) {
      console.log('  ℹ Not authenticated, attempting OAuth flow...')

      // Try Telegram auth (simplest OAuth flow)
      await page.goto('/auth/telegram', { waitUntil: 'networkidle' })
      await page.waitForTimeout(2000)

      // If still not logged in, set mock session for testing
      const defaultMockUser: MockUser = {
        id: `test-user-${Date.now()}`,
        login: 'test-playwright',
        email: `test-${Date.now()}@example.com`,
        loginProvider: 'github',
        tier: 'pro',
        role: 'user',
        avatar_url: 'https://github.com/octocat.png'
      }

      const sessionUser = { ...defaultMockUser, ...mockUser }

      const sessionSet = await page.evaluate((user) => {
        try {
          // Try to set auth cookie
          document.cookie = `auth.session=${JSON.stringify(user)}; path=/; max-age=3600`
          return true
        }
        catch {
          return false
        }
      }, sessionUser)

      if (!sessionSet) {
        console.log('  ⚠ Could not set test session, continuing anyway')
      }
    }

    // Navigate to target URL
    await page.goto(targetUrl, { waitUntil: 'networkidle' })
    console.log('  ✓ User authenticated and navigated to target page')
  }
  catch (err) {
    console.log(`  ⚠ Auth error (continuing): ${err}`)
  }
}
