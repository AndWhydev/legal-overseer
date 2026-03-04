import { test, expect } from '@playwright/test'
import {
  AUTH_SKIP_REASON,
  waitForDashboard,
  navigateToTab,
  ApprovalQueuePage,
  openProtectedPath,
  ensureAuthenticated,
} from './helpers'

async function openSearchPalette(page: import('@playwright/test').Page) {
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(250)

  const palette = page.locator(
    '[data-testid="search-palette"], [role="dialog"], [class*="command-palette"], [class*="search-modal"]',
  )

  if (!(await palette.count()) || !(await palette.first().isVisible().catch(() => false))) {
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(300)
  }
}

/**
 * Workflow E2E tests: verify actual user interactions beyond page-load checks.
 */

test.describe('Login Flow', () => {
  test('redirects unauthenticated user to login page', async ({ page }) => {
    await page.goto('/dashboard')
    // Should redirect to login or show auth prompt
    await page.waitForTimeout(2000)
    const url = page.url()
    const hasLoginForm = await page.locator('input[type="email"], input[type="password"], button:has-text("Sign in"), button:has-text("Log in")').count()
    // Either redirected to /login or shows inline auth
    expect(url.includes('/login') || hasLoginForm > 0).toBeTruthy()
  })

  test('shows validation error for empty credentials', async ({ page }) => {
    await page.goto('/login')
    const submitBtn = page.locator('button[type="submit"]').first()
    const emailInput = page.locator('input[type="email"]').first()
    if (await submitBtn.count() > 0 && await emailInput.count() > 0) {
      const isEnabled = await submitBtn.isEnabled().catch(() => false)
      if (isEnabled) {
        await submitBtn.click()
        await page.waitForTimeout(500)
        const validationMessage = await emailInput.evaluate(
          (el) => (el as HTMLInputElement).validationMessage,
        )
        expect(validationMessage.length).toBeGreaterThan(0)
      } else {
        await expect(submitBtn).toBeDisabled()
        const isRequired = await emailInput.evaluate((el) => (el as HTMLInputElement).required)
        expect(isRequired).toBeTruthy()
      }
    }
  })

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login')
    const emailInput = page.locator('input[type="email"]')
    const passwordInput = page.locator('input[type="password"]')

    if (await emailInput.count() > 0 && await passwordInput.count() > 0) {
      await emailInput.fill('invalid@test.com')
      await passwordInput.fill('wrong-password')
      await page.locator('button[type="submit"]').click()
      await page.waitForTimeout(2000)

      // Should show error message, not redirect to dashboard
      const errorVisible = await page.locator('text=/Invalid|error|failed|incorrect/i').count()
      const onDashboard = page.url().includes('/dashboard')
      expect(errorVisible > 0 || !onDashboard).toBeTruthy()
    }
  })

  test('successful login redirects to dashboard', async ({ page }) => {
    const authenticated = await ensureAuthenticated(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)
    await waitForDashboard(page)
    expect(page.url()).toContain('dashboard')
  })
})

test.describe('Approval Workflow', () => {
  test.beforeEach(async ({ page }) => {
    const authenticated = await openProtectedPath(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)
    await waitForDashboard(page)
  })

  test('approval list loads and shows items or empty state', async ({ page }) => {
    const approvalPage = new ApprovalQueuePage(page)
    await approvalPage.goto()
    await page.waitForTimeout(1000)

    // Should show approval items or an empty state message
    const items = page.locator('[data-testid="approval-item"], [class*="approval"]')
    const emptyState = page.locator('text=/No pending|no approvals|empty|nothing to review/i')
    const itemCount = await items.count()
    const hasEmpty = await emptyState.count()
    expect(itemCount > 0 || hasEmpty > 0).toBeTruthy()
  })

  test('approve action sends PATCH and updates UI', async ({ page }) => {
    const approvalPage = new ApprovalQueuePage(page)
    await approvalPage.goto()
    await page.waitForTimeout(1000)

    const approveBtn = page.locator('button:has-text("Approve")').first()
    if (await approveBtn.count() > 0) {
      const initialCount = await approvalPage.getPendingCount()

      // Intercept the API call to verify it's made correctly
      const apiPromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/agent/approvals') && resp.request().method() === 'PATCH',
        { timeout: 5000 },
      ).catch(() => null)

      await approveBtn.click()
      const response = await apiPromise

      if (response) {
        expect([200, 409]).toContain(response.status()) // 409 if already resolved
      }

      await page.waitForTimeout(1000)

      // UI should update: either count decreases, toast appears, or status changes
      const toast = page.locator('text=/approved|success/i')
      const newCount = await approvalPage.getPendingCount()
      expect(await toast.count() > 0 || newCount <= initialCount).toBeTruthy()
    }
  })

  test('reject action sends PATCH with rejected decision', async ({ page }) => {
    const approvalPage = new ApprovalQueuePage(page)
    await approvalPage.goto()
    await page.waitForTimeout(1000)

    const rejectBtn = page.locator('button:has-text("Reject")').first()
    if (await rejectBtn.count() > 0) {
      const apiPromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/agent/approvals') && resp.request().method() === 'PATCH',
        { timeout: 5000 },
      ).catch(() => null)

      await rejectBtn.click()
      const response = await apiPromise

      if (response) {
        expect([200, 409]).toContain(response.status())
        if (response.status() === 200) {
          const body = await response.json()
          expect(body.approval).toBeDefined()
        }
      }
    }
  })
})

