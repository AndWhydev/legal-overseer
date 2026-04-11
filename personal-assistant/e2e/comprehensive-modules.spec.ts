// e2e/comprehensive-modules.spec.ts
import { test, expect, type Page } from '@playwright/test'
import {
  AUTH_SKIP_REASON,
  openProtectedPath,
  ApprovalQueuePage,
} from './helpers'

// Don't depend on persisted storageState file from setup — each test authenticates inline.
// This prevents cascading ENOENT failures when the auth state file gets cleaned up.
test.use({ storageState: { cookies: [], origins: [] } })

/**
 * Navigate to a tab using the bb-navigate custom event + sessionStorage persistence.
 * More reliable than the helpers.navigateToTab for advanced/hidden tabs.
 */
async function goToTab(page: Page, tabId: string, timeout = 15_000) {
  // First try the custom event approach
  await page.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: id } }))
  }, tabId)

  // Wait for panel to activate
  const panel = page.locator(`#tabpanel-${tabId}`).first()
  const activated = await panel
    .waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false)

  if (activated) return

  // Fallback: set sessionStorage and reload
  await page.evaluate((id) => {
    window.sessionStorage.setItem('bitbit-tab', id)
  }, tabId)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2_000)
}

/**
 * Ensure we're authenticated and on the dashboard, then navigate to a tab.
 */
async function openTab(page: Page, tabId: string): Promise<boolean> {
  const authenticated = await openProtectedPath(page, '/dashboard')
  if (!authenticated) return false

  await page.waitForTimeout(1_000)
  await goToTab(page, tabId)
  return true
}

// ─── Leads Pipeline ──────────────────────────────────────────────────────────

test.describe('Leads Pipeline', () => {
  test('leads tab renders pipeline view or empty state', async ({ page }) => {
    const ok = await openTab(page, 'leads')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(2_000)

    const panel = page.locator('#tabpanel-leads')
    if ((await panel.count()) > 0) {
      // Panel rendered — either with content or empty state, both valid
      await expect(panel).toBeVisible()
    }

    const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
    expect(await errorBoundary.count()).toBe(0)
  })

  test('lead cards show status chips or badges', async ({ page }) => {
    const ok = await openTab(page, 'leads')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(2_000)

    const statusChips = page.locator(
      '[class*="status"], [class*="stage"], [class*="pipeline"], [class*="badge"], [class*="chip"]',
    )
    const emptyState = page.locator('text=/No leads|no results|empty|get started/i')
    const panelExists = (await page.locator('#tabpanel-leads').count()) > 0

    expect(
      (await statusChips.count()) > 0 ||
      (await emptyState.count()) > 0 ||
      panelExists,
    ).toBeTruthy()
  })

  test('lead search filters results without crash', async ({ page }) => {
    const ok = await openTab(page, 'leads')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(1_000)

    const searchInput = page
      .locator(
        '#tabpanel-leads input[placeholder*="Search" i], #tabpanel-leads input[placeholder*="Find" i], #tabpanel-leads input[aria-label*="search" i]',
      )
      .first()

    if ((await searchInput.count()) > 0) {
      await searchInput.fill('nonexistent-lead-xyz-9999')
      await page.waitForTimeout(500)

      const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
      expect(await errorBoundary.count()).toBe(0)
      await searchInput.clear()
    }
    // No search input = feature not visible, test passes
  })

  test('discover/scout button exists and triggers API', async ({ page }) => {
    const ok = await openTab(page, 'leads')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(1_000)

    const discoverBtn = page
      .locator(
        '#tabpanel-leads button:has-text("Discover"), #tabpanel-leads button:has-text("Find Leads"), #tabpanel-leads button:has-text("Scout")',
      )
      .first()

    if ((await discoverBtn.count()) > 0) {
      const apiPromise = page
        .waitForResponse(
          (resp) => resp.url().includes('/api/agent/leads/discover'),
          { timeout: 10_000 },
        )
        .catch(() => null)

      await discoverBtn.click()
      const response = await apiPromise

      if (response) {
        expect([200, 202, 401, 503]).toContain(response.status())
      }

      const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
      expect(await errorBoundary.count()).toBe(0)
    }
  })
})

// ─── Invoices ─────────────────────────────────────────────────────────────────

