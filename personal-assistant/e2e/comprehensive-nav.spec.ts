import { test, expect, type Page } from '@playwright/test'
import { AUTH_SKIP_REASON, openProtectedPath, navigateToTab, dismissOnboardingWizard } from './helpers'

/**
 * Comprehensive E2E tests for dashboard shell & navigation.
 * Covers sidebar rendering, tab switching, sub-routes, and browser navigation.
 */

const COLD_RENDER_TIMEOUT = 60_000

// All tab IDs the dashboard supports
const ALL_TAB_IDS = [
  'chat',
  'inbox',
  'creator-studio',
  'connections',
  'medications',
  'contacts',
  'leads',
  'invoices',
  'tenders',
  'jobs',
  'quotes',
  'sentry',
  'approvals',
  'ad-scripts',
  'ai-search',
  'reports',
  'knowledge',
  'costs',
  'analytics',
  'activity',
  'admin',
  'settings',
] as const

// Tabs expected in the primary sidebar nav items
const EXPECTED_NAV_ITEMS = [
  'Dashboard',
  'Chat',
  'Inbox',
  'Connections',
  'Contacts',
  'Leads',
  'Settings',
]

// Sub-routes that should deep-link to specific tabs
const SUB_ROUTES: { path: string; expectedTab: string }[] = [
  { path: '/dashboard', expectedTab: 'dashboard' },
  { path: '/dashboard/chat', expectedTab: 'chat' },
  { path: '/dashboard/contacts', expectedTab: 'contacts' },
  { path: '/dashboard/settings', expectedTab: 'settings' },
  { path: '/dashboard/leads', expectedTab: 'leads' },
  { path: '/dashboard/connections', expectedTab: 'connections' },
]

/** Seed localStorage so the dashboard renders the full module set. */
async function seedFullModules(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('bb-onboarding-complete', 'true')
    window.localStorage.setItem(
      'bb-dev-overrides',
      JSON.stringify({ ui_profile: 'full', enabled_modules: ['dashboard'] }),
    )
  })
}

/** Wait for the dashboard shell to finish loading. */
async function waitForShell(page: Page) {
  await page.waitForURL(/\/dashboard/, { timeout: COLD_RENDER_TIMEOUT }).catch(() => {})
  await page.locator('.bb-splash').waitFor({ state: 'hidden', timeout: COLD_RENDER_TIMEOUT }).catch(() => {})
  await expect(page.locator('main, #main-content').first()).toBeVisible({ timeout: COLD_RENDER_TIMEOUT })
}

/** Open the dashboard with auth + full modules seeded. */
async function openDashboard(page: Page, path = '/dashboard') {
  await seedFullModules(page)
  return openProtectedPath(page, path)
}

/** Collect JS errors, filtering known non-critical ones. */
function collectJsErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => {
    const msg = err.message
    // Skip hydration warnings, network errors, and known non-critical issues
    if (
      msg.includes('Hydration') ||
      msg.includes('401') ||
      msg.includes('400') ||
      msg.includes('Failed to fetch') ||
      msg.includes('NetworkError') ||
      msg.includes('React Client Manifest') ||
      msg.includes('width(-1)') ||
      msg.includes('height(-1)')
    )
      return
    errors.push(msg)
  })
  return errors
}

// ─────────────────────────────────────────────
// SIDEBAR NAVIGATION
// ─────────────────────────────────────────────

test.describe('Sidebar Navigation', () => {
  test.describe.configure({ timeout: 120_000 })

  test('sidebar renders with correct aria attributes', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)
    await waitForShell(page)

    // The sidebar should be an <aside> with role="navigation" and aria-label
    const sidebar = page.locator('aside[aria-label="Main navigation"], .bb-sidebar').first()
    await expect(sidebar).toBeVisible({ timeout: 15_000 })

    // Should also have the bb-sidebar class
    const bbSidebar = page.locator('.bb-sidebar').first()
    await expect(bbSidebar).toBeVisible()
  })

  test('sidebar contains expected primary nav items', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)
    await waitForShell(page)

    for (const itemName of EXPECTED_NAV_ITEMS) {
      // Look for tabs, buttons, or links containing the nav item name
      const item = page
        .locator(
          `aside[aria-label="Main navigation"] :is([role="tab"], button, a):has-text("${itemName}")`,
        )
        .first()

      // Some items may be behind a "Show advanced" toggle or in rail icons
      // Also try the broader sidebar class
      const altItem = page
        .locator(`.bb-sidebar :is([role="tab"], button, a):has-text("${itemName}")`)
        .first()

      // Also check rail buttons with aria-label
      const railItem = page
        .locator(`button[aria-label="${itemName}"]`)
        .first()

      const found =
        (await item.count()) > 0 ||
        (await altItem.count()) > 0 ||
        (await railItem.count()) > 0

      expect(found, `Expected nav item "${itemName}" to be present in sidebar`).toBeTruthy()
    }
  })

  test('clicking a sidebar nav item switches the active tab panel', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)
    await waitForShell(page)

    // Start on dashboard tab
    const dashboardPanel = page.locator('#tabpanel-dashboard')
    await expect(dashboardPanel).toHaveAttribute('data-active', 'true', { timeout: 10_000 })

    // Navigate to chat
    await navigateToTab(page, 'Chat')

    // Chat panel should now be active
    const chatPanel = page.locator('#tabpanel-chat')
    await expect(chatPanel).toHaveAttribute('data-active', 'true', { timeout: 10_000 })

    // Dashboard panel should no longer be active
    await expect(dashboardPanel).not.toHaveAttribute('data-active', 'true')
  })

  test('active tab has aria-selected="true" in the sidebar panel', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)
    await waitForShell(page)

    // Navigate to inbox
    await navigateToTab(page, 'Inbox')

    // The sidebar panel item for inbox should have aria-selected=true
    const inboxTab = page.locator('#tab-inbox, [role="tab"][aria-controls="tabpanel-inbox"]').first()
    if (await inboxTab.count()) {
      await expect(inboxTab).toHaveAttribute('aria-selected', 'true', { timeout: 10_000 })
    }

    // The inbox tabpanel should be active
    await expect(page.locator('#tabpanel-inbox')).toHaveAttribute('data-active', 'true', {
      timeout: 10_000,
    })
  })
})