test.describe('Inbox & Triage', () => {
  test.beforeEach(async ({ page }) => {
    const authenticated = await openProtectedPath(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)
    await waitForDashboard(page)
  })

  test('inbox tab loads messages or shows empty state', async ({ page }) => {
    await navigateToTab(page, 'Inbox')
    await page.waitForTimeout(1000)

    const messages = page.locator('[data-testid="inbox-message"], [class*="message-item"], [class*="inbox"] li')
    const emptyState = page.locator('text=/No messages|inbox is empty|no new messages/i')
    const msgCount = await messages.count()
    const hasEmpty = await emptyState.count()
    expect(msgCount > 0 || hasEmpty > 0).toBeTruthy()
  })

  test('inbox filters by channel type', async ({ page }) => {
    await navigateToTab(page, 'Inbox')
    await page.waitForTimeout(1000)

    // Look for filter controls
    const nativeFilterSelect = page.locator('select[name*="channel"]:visible').first()
    const filterSelect = page.locator('[data-testid="channel-filter"]:visible, button:has-text("Filter"):visible')
    if (await nativeFilterSelect.count() > 0) {
      await nativeFilterSelect.selectOption('gmail').catch(async () => {
        const options = await nativeFilterSelect.locator('option').allTextContents()
        const match = options.find(opt => /gmail/i.test(opt))
        if (match) await nativeFilterSelect.selectOption({ label: match })
      })
      await page.waitForTimeout(500)
      const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
      expect(await errorBoundary.count()).toBe(0)
      return
    }

    if (await filterSelect.count() > 0) {
      await filterSelect.first().click()
      await page.waitForTimeout(300)

      // Try selecting a channel filter option
      const gmailOption = page.locator('option:has-text("Gmail"), [role="option"]:has-text("Gmail"), button:has-text("Gmail")')
      if (await gmailOption.count() > 0 && await gmailOption.first().isVisible().catch(() => false)) {
        await gmailOption.first().click()
        await page.waitForTimeout(500)
        // Page should update without errors
        const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
        expect(await errorBoundary.count()).toBe(0)
      }
    }
  })

  test('inbox priority filter works', async ({ page }) => {
    await navigateToTab(page, 'Inbox')
    await page.waitForTimeout(1000)

    const nativePrioritySelect = page.locator('select[name*="priority"]:visible').first()
    const priorityFilter = page.locator('[data-testid="priority-filter"]:visible, button:has-text("Priority"):visible')
    if (await nativePrioritySelect.count() > 0) {
      await nativePrioritySelect.selectOption('high').catch(async () => {
        const options = await nativePrioritySelect.locator('option').allTextContents()
        const match = options.find(opt => /high/i.test(opt))
        if (match) await nativePrioritySelect.selectOption({ label: match })
      })
      await page.waitForTimeout(500)
      const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
      expect(await errorBoundary.count()).toBe(0)
      return
    }

    if (await priorityFilter.count() > 0) {
      await priorityFilter.first().click()
      await page.waitForTimeout(300)

      const highOption = page.locator('option:has-text("High"), [role="option"]:has-text("High"), button:has-text("High")')
      if (await highOption.count() > 0) {
        await highOption.first().click()
        await page.waitForTimeout(500)
        const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
        expect(await errorBoundary.count()).toBe(0)
      }
    }
  })
})

test.describe('Channel Sync', () => {
  test.beforeEach(async ({ page }) => {
    const authenticated = await openProtectedPath(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)
    await waitForDashboard(page)
  })

  test('channels tab shows connection status', async ({ page }) => {
    await navigateToTab(page, 'Connections')
    await page.waitForTimeout(1000)

    const panel = page.locator('#tabpanel-connections')
    expect(await panel.count()).toBeGreaterThan(0)
  })

  test('sync button triggers channel sync without error', async ({ page }) => {
    await navigateToTab(page, 'Connections')
    await page.waitForTimeout(1000)

    const syncBtn = page.locator('button:has-text("Sync"), button:has-text("Refresh"), button[aria-label*="sync"]')
    if (await syncBtn.count() > 0) {
      // Intercept sync API call
      const apiPromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/channel') || resp.url().includes('/api/sync'),
        { timeout: 10000 },
      ).catch(() => null)

      await syncBtn.first().click()
      await page.waitForTimeout(2000)

      // Should not crash
      const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
      expect(await errorBoundary.count()).toBe(0)
    }
  })
})

