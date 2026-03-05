import { type Page, expect } from '@playwright/test'

/**
 * E2E test helpers: auth helpers, page object patterns.
 */

export const TEST_USER = {
  email: process.env.E2E_USER_EMAIL || 'test@bitbit.dev',
  password: process.env.E2E_USER_PASSWORD || 'test-password-e2e',
}

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const ONBOARDING_STORAGE_KEY = 'bb-onboarding-complete'

export const AUTH_SKIP_REASON =
  'Authentication unavailable in this environment (set E2E_SESSION_TOKEN or working E2E_USER_EMAIL/E2E_USER_PASSWORD)'

function isAuthPath(pathname: string) {
  return pathname.startsWith('/login') || pathname.startsWith('/auth')
}

function currentPath(page: Page) {
  return new URL(page.url()).pathname
}

async function waitForTabPanel(page: Page, tabId: string, timeout = 8_000) {
  const panel = page.locator(`#tabpanel-${tabId}`).first()
  if (!(await panel.count())) return false

  const active = await expect(panel)
    .toHaveAttribute('data-active', 'true', { timeout: Math.min(timeout, 2_500) })
    .then(() => true)
    .catch(() => false)

  if (active) return true

  await panel.waitFor({ state: 'visible', timeout }).catch(() => {})

  return await panel
    .isVisible()
    .then(Boolean)
    .catch(() => false)
}

async function trySessionCookieLogin(page: Page) {
  const sessionToken = process.env.E2E_SESSION_TOKEN
  if (!sessionToken) return false

  await page.context().addCookies([
    {
      name: 'sb-access-token',
      value: sessionToken,
      url: BASE_URL,
    },
  ])

  return true
}

async function openDevPasswordLogin(page: Page) {
  const devToggle = page.getByRole('button', { name: /dev:\s*password login/i }).first()
  if (!(await devToggle.count())) return false
  if (!(await devToggle.isVisible().catch(() => false))) return false

  await devToggle.click()

  const passwordInput = page.locator('input[type="password"]:visible').first()
  await passwordInput.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})

  return (await passwordInput.count()) > 0
}

async function submitPasswordLogin(page: Page) {
  const passwordInput = page.locator('input[type="password"]:visible').first()
  if (!(await passwordInput.count())) return false

  await page.locator('input[type="email"]:visible').last().fill(TEST_USER.email)
  await passwordInput.fill(TEST_USER.password)

  const passwordSubmit = page.locator('button:has-text("Sign in with password"):visible').first()
  if (await passwordSubmit.count()) {
    await expect(passwordSubmit).toBeEnabled({ timeout: 5_000 })
    await passwordSubmit.click()
  } else {
    await passwordInput.press('Enter')
  }

  await page
    .waitForURL((url) => !isAuthPath(url.pathname), {
      timeout: 12_000,
    })
    .catch(() => {})

  return !isAuthPath(currentPath(page))
}

export async function ensureAuthenticated(page: Page, targetPath = '/dashboard') {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, 'true')
  }, ONBOARDING_STORAGE_KEY)

  await trySessionCookieLogin(page)

  await page.goto(targetPath, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('domcontentloaded')

  if (!isAuthPath(currentPath(page))) return true

  await openDevPasswordLogin(page)
  const loggedIn = await submitPasswordLogin(page)
  if (!loggedIn) return false

  if (currentPath(page) !== targetPath) {
    await page.goto(targetPath, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
  }

  await dismissOnboardingWizard(page)
  return !isAuthPath(currentPath(page))
}

export async function openProtectedPath(page: Page, targetPath: string) {
  const authenticated = await ensureAuthenticated(page, targetPath)
  if (!authenticated) return false

  if (currentPath(page) !== targetPath) {
    await page.goto(targetPath, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')
  }

  await dismissOnboardingWizard(page)
  return !isAuthPath(currentPath(page))
}

export async function dismissOnboardingWizard(page: Page) {
  const wizard = page.locator('.bb-onboarding-wizard').first()
  if (!(await wizard.isVisible().catch(() => false))) return

  const skipButtons = page.getByRole('button', {
    name: /skip for now|skip tour|skip/i,
  })

  if (await skipButtons.count()) {
    await skipButtons.first().click().catch(() => {})
  }

  await wizard.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
}

/**
 * Login via Supabase auth UI or direct session injection.
 * In CI, we use a pre-authenticated session cookie.
 */
export async function login(page: Page) {
  const authenticated = await ensureAuthenticated(page, '/dashboard')
  if (!authenticated) {
    throw new Error(AUTH_SKIP_REASON)
  }
}

/**
 * Wait for the dashboard to fully load.
 */
export async function waitForDashboard(page: Page) {
  await dismissOnboardingWizard(page)
  await page.waitForSelector('[data-testid="dashboard"], main', { timeout: 10_000 })
}

/**
 * Navigate to a specific dashboard tab.
 */
export async function navigateToTab(page: Page, tabName: string) {
  await dismissOnboardingWizard(page)
  const normalized = tabName.trim().toLowerCase()
  const tabIdAlias: Record<string, string> = {
    channels: 'connections',
    'creator studio': 'creator-studio',
    'ai search': 'ai-search',
    'ad scripts': 'ad-scripts',
  }
  const candidateId = tabIdAlias[normalized] ?? normalized.replace(/\s+/g, '-')

  await page.evaluate((tabId) => {
    window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: tabId } }))
  }, candidateId)
  if (await waitForTabPanel(page, candidateId)) {
    return
  }

  const showAdvanced = page.getByRole('button', {
    name: /show advanced tabs|hide advanced tabs|more/i,
  })

  let tab = page.getByRole('tab', { name: new RegExp(`^${normalized}$`, 'i') }).first()
  if (!(await tab.count())) {
    tab = page.locator(`[data-tab="${normalized}"], #tab-${normalized}`).first()
  }
  if (!(await tab.count()) && (await showAdvanced.count())) {
    await showAdvanced.first().click().catch(() => {})
    tab = page.getByRole('tab', { name: new RegExp(`^${normalized}$`, 'i') }).first()
    if (!(await tab.count())) {
      tab = page.locator(`[data-tab="${normalized}"], #tab-${normalized}`).first()
    }
  }
  if (!(await tab.count())) {
    tab = page.locator(`button:has-text("${tabName}"):visible, a:has-text("${tabName}"):visible`).first()
  }

  await tab.click()
  if (await waitForTabPanel(page, candidateId)) {
    return
  }

  const activePanel = page.locator('[id^="tabpanel-"][data-active="true"]').first()
  await activePanel.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {})
}

/**
 * Page object for the approval queue.
 */
export class ApprovalQueuePage {
  constructor(private page: Page) {}

  async goto() {
    await navigateToTab(this.page, 'Approvals')
  }

  async getPendingCount() {
    const items = this.page.locator('[data-testid="approval-item"], [class*="approval"]')
    return await items.count()
  }

  async approveFirst() {
    const approveBtn = this.page.locator('button:has-text("Approve")').first()
    await approveBtn.click()
  }

  async rejectFirst() {
    const rejectBtn = this.page.locator('button:has-text("Reject")').first()
    await rejectBtn.click()
  }
}

/**
 * Page object for the sidebar navigation.
 */
export class SidebarNav {
  constructor(private page: Page) {}

  async isVisible() {
    const sidebar = this.page.locator('nav, [data-testid="sidebar"]')
    return await sidebar.isVisible()
  }

  async clickItem(name: string) {
    const item = this.page.locator(`nav >> text="${name}"`)
    await item.click()
  }
}
