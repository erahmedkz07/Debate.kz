import { defineConfig, devices } from '@playwright/test'

// UI tests: a real browser (the installed Microsoft Edge, nothing to download) clicks through the site.
// Playwright starts its own test API (:4300, the test database, seeded from scratch) and its own site (:5180), so the
// dev site (:5173 / :4000) and its data are never touched. Run: npm run test:ui (npm run test:ui -- --headed to watch).
// Do not run it together with the backend's npm run test:e2e: both use the test database.
export default defineConfig({
  testDir: 'tests/ui',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // one shared test database
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/ui-report' }]],
  use: {
    baseURL: 'http://localhost:5180',
    channel: 'msedge',
    locale: 'ru-RU',
    timezoneId: 'Asia/Almaty',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1366, height: 860 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'phone', use: { ...devices['Pixel 7'], channel: 'msedge' }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    { command: 'npm --prefix ../backend run test:ui-api', url: 'http://localhost:4300/api/health', timeout: 180_000, reuseExistingServer: false, stdout: 'ignore', stderr: 'pipe' },
    { command: 'node scripts/dev.mjs --port 5180 --strictPort', url: 'http://localhost:5180', timeout: 120_000, reuseExistingServer: false, env: { API_TARGET: 'http://localhost:4300' } },
  ],
})
