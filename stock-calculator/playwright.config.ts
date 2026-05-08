import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3000',
    headless: true,
    trace: 'retain-on-failure'
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev:full',
        url: 'http://127.0.0.1:3000',
        timeout: 180_000,
        reuseExistingServer: true
      },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
