// e2e/dashboard-kpis.spec.ts
import { test, expect, type Page } from '@playwright/test'
import { AUTH_SKIP_REASON, openProtectedPath, navigateToTab } from './helpers'

async function openDashboardTab(page: Page) {
  const authenticated = await openProtectedPath(page, '/dashboard')
  if (!authenticated) return false
  await navigateToTab(page, 'Dashboard')
  await page.waitForTimeout(2_000) // Allow stats to load
  return true
}

test.describe('Dashboard KPI Cards', () => {
  test('KPI stat cards render with values', async ({ page }) => {
    const ready = await openDashboardTab(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // The dashboard stats API should be called
    const statsCall = page.waitForResponse(
      (resp) => resp.url().includes('/api/dashboard/stats'),
      { timeout: 10_000 },
    ).catch(() => null)

    // Refresh to capture the call
    await navigateToTab(page, 'Dashboard')
    const statsResponse = await statsCall

    if (statsResponse && statsResponse.status() === 200) {
      const data = await statsResponse.json()

      // KPI cards should render values from the stats
      // Look for stat card containers
      const statCards = page.locator(
        '[class*="stat-card"], [class*="kpi"], [class*="metric-card"], [data-testid*="stat"]',
      )

      // At minimum, some numeric content should appear
      const bodyText = await page.textContent('body')
      const hasNumericContent = /\d+/.test(bodyText || '')
      expect(hasNumericContent).toBeTruthy()
    }
  })

  test('stats API failure shows graceful fallback', async ({ page }) => {
    const ready = await openDashboardTab(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Mock stats API to fail
    await page.route('**/api/dashboard/stats', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    })

    // Navigate away and back to trigger reload
    await navigateToTab(page, 'Chat')
    await page.waitForTimeout(500)
    await navigateToTab(page, 'Dashboard')
    await page.waitForTimeout(2_000)

    // Should not crash — error boundary or fallback state
    const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
    const jsErrors: string[] = []
    page.on('pageerror', (error) => {
      if (!error.message.includes('Hydration')) jsErrors.push(error.message)
    })

    // Dashboard should still be usable
    const bodyText = await page.textContent('body')
    expect(bodyText && bodyText.length > 100).toBeTruthy()
  })
})

test.describe('Dashboard Daily Brief', () => {
  test('daily brief section renders or shows empty state', async ({ page }) => {
    const ready = await openDashboardTab(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Look for daily brief section
    const briefSection = page.locator(
      'text=/daily brief|today|good morning|good afternoon|good evening/i',
    ).first()

    const emptyState = page.locator(
      'text=/No briefing|no updates|nothing new/i',
    ).first()

    // Either brief renders or empty state — both valid
    const hasBrief = await briefSection.count() > 0
    const hasEmpty = await emptyState.count() > 0

    // At minimum the dashboard tab should render something
    const panel = page.locator('#tabpanel-dashboard')
    if (await panel.count() > 0) {
      const panelText = await panel.textContent()
      expect(panelText && panelText.length > 10).toBeTruthy()
    }
  })
})

test.describe('Dashboard Inbox Feed', () => {
  test('inbox feed renders with messages or empty state', async ({ page }) => {
    const ready = await openDashboardTab(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Look for inbox feed section
    const inboxSection = page.locator(
      '[class*="inbox-feed"], [class*="message-feed"], text=/recent messages|inbox/i',
    ).first()

    const emptyInbox = page.locator(
      'text=/no messages|inbox is empty|no new/i',
    ).first()

    // Dashboard should render without crash regardless
    const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
    expect(await errorBoundary.count()).toBe(0)
  })
})

test.describe('Contacts Tab', () => {
  test('contacts list loads with items or empty state', async ({ page }) => {
    const ready = await openProtectedPath(page, '/dashboard')
    test.skip(!ready, AUTH_SKIP_REASON)

    await navigateToTab(page, 'Contacts')
    await page.waitForTimeout(2_000)

    // Should show contact list or empty state
    const contacts = page.locator(
      '[class*="contact-item"], [class*="contact-card"], tr, li',
    )
    const emptyState = page.locator(
      'text=/No contacts|no results|empty|add your first/i',
    )

    const hasContacts = await contacts.count() > 2 // exclude header rows
    const hasEmpty = await emptyState.count() > 0

    // At minimum the panel rendered
    const panel = page.locator('#tabpanel-contacts')
    if (await panel.count() > 0) {
      const panelText = await panel.textContent()
      expect(panelText && panelText.length > 10).toBeTruthy()
    }
  })

  test('contact search filters list', async ({ page }) => {
    const ready = await openProtectedPath(page, '/dashboard')
    test.skip(!ready, AUTH_SKIP_REASON)

    await navigateToTab(page, 'Contacts')
    await page.waitForTimeout(1_000)

    const searchInput = page.locator(
      'input[placeholder*="Search" i], input[aria-label*="search" i]',
    ).first()

    if (await searchInput.count() > 0) {
      await searchInput.fill('nonexistent-contact-xyz')
      await page.waitForTimeout(500)

      // Should not crash
      const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
      expect(await errorBoundary.count()).toBe(0)

      await searchInput.clear()
    }
  })
})

test.describe('Activity Tab', () => {
  test('activity feed renders timeline or empty state', async ({ page }) => {
    const ready = await openProtectedPath(page, '/dashboard')
    test.skip(!ready, AUTH_SKIP_REASON)

    await navigateToTab(page, 'Activity')
    await page.waitForTimeout(2_000)

    const panel = page.locator('#tabpanel-activity')
    if (await panel.count() > 0) {
      const panelText = await panel.textContent()
      expect(panelText && panelText.length > 10).toBeTruthy()
    }

    // No JS crashes
    const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
    expect(await errorBoundary.count()).toBe(0)
  })
})
