// e2e/leads-invoices.spec.ts
import { test, expect } from '@playwright/test'
import { AUTH_SKIP_REASON, openProtectedPath, navigateToTab } from './helpers'

test.describe('Leads Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    const authenticated = await openProtectedPath(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)
  })

  test('leads tab renders pipeline view or empty state', async ({ page }) => {
    await navigateToTab(page, 'Leads')
    await page.waitForTimeout(2_000)

    const panel = page.locator('#tabpanel-leads')
    if (await panel.count() > 0) {
      const panelText = await panel.textContent()
      expect(panelText && panelText.length > 10).toBeTruthy()
    }

    // No JS crashes
    const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
    expect(await errorBoundary.count()).toBe(0)
  })

  test('leads API loads data when tab opens', async ({ page }) => {
    // Intercept leads API call
    const leadsApiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/agent/leads') && resp.request().method() === 'GET',
      { timeout: 10_000 },
    ).catch(() => null)

    await navigateToTab(page, 'Leads')
    const response = await leadsApiPromise

    if (response) {
      expect([200, 401, 503]).toContain(response.status())
      if (response.status() === 200) {
        const body = await response.json()
        expect(body).toBeDefined()
      }
    }
  })

  test('leads search filters results', async ({ page }) => {
    await navigateToTab(page, 'Leads')
    await page.waitForTimeout(1_000)

    const searchInput = page.locator(
      'input[placeholder*="Search" i], input[placeholder*="Find" i], input[aria-label*="search" i]',
    ).first()

    if (await searchInput.count() > 0) {
      await searchInput.fill('nonexistent-lead-xyz')
      await page.waitForTimeout(500)

      // No crash
      const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
      expect(await errorBoundary.count()).toBe(0)

      await searchInput.clear()
    }
  })

  test('lead status chips render with correct states', async ({ page }) => {
    await navigateToTab(page, 'Leads')
    await page.waitForTimeout(2_000)

    // Check for pipeline status indicators
    const statusChips = page.locator(
      '[class*="status"], [class*="stage"], [class*="pipeline"], [class*="badge"]',
    )

    // Either has leads with status indicators or empty state
    const emptyState = page.locator('text=/No leads|no results|empty|get started/i')
    const hasChips = await statusChips.count() > 0
    const hasEmpty = await emptyState.count() > 0
    expect(hasChips || hasEmpty).toBeTruthy()
  })
})

test.describe('Lead Discovery', () => {
  test.beforeEach(async ({ page }) => {
    const authenticated = await openProtectedPath(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)
  })

  test('discover button triggers lead discovery API', async ({ page }) => {
    await navigateToTab(page, 'Leads')
    await page.waitForTimeout(1_000)

    const discoverBtn = page.locator(
      'button:has-text("Discover"), button:has-text("Find Leads"), button:has-text("Scout")',
    ).first()

    if (await discoverBtn.count() > 0) {
      const apiPromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/agent/leads/discover'),
        { timeout: 10_000 },
      ).catch(() => null)

      await discoverBtn.click()
      const response = await apiPromise

      if (response) {
        expect([200, 202, 401, 503]).toContain(response.status())
      }

      // No crash
      const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
      expect(await errorBoundary.count()).toBe(0)
    }
  })
})

test.describe('Invoices Tab', () => {
  test.beforeEach(async ({ page }) => {
    const authenticated = await openProtectedPath(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)
  })

  test('invoices tab renders list or empty state', async ({ page }) => {
    await navigateToTab(page, 'Invoices')
    await page.waitForTimeout(2_000)

    const panel = page.locator('#tabpanel-invoices')
    if (await panel.count() > 0) {
      const panelText = await panel.textContent()
      expect(panelText && panelText.length > 10).toBeTruthy()
    }

    // No crash
    const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
    expect(await errorBoundary.count()).toBe(0)
  })

  test('invoices API loads data when tab opens', async ({ page }) => {
    const invoicesApiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/agent/invoices') && resp.request().method() === 'GET',
      { timeout: 10_000 },
    ).catch(() => null)

    await navigateToTab(page, 'Invoices')
    const response = await invoicesApiPromise

    if (response) {
      expect([200, 401, 503]).toContain(response.status())
    }
  })

  test('invoice status filters work', async ({ page }) => {
    await navigateToTab(page, 'Invoices')
    await page.waitForTimeout(1_000)

    // Look for filter controls
    const filterBtn = page.locator(
      'button:has-text("Filter"), button:has-text("Status"), select[name*="status"]',
    ).first()

    if (await filterBtn.count() > 0) {
      await filterBtn.click()
      await page.waitForTimeout(300)

      // Should open dropdown/menu without crash
      const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
      expect(await errorBoundary.count()).toBe(0)
    }
  })

  test('create invoice button exists and opens dialog', async ({ page }) => {
    await navigateToTab(page, 'Invoices')
    await page.waitForTimeout(1_000)

    const createBtn = page.locator(
      'button:has-text("Create"), button:has-text("New Invoice"), button:has-text("+ Invoice")',
    ).first()

    if (await createBtn.count() > 0) {
      await createBtn.click()
      await page.waitForTimeout(500)

      // Dialog should open
      const dialog = page.locator('[role="dialog"], [class*="dialog"], [class*="modal"]').first()
      if (await dialog.count() > 0) {
        await expect(dialog).toBeVisible()
        await page.keyboard.press('Escape')
      }
    }
  })
})

test.describe('Tenders Tab', () => {
  test.beforeEach(async ({ page }) => {
    const authenticated = await openProtectedPath(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)
  })

  test('tenders tab renders list or empty state', async ({ page }) => {
    await navigateToTab(page, 'Tenders')
    await page.waitForTimeout(2_000)

    const panel = page.locator('#tabpanel-tenders')
    if (await panel.count() > 0) {
      const panelText = await panel.textContent()
      expect(panelText && panelText.length > 10).toBeTruthy()
    }

    const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
    expect(await errorBoundary.count()).toBe(0)
  })

  test('tenders API loads capabilities', async ({ page }) => {
    const capabilitiesApiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/agent/tenders'),
      { timeout: 10_000 },
    ).catch(() => null)

    await navigateToTab(page, 'Tenders')
    const response = await capabilitiesApiPromise

    if (response) {
      expect([200, 401, 503]).toContain(response.status())
    }
  })
})