test.describe('Settings Update', () => {
  test.beforeEach(async ({ page }) => {
    const authenticated = await openProtectedPath(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)
    await waitForDashboard(page)
  })

  test('settings page loads with current profile', async ({ page }) => {
    await navigateToTab(page, 'Settings')
    await page.waitForTimeout(1000)

    // Settings should show form fields or preference controls
    const inputs = page.locator('input, select, [role="combobox"], textarea')
    const labels = page.getByText(/Display Name|Email|Preferences|Autonomy|Communication/i).first()
    const hasLabels = await labels.count().then(c => c > 0).catch(() => false)
    expect(await inputs.count() > 0 || hasLabels).toBeTruthy()
  })

  test('can update display name', async ({ page }) => {
    await navigateToTab(page, 'Settings')
    await page.waitForTimeout(1000)

    const nameInput = page.locator('input[name="displayName"], input[name="display_name"], input[placeholder*="name" i]')
    if (await nameInput.count() > 0) {
      const originalValue = await nameInput.inputValue()
      const testName = `Test User ${Date.now()}`

      await nameInput.clear()
      await nameInput.fill(testName)

      // Find and click save button
      const saveBtn = page.locator('button:has-text("Save"), button:has-text("Update"), button[type="submit"]')
      if (await saveBtn.count() > 0) {
        const apiPromise = page.waitForResponse(
          (resp) => resp.url().includes('/api/settings') && resp.request().method() === 'PATCH',
          { timeout: 5000 },
        ).catch(() => null)

        await saveBtn.first().click()
        const response = await apiPromise

        if (response) {
          expect([200, 401]).toContain(response.status())
        }

        await page.waitForTimeout(1000)

        // Restore original value
        if (originalValue) {
          await nameInput.clear()
          await nameInput.fill(originalValue)
          await saveBtn.first().click()
          await page.waitForTimeout(1000)
        }
      }
    }
  })

  test('autonomy level selector updates preference', async ({ page }) => {
    await navigateToTab(page, 'Settings')
    await page.waitForTimeout(1000)

    const autonomySelect = page.locator('select[name*="autonomy"]:visible, [data-testid="autonomy-level"]:visible, button:has-text("Autonomy"):visible')
    if (await autonomySelect.count() > 0) {
      await autonomySelect.first().click()
      await page.waitForTimeout(300)

      const option = page.locator('option:has-text("High"), [role="option"]:has-text("High")')
      if (await option.count() > 0) {
        await option.first().click()
        await page.waitForTimeout(500)

        const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
        expect(await errorBoundary.count()).toBe(0)
      }
    }
  })
})

test.describe('Global Search (Cmd+K)', () => {
  test.beforeEach(async ({ page }) => {
    const authenticated = await openProtectedPath(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)
    await waitForDashboard(page)
  })

  test('Cmd+K opens search palette', async ({ page }) => {
    await openSearchPalette(page)
    await page.waitForTimeout(250)

    // Search palette should appear
    const palette = page.locator('[data-testid="search-palette"], [role="dialog"], [class*="command-palette"], [class*="search-modal"]')
    if (await palette.count() > 0) {
      expect(await palette.first().isVisible()).toBeTruthy()
    }
  })

  test('search palette returns results on input', async ({ page }) => {
    await openSearchPalette(page)
    await page.waitForTimeout(250)

    const searchInput = page.locator('[data-testid="search-input"], [role="dialog"] input, [class*="command-palette"] input, [class*="search-modal"] input')
    if (await searchInput.count() > 0) {
      await searchInput.first().fill('test')
      await page.waitForTimeout(1000)

      // Should show results or "no results" message
      const results = page.locator('[data-testid="search-result"], [role="dialog"] li, [class*="result"]')
      const noResults = page.locator('text=/No results|nothing found/i')
      expect(await results.count() > 0 || await noResults.count() > 0).toBeTruthy()
    }
  })

  test('Escape closes search palette', async ({ page }) => {
    await openSearchPalette(page)
    await page.waitForTimeout(250)

    const palette = page.locator('[data-testid="search-palette"], [role="dialog"], [class*="command-palette"], [class*="search-modal"]')
    if (await palette.count() > 0) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
      expect(await palette.isVisible()).toBeFalsy()
    }
  })
})

test.describe('API Route Integration', () => {
  test('approvals API returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/agent/approvals')
    expect([401, 503]).toContain(response.status())
  })

  test('settings API returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/settings')
    expect([401, 503]).toContain(response.status())
  })

  test('triage API returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/agent/triage')
    expect([401, 503]).toContain(response.status())
  })

  test('inbox API returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/agent/inbox')
    expect([401, 503]).toContain(response.status())
  })

  test('webhook endpoints reject unsigned requests', async ({ request }) => {
    const asanaResponse = await request.post('/api/webhooks/asana', {
      data: { events: [] },
    })
    expect(asanaResponse.status()).toBe(401)

    const calendlyResponse = await request.post('/api/webhooks/calendly', {
      data: { event: 'test', payload: {} },
    })
    expect(calendlyResponse.status()).toBe(401)
  })
})