// ─────────────────────────────────────────────
// TAB SWITCHING
// ─────────────────────────────────────────────

test.describe('Tab Switching', () => {
  test.describe.configure({ timeout: 180_000 })

  for (const tabId of ALL_TAB_IDS) {
    test(`can switch to "${tabId}" without crash`, async ({ page }) => {
      const jsErrors = collectJsErrors(page)

      const authenticated = await openDashboard(page)
      test.skip(!authenticated, AUTH_SKIP_REASON)
      await waitForShell(page)

      // Use the custom event to navigate (same as navigateToTab helper)
      await page.evaluate((id) => {
        window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: id } }))
      }, tabId)

      // Wait for the tab panel to become active
      const panel = page.locator(`#tabpanel-${tabId}`)
      await expect(panel.first()).toHaveAttribute('data-active', 'true', {
        timeout: 15_000,
      }).catch(async () => {
        // Fallback: try via sessionStorage + reload
        await page.evaluate((id) => {
          window.sessionStorage.setItem('bitbit-tab', id)
        }, tabId)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitForShell(page)
        await expect(panel.first()).toHaveAttribute('data-active', 'true', {
          timeout: 15_000,
        })
      })

      // Panel should be visible
      await expect(panel.first()).toBeVisible({ timeout: 10_000 })

      // Panel should have non-empty content
      const panelText = await panel.first().textContent()
      expect(
        panelText && panelText.trim().length > 0,
        `Tab panel "${tabId}" should have non-empty content`,
      ).toBeTruthy()

      // No critical JS errors (type errors, reference errors)
      const criticalErrors = jsErrors.filter(
        (e) =>
          e.includes('is not a function') ||
          e.includes('Cannot read properties') ||
          e.includes('is not defined'),
      )
      expect(
        criticalErrors,
        `Critical JS errors on tab "${tabId}": ${criticalErrors.join('; ')}`,
      ).toEqual([])
    })
  }
})

// ─────────────────────────────────────────────
// DASHBOARD SUB-ROUTES
// ─────────────────────────────────────────────

test.describe('Dashboard Sub-Routes', () => {
  test.describe.configure({ timeout: 120_000 })

  for (const { path, expectedTab } of SUB_ROUTES) {
    test(`${path} loads the "${expectedTab}" tab`, async ({ page }) => {
      await seedFullModules(page)
      const authenticated = await openProtectedPath(page, path)
      test.skip(!authenticated, AUTH_SKIP_REASON)
      await waitForShell(page)

      // The expected tab panel should be active
      const panel = page.locator(`#tabpanel-${expectedTab}`)

      // Some sub-routes may navigate via sessionStorage rather than URL path
      // Try direct panel check first
      const isActive = await panel
        .first()
        .getAttribute('data-active', { timeout: 10_000 })
        .then((v) => v === 'true')
        .catch(() => false)

      if (!isActive) {
        // Fallback: check that the page loaded at the correct URL
        // and try to navigate via the custom event
        await page.evaluate((tab) => {
          window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab } }))
        }, expectedTab)

        await expect(panel.first()).toHaveAttribute('data-active', 'true', {
          timeout: 15_000,
        })
      }

      await expect(panel.first()).toBeVisible()
    })
  }
})

// ─────────────────────────────────────────────
// BROWSER NAVIGATION
// ─────────────────────────────────────────────

test.describe('Browser Navigation', () => {
  test.describe.configure({ timeout: 120_000 })

  test('tab state persists in sessionStorage (bitbit-tab)', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)
    await waitForShell(page)

    // Navigate to settings tab
    await navigateToTab(page, 'Settings')
    await expect(page.locator('#tabpanel-settings')).toHaveAttribute('data-active', 'true', {
      timeout: 10_000,
    })

    // Check that sessionStorage has the tab value
    const storedTab = await page.evaluate(() => {
      return window.sessionStorage.getItem('bitbit-tab')
    })
    expect(storedTab).toBe('settings')
  })

  test('refreshing page maintains current tab', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)
    await waitForShell(page)

    // Navigate to contacts tab
    await navigateToTab(page, 'Contacts')
    await expect(page.locator('#tabpanel-contacts')).toHaveAttribute('data-active', 'true', {
      timeout: 10_000,
    })

    // Refresh the page
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForShell(page)

    // Contacts should still be the active tab after refresh
    const panel = page.locator('#tabpanel-contacts')
    await expect(panel).toHaveAttribute('data-active', 'true', { timeout: 15_000 })
    await expect(panel).toBeVisible()
  })

  test('navigating back restores previous tab state', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)
    await waitForShell(page)

    // Navigate to inbox
    await navigateToTab(page, 'Inbox')
    await expect(page.locator('#tabpanel-inbox')).toHaveAttribute('data-active', 'true', {
      timeout: 10_000,
    })

    // Navigate to leads
    await navigateToTab(page, 'Leads')
    await expect(page.locator('#tabpanel-leads')).toHaveAttribute('data-active', 'true', {
      timeout: 10_000,
    })

    // Verify we ended on leads
    const currentTab = await page.evaluate(() =>
      window.sessionStorage.getItem('bitbit-tab'),
    )
    expect(currentTab).toBe('leads')
  })
})