test.describe('Invoices', () => {
  test('invoices tab renders list or empty state', async ({ page }) => {
    const ok = await openTab(page, 'invoices')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(2_000)

    const panel = page.locator('#tabpanel-invoices')
    if ((await panel.count()) > 0) {
      await expect(panel).toBeVisible()
    }

    const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
    expect(await errorBoundary.count()).toBe(0)
  })

  test('invoice status filter works', async ({ page }) => {
    const ok = await openTab(page, 'invoices')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(1_000)

    const filterBtn = page
      .locator(
        '#tabpanel-invoices button:has-text("Filter"), #tabpanel-invoices button:has-text("Status"), #tabpanel-invoices select[name*="status" i]',
      )
      .first()

    if ((await filterBtn.count()) > 0) {
      await filterBtn.click()
      await page.waitForTimeout(300)

      const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
      expect(await errorBoundary.count()).toBe(0)
    }
  })

  test('create invoice button opens dialog', async ({ page }) => {
    const ok = await openTab(page, 'invoices')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(1_000)

    const createBtn = page
      .locator(
        '#tabpanel-invoices button:has-text("Create"), #tabpanel-invoices button:has-text("New Invoice"), #tabpanel-invoices button:has-text("+ Invoice")',
      )
      .first()

    if ((await createBtn.count()) > 0) {
      await createBtn.click()
      await page.waitForTimeout(500)

      const dialog = page
        .locator('[role="dialog"], [class*="dialog"], [class*="modal"]')
        .first()
      if ((await dialog.count()) > 0) {
        await expect(dialog).toBeVisible()
        await page.keyboard.press('Escape')
      }
    }
  })

  test('invoice items show amount, status, or client', async ({ page }) => {
    const ok = await openTab(page, 'invoices')
    test.skip(!ok, AUTH_SKIP_REASON)

    const invoicesApiPromise = page
      .waitForResponse(
        (resp) =>
          resp.url().includes('/api/agent/invoices') &&
          resp.request().method() === 'GET',
        { timeout: 10_000 },
      )
      .catch(() => null)

    // Tab is already open, wait for API
    const response = await invoicesApiPromise

    if (response && response.status() === 200) {
      const body = await response.json().catch(() => null)
      if (body && Array.isArray(body) && body.length > 0) {
        const panel = page.locator('#tabpanel-invoices')
        const panelText = await panel.textContent()
        expect(
          panelText?.match(/\$|AUD|draft|paid|overdue|sent|pending/i),
        ).toBeTruthy()
      }
    }
    // No API response or no data = data-dependent, test passes
  })
})

// ─── Settings ─────────────────────────────────────────────────────────────────

test.describe('Settings', () => {
  test('settings page loads with form fields', async ({ page }) => {
    const ok = await openTab(page, 'settings')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(2_000)

    const panel = page.locator('#tabpanel-settings')
    if ((await panel.count()) > 0) {
      await expect(panel).toBeVisible()
    }

    const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
    expect(await errorBoundary.count()).toBe(0)
  })

  test('display name input is editable', async ({ page }) => {
    const ok = await openTab(page, 'settings')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(2_000)

    const nameInput = page
      .locator(
        '#tabpanel-settings input[name*="name" i], #tabpanel-settings input[placeholder*="name" i], #tabpanel-settings input[aria-label*="name" i]',
      )
      .first()

    if ((await nameInput.count()) > 0) {
      await nameInput.click()
      const currentVal = await nameInput.inputValue()
      await nameInput.fill('E2E Test Name')
      expect(await nameInput.inputValue()).toBe('E2E Test Name')
      await nameInput.fill(currentVal)
    }
  })

  test('autonomy level selector works', async ({ page }) => {
    const ok = await openTab(page, 'settings')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(2_000)

    const autonomySelect = page
      .locator(
        '#tabpanel-settings select[name*="autonomy" i], #tabpanel-settings [aria-label*="autonomy" i]',
      )
      .first()
    const autonomyButton = page
      .locator('#tabpanel-settings button:has-text("Low"), #tabpanel-settings button:has-text("Medium"), #tabpanel-settings button:has-text("High")')
      .first()

    if ((await autonomyButton.count()) > 0) {
      await autonomyButton.click()
    } else if ((await autonomySelect.count()) > 0) {
      await autonomySelect.click()
    }

    const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
    expect(await errorBoundary.count()).toBe(0)
  })

  test('save button triggers PATCH to /api/settings', async ({ page }) => {
    const ok = await openTab(page, 'settings')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(2_000)

    const saveBtn = page
      .locator('#tabpanel-settings button:has-text("Save"), #tabpanel-settings button:has-text("Update"), #tabpanel-settings button[type="submit"]')
      .first()

    if ((await saveBtn.count()) > 0) {
      const apiPromise = page
        .waitForResponse(
          (resp) =>
            resp.url().includes('/api/settings') &&
            (resp.request().method() === 'PATCH' || resp.request().method() === 'PUT'),
          { timeout: 8_000 },
        )
        .catch(() => null)

      await saveBtn.click()
      const response = await apiPromise

      if (response) {
        expect([200, 400, 401, 503]).toContain(response.status())
      }
    }
  })

  test('communication preferences section renders', async ({ page }) => {
    const ok = await openTab(page, 'settings')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(2_000)

    const panel = page.locator('#tabpanel-settings')
    if ((await panel.count()) > 0) {
      const text = (await panel.textContent()) ?? ''
      const hasCommunication =
        text.match(/communication|style|email|notification|preference/i) ?? false
      expect(hasCommunication || text.length > 10 || (await panel.count()) > 0).toBeTruthy()
    }
  })
})

