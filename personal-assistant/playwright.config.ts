import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const isCI = !!process.env.CI
const configuredBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.trim()
const baseURL = configuredBaseUrl || 'http://localhost:3000'
const shouldUseLocalWebServer = !configuredBaseUrl
const authStatePath = path.join(process.cwd(), 'test-results', '.auth', 'user.json')

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function parseNonNegativeInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

const testTimeout = parsePositiveInteger(process.env.PW_TEST_TIMEOUT_MS, isCI ? 60_000 : 45_000)
const expectTimeout = parsePositiveInteger(process.env.PW_EXPECT_TIMEOUT_MS, isCI ? 15_000 : 10_000)
const actionTimeout = parsePositiveInteger(process.env.PW_ACTION_TIMEOUT_MS, isCI ? 15_000 : 10_000)
const navigationTimeout = parsePositiveInteger(process.env.PW_NAV_TIMEOUT_MS, isCI ? 20_000 : 15_000)
const retries = parseNonNegativeInteger(process.env.PW_RETRIES, isCI ? 2 : 0)
const workers = parsePositiveInteger(process.env.PW_WORKERS, isCI ? 1 : 2)
const webServerTimeout = parsePositiveInteger(process.env.PW_WEB_SERVER_TIMEOUT_MS, isCI ? 180_000 : 120_000)

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  testIgnore: ['**/_*', '**/._*'],
  timeout: testTimeout,
  expect: {
    timeout: expectTimeout,
  },
  fullyParallel: false,
  retries,
  forbidOnly: isCI,
  workers,
  reporter: isCI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  use: {
    baseURL,
    trace: isCI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout,
    navigationTimeout,
  },
  projects: [
    {
      name: 'setup',
      testMatch: '**/*.setup.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      dependencies: ['setup'],
      testIgnore: '**/*.setup.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState: authStatePath,
      },
    },
  ],
  webServer: shouldUseLocalWebServer
    ? {
        command: 'npm run dev:auth',
        url: baseURL,
        timeout: webServerTimeout,
        reuseExistingServer: !isCI,
      }
    : undefined,
})
