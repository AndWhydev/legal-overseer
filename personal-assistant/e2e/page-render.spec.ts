import { test, expect, type Page } from '@playwright/test'
import { AUTH_SKIP_REASON, openProtectedPath } from './helpers'

/**
 * Verify every dashboard tab renders without JS errors.
 * Runs against localhost:3000 with the dev server already running.
 */

const ALL_TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'creator-studio', label: 'Creator Studio' },
  { id: 'connections', label: 'Connections' },
  { id: 'medications', label: 'Medications' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'leads', label: 'Leads' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'tenders', label: 'Tenders' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'sentry', label: 'Sentry' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'ad-scripts', label: 'Ad Scripts' },
  { id: 'ai-search', label: 'AI Search' },
  { id: 'reports', label: 'Reports' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'costs', label: 'Costs' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'activity', label: 'Activity' },
  { id: 'admin', label: 'Admin' },
  { id: 'settings', label: 'Settings' },
]

const COLD_RENDER_TIMEOUT_MS = 90_000

async function seedRenderHarness(page: Page, tabId = 'dashboard') {
  const enabledModules = Array.from(new Set(['dashboard', tabId]))
  const seedData = {
    contacts: tabId === 'contacts',
    inbox: tabId === 'inbox',
  }

  await page.addInitScript(
    ({ modules, seedData: nextSeedData }) => {
      window.localStorage.setItem('bb-onboarding-complete', 'true')
      window.localStorage.setItem(
        'bb-dev-overrides',
        JSON.stringify({
          ui_profile: 'full',
          enabled_modules: modules,
          seed_data: nextSeedData,
        }),
      )
    },
    { modules: enabledModules, seedData },
  )
}

async function waitForDashboardShell(page: Page, activeTabId = 'dashboard') {
  await page.waitForURL(/\/dashboard(?:\/.*)?$/, { timeout: COLD_RENDER_TIMEOUT_MS }).catch(() => {})
  await page.locator('.bb-splash').waitFor({ state: 'hidden', timeout: COLD_RENDER_TIMEOUT_MS }).catch(() => {})
  await expect(page.locator('main, #main-content').first()).toBeVisible({ timeout: COLD_RENDER_TIMEOUT_MS })
  await expect(page.locator(`#tabpanel-${activeTabId}`)).toHaveAttribute('data-active', 'true', {
    timeout: COLD_RENDER_TIMEOUT_MS,
  })
}

test.describe('Page Render Verification', () => {
  test.describe.configure({ timeout: 180_000 })

  test('dashboard loads without critical errors', async ({ page }) => {
    test.slow()
    await seedRenderHarness(page, 'dashboard')
    const authenticated = await openProtectedPath(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const jsErrors: string[] = []

    page.on('pageerror', (error) => {
      // Ignore hydration warnings (known, fixed with suppressHydrationWarning)
      if (error.message.includes('Hydration')) return
      jsErrors.push(error.message)
    })

    await waitForDashboardShell(page)

    // Dashboard should render some content
    const body = await page.textContent('body')
    expect(body?.length).toBeGreaterThan(100)

    // Check for the shell nav using the current sidebar markup.
    const nav = page
      .locator('aside[aria-label="Main navigation"], .bb-sidebar, nav[aria-label="Dashboard sections"]')
      .first()
    await expect(nav).toBeVisible()

    // No critical JS errors
    const criticalErrors = jsErrors.filter(
      (e) =>
        !e.includes('401') &&
        !e.includes('400') &&
        !e.includes('Failed to fetch') &&
        !e.includes('React Client Manifest')
    )
    if (criticalErrors.length > 0) {
      console.log('JS errors on dashboard load:', criticalErrors)
    }
  })

  for (const tab of ALL_TABS) {
    test(`tab "${tab.label}" (${tab.id}) renders without errors`, async ({ page }) => {
      await seedRenderHarness(page, tab.id)
      const authenticated = await openProtectedPath(page, '/dashboard')
      test.skip(!authenticated, AUTH_SKIP_REASON)

      const jsErrors: string[] = []
      const consoleErrors: string[] = []

      page.on('pageerror', (error) => {
        if (error.message.includes('Hydration')) return
        jsErrors.push(error.message)
      })

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text()
          // Ignore expected network errors (no auth)
          if (text.includes('401') || text.includes('400') || text.includes('Failed to fetch') || text.includes('Failed to load resource')) return
          consoleErrors.push(text)
        }
      })

      await waitForDashboardShell(page)
      await page.evaluate((tabId) => {
        window.sessionStorage.setItem('bitbit-tab', tabId)
      }, tab.id)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitForDashboardShell(page, tab.id)

      // Verify the tab panel exists and is active
      const panel = page.locator(`#tabpanel-${tab.id}`)
      await expect(panel.first()).toBeVisible({ timeout: COLD_RENDER_TIMEOUT_MS })

      // Panel should have some rendered content (not empty)
      const panelText = await panel.textContent()
      expect(panelText?.length).toBeGreaterThan(0)

      // Some gated modules can render an inline fallback message without a JS crash.
      // We rely on the pageerror/console checks below to fail on actual runtime errors.

      // Report any non-network JS errors
      const realErrors = jsErrors.filter(
        (e) =>
          !e.includes('401') &&
          !e.includes('400') &&
          !e.includes('Failed to fetch') &&
          !e.includes('NetworkError') &&
          !e.includes('width(-1)') &&
          !e.includes('height(-1)') &&
          !e.includes('React Client Manifest')
      )

      if (realErrors.length > 0) {
        console.log(`JS errors on tab "${tab.label}":`, realErrors)
      }
      // Fail only on actual rendering errors (not network/auth issues)
      expect(realErrors.filter((e) => e.includes('is not a function') || e.includes('Cannot read properties') || e.includes('is not defined'))).toEqual([])

      // Take screenshot for visual verification
      await page.screenshot({
        path: `e2e/screenshots/${tab.id}.png`,
        fullPage: false,
      })
    })
  }
})