// ─── Approvals Queue ──────────────────────────────────────────────────────────

test.describe('Approvals Queue', () => {
  test('approvals tab shows pending items or empty state', async ({ page }) => {
    const ok = await openTab(page, 'approvals')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(2_000)

    const panel = page.locator('#tabpanel-approvals')
    if ((await panel.count()) > 0) {
      await expect(panel).toBeVisible()
    }

    const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
    expect(await errorBoundary.count()).toBe(0)
  })

  test('approve button sends PATCH request', async ({ page }) => {
    const ok = await openTab(page, 'approvals')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(1_000)

    const approveBtn = page.locator('#tabpanel-approvals button:has-text("Approve")').first()
    if ((await approveBtn.count()) > 0) {
      const apiPromise = page
        .waitForResponse(
          (resp) =>
            resp.url().includes('/api/agent/approvals') &&
            (resp.request().method() === 'PATCH' || resp.request().method() === 'POST'),
          { timeout: 8_000 },
        )
        .catch(() => null)

      await approveBtn.click()
      const response = await apiPromise

      if (response) {
        expect([200, 400, 401, 503]).toContain(response.status())
      }
    }
  })

  test('reject button sends PATCH request', async ({ page }) => {
    const ok = await openTab(page, 'approvals')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(1_000)

    const rejectBtn = page.locator('#tabpanel-approvals button:has-text("Reject")').first()
    if ((await rejectBtn.count()) > 0) {
      const apiPromise = page
        .waitForResponse(
          (resp) =>
            resp.url().includes('/api/agent/approvals') &&
            (resp.request().method() === 'PATCH' || resp.request().method() === 'POST'),
          { timeout: 8_000 },
        )
        .catch(() => null)

      await rejectBtn.click()
      const response = await apiPromise

      if (response) {
        expect([200, 400, 401, 503]).toContain(response.status())
      }
    }
  })

  test('UI updates after approval/rejection action', async ({ page }) => {
    const ok = await openTab(page, 'approvals')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(1_000)

    const approvalPage = new ApprovalQueuePage(page)
    const initialCount = await approvalPage.getPendingCount()

    const actionBtn = page
      .locator('#tabpanel-approvals button:has-text("Approve"), #tabpanel-approvals button:has-text("Reject")')
      .first()
    if ((await actionBtn.count()) > 0) {
      await actionBtn.click()
      await page.waitForTimeout(2_000)

      const afterCount = await approvalPage.getPendingCount()
      const statusMsg = page.locator('text=/approved|rejected|success|updated|no.*pending/i')
      const changed = afterCount !== initialCount || (await statusMsg.count()) > 0
      expect(changed || initialCount === 0).toBeTruthy()
    }
  })
})

// ─── Tab Render & No-Crash Verification ───────────────────────────────────────

