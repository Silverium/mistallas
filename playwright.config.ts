/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test'

// Load .env so BASE_URL is available when the VS Code Playwright plugin
// evaluates this config (the plugin does not load .env automatically).
try {
  process.loadEnvFile()
}
catch { /* .env absent or already loaded */ }

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
    baseURL: process.env.BASE_URL ?? 'http://localhost:8787',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'preview',
      use: { ...devices['Desktop Chrome'], baseURL: process.env.BASE_URL ?? 'http://localhost:8787' }
    },
    {
      name: 'dev',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3000' },
      testMatch: /\/dev\/.*\.spec\.ts$/
    }
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run preview',
        url: 'http://localhost:8787',
        reuseExistingServer: true,
        timeout: 120_000
      }
})
