import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {
    timeout: 8_000
  },
  fullyParallel: false,
  retries: 0,
  workers: '50%',
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8787',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:8787',
    reuseExistingServer: true,
    timeout: 120_000
  }
})