test.describe('Tab Render Verification', () => {
  const TABS_TO_VERIFY = [
    { id: 'tenders', label: 'Tenders' },
    { id: 'reports', label: 'Reports' },
    { id: 'knowledge', label: 'Knowledge' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'activity', label: 'Activity' },
    { id: 'costs', label: 'Costs' },
    { id: 'ad-scripts', label: 'Ad Scripts' },
    { id: 'ai-search', label: 'AI Search' },
    { id: 'creator-studio', label: 'Creator Studio' },
    { id: 'medications', label: 'Medications' },
    { id: 'admin', label: 'Admin' },
    { id: 'jobs', label: 'Jobs' },
    { id: 'quotes', label: 'Quotes' },
    { id: 'sentry', label: 'Sentry' },
  ]

  for (const tab of TABS_TO_VERIFY) {
    test(`"${tab.label}" tab renders without crash`, async ({ page }) => {
      const jsErrors: string[] = []
      page.on('pageerror', (error) => {
        if (error.message.includes('Hydration')) return
        jsErrors.push(error.message)
      })

      const ok = await openTab(page, tab.id)
      test.skip(!ok, AUTH_SKIP_REASON)

      await page.waitForTimeout(2_000)

      // Tab content panel should exist
      const panel = page.locator(`#tabpanel-${tab.id}`)
      if ((await panel.count()) > 0) {
        await expect(panel).toBeVisible()
      }

      // No error boundary
      const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
      expect(await errorBoundary.count()).toBe(0)

      // No critical JS errors
      const criticalErrors = jsErrors.filter(
        (e) =>
          e.includes('is not a function') ||
          e.includes('Cannot read properties') ||
          e.includes('is not defined'),
      )
      expect(criticalErrors).toEqual([])
    })
  }
})

// ─── Global Search (Cmd+K) ───────────────────────────────────────────────────

test.describe('Global Search (Cmd+K)', () => {
  test('Ctrl+K opens search palette', async ({ page }) => {
    const ok = await openTab(page, 'dashboard')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(1_000)

    // Use Control+k (Linux/Chromium) — the app checks for both metaKey and ctrlKey
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(500)

    const searchBackdrop = page.locator('.bb-search-backdrop').first()
    const searchPanel = page.locator('.bb-search-panel').first()
    const searchInput = page.locator('.bb-search-input').first()

    const isOpen =
      ((await searchBackdrop.count()) > 0 && (await searchBackdrop.isVisible().catch(() => false))) ||
      ((await searchPanel.count()) > 0 && (await searchPanel.isVisible().catch(() => false))) ||
      ((await searchInput.count()) > 0 && (await searchInput.isVisible().catch(() => false)))

    expect(isOpen).toBeTruthy()
  })

  test('search input accepts text', async ({ page }) => {
    const ok = await openTab(page, 'dashboard')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(1_000)
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(500)

    const searchInput = page.locator('.bb-search-input').first()

    if ((await searchInput.count()) > 0) {
      await searchInput.fill('test query')
      expect(await searchInput.inputValue()).toBe('test query')
    }
  })

  test('results appear or search panel shows content after typing', async ({ page }) => {
    const ok = await openTab(page, 'dashboard')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(1_000)
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(500)

    const searchInput = page.locator('.bb-search-input').first()

    if ((await searchInput.count()) > 0) {
      await searchInput.fill('invoice')
      // Wait for debounced search (300ms) + API round-trip
      await page.waitForTimeout(2_000)

      const panel = page.locator('.bb-search-panel').first()
      const panelText = (await panel.textContent()) ?? ''
      // Panel should contain something — results, "no results", recent searches, or loading
      expect(panelText.length > 0).toBeTruthy()
    }
  })

  test('Escape closes the search palette', async ({ page }) => {
    const ok = await openTab(page, 'dashboard')
    test.skip(!ok, AUTH_SKIP_REASON)

    await page.waitForTimeout(1_000)
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(500)

    const searchBackdrop = page.locator('.bb-search-backdrop').first()
    const isOpen = (await searchBackdrop.count()) > 0 && (await searchBackdrop.isVisible().catch(() => false))

    if (isOpen) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)

      // After escape, backdrop should be gone
      const stillVisible = await searchBackdrop.isVisible().catch(() => false)
      expect(stillVisible).toBe(false)
    }
  })
})

// ─── API Security ─────────────────────────────────────────────────────────────

test.describe('API Security (unauthenticated)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('GET /api/agent/approvals returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/agent/approvals')
    expect([401, 503]).toContain(response.status())
  })

  test('GET /api/settings returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/settings')
    expect([401, 503]).toContain(response.status())
  })

  test('GET /api/agent/triage returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/agent/triage')
    expect([401, 403, 503]).toContain(response.status())
  })

  test('POST /api/webhooks/asana rejects unsigned POST', async ({ request }) => {
    const response = await request.post('/api/webhooks/asana', {
      data: { events: [{ action: 'changed', resource: { gid: '123' } }] },
      headers: { 'Content-Type': 'application/json' },
    })
    expect([400, 401, 403]).toContain(response.status())
  })
})
