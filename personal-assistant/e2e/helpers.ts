import { type Page, expect } from '@playwright/test'

/**
 * E2E test helpers: auth helpers, page object patterns.
 */

export const TEST_USER = {
  email: process.env.E2E_USER_EMAIL || 'test@bitbit.dev',
  password: process.env.E2E_USER_PASSWORD || 'test-password-e2e',
}

/**
 * Login via Supabase auth UI or direct session injection.
 * In CI, we use a pre-authenticated session cookie.
 */
export async function login(page: Page) {
  const sessionToken = process.env.E2E_SESSION_TOKEN
  if (sessionToken) {
    // Direct session injection for CI
    await page.context().addCookies([
      {
        name: 'sb-access-token',
        value: sessionToken,
        domain: 'localhost',
        path: '/',
      },
    ])
    await page.goto('/')
    return
  }

  // Interactive login
  await page.goto('/login')
  await page.fill('input[type="email"]', TEST_USER.email)
  await page.fill('input[type="password"]', TEST_USER.password)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard**', { timeout: 10_000 })
}

/**
 * Wait for the dashboard to fully load.
 */
export async function waitForDashboard(page: Page) {
  await page.waitForSelector('[data-testid="dashboard"], main', { timeout: 10_000 })
}

/**
 * Navigate to a specific dashboard tab.
 */
export async function navigateToTab(page: Page, tabName: string) {
  const tab = page.locator(`[data-tab="${tabName}"], button:has-text("${tabName}"), a:has-text("${tabName}")`)
  await tab.first().click()
  await page.waitForTimeout(500) // Allow tab transition
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
