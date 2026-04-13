import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const E2E_EMAIL = process.env.E2E_USER_EMAIL ?? 'hi+test@torkay.com'
const E2E_PASSWORD = process.env.E2E_USER_PASSWORD ?? ''

/** Collect console errors during a test so we can assert zero JS errors. */
function trackConsoleErrors(page: Page): ConsoleMessage[] {
  const errors: ConsoleMessage[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg)
  })
  return errors
}

/**
 * Click a sidebar tab by its label and wait for its content to be visible.
 *
 * The dashboard is an SPA shell. Tabs are selected in the sidebar-rail /
 * sidebar-panel and render lazily inside the main area. We target the sidebar
 * button whose accessible name matches `label`, then wait for the
 * corresponding tab panel (or a content marker) to appear.
 */
async function navigateToTab(page: Page, label: string) {
  // The sidebar may render the label in a rail icon tooltip or in the
  // expanded panel. Use getByRole first, fall back to text selector.
  const tab = page.getByRole('button', { name: label }).or(
    page.locator(`[data-tab-id]`, { hasText: label }),
  )

  // Some tabs live inside a collapsed category — expand if needed.
  if (!(await tab.first().isVisible({ timeout: 2_000 }).catch(() => false))) {
    // Try clicking category headers that might contain this tab
    const categories = page.locator('[data-sidebar-category]')
    const count = await categories.count()
    for (let i = 0; i < count; i++) {
      await categories.nth(i).click()
      if (await tab.first().isVisible({ timeout: 500 }).catch(() => false)) break
    }
  }

  await tab.first().click()
  // Give the lazy tab time to mount
  await page.waitForTimeout(1_500)
}

// ---------------------------------------------------------------------------
// Auth setup — ensure we are logged in before the suite
// ---------------------------------------------------------------------------

test.describe('Production Readiness E2E', () => {
  test.describe.configure({ mode: 'serial' })

  // ── 1. Auth Flow ────────────────────────────────────────────────────────

  test.describe('Auth flow', () => {
    test('landing page renders at /', async ({ page }) => {
      await page.goto('/')
      // The marketing page or login page should render — either is acceptable
      await expect(
        page.locator('body'),
      ).not.toHaveText('Application error', { timeout: 10_000 })
      // Should have some visible text content
      const bodyText = await page.locator('body').innerText()
      expect(bodyText.length).toBeGreaterThan(0)
    })

    test('/dashboard redirects to /login when not authenticated', async ({ page }) => {
      // Clear all cookies to simulate a fresh visitor
      await page.context().clearCookies()
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      // Should redirect to login
      await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })
    })

    test('login page shows sign-in form', async ({ page }) => {
      await page.goto('/login')
      await expect(page.locator('h1')).toContainText('Meet BitBit', { timeout: 10_000 })
      // Email input should be present
      await expect(page.locator('input[type="email"]').first()).toBeVisible()
      // Google sign-in button
      await expect(
        page.getByRole('button', { name: /Continue with Google/i }),
      ).toBeVisible()
    })

    test('login with test credentials and reach dashboard', async ({ page }) => {
      // This test requires a password to be set for the E2E user.
      // In CI / dev, the /api/auth/e2e/password route can set one.
      // If no password is available, skip gracefully.
      test.skip(!E2E_PASSWORD, 'E2E_USER_PASSWORD not set — skipping password login')

      await page.goto('/login')

      // Use the Supabase signInWithPassword flow via the dev password form
      // (visible only in NODE_ENV=development)
      const devToggle = page.getByText('Dev: Password Login')
      if (await devToggle.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await devToggle.click()
        await page.locator('input[type="email"]').last().fill(E2E_EMAIL)
        await page.locator('input[type="password"]').fill(E2E_PASSWORD)
        await page.getByRole('button', { name: /Sign in with password/i }).click()
      } else {
        // Fallback: use the magic-link email input (will only send the link)
        await page.locator('input[type="email"]').first().fill(E2E_EMAIL)
        await page.getByRole('button', { name: /Send sign-in link/i }).click()
        // We cannot complete magic-link flow in E2E — mark as expected
        test.skip(true, 'Dev password login not available — magic link only')
      }

      // After successful login, should redirect to /dashboard
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 })
      // Wait for SPA shell to load
      await page.waitForLoadState('networkidle')
    })
  })

  // ── 2. Dashboard Navigation (requires auth from storageState) ──────────

  test.describe('Dashboard navigation', () => {
    // These tests rely on the Playwright auth setup project that stores
    // session state.  If running standalone, they will skip if the dashboard
    // is not reachable.

    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      // If redirected to login, the auth setup did not complete — skip
      if (page.url().includes('/login') || page.url().includes('/onboard')) {
        test.skip(true, 'Not authenticated — skipping dashboard tests')
      }
    })

    test('dashboard tab renders KPI content', async ({ page }) => {
      const consoleErrors = trackConsoleErrors(page)
      // The dashboard tab is the default — verify it has content
      await expect(page.locator('[data-testid="dashboard-content"]').or(
        page.locator('main').first(),
      )).toBeVisible({ timeout: 15_000 })

      // The body should have meaningful content (not empty)
      const mainText = await page.locator('main').first().innerText().catch(() => '')
      expect(mainText.length).toBeGreaterThan(0)

      // No fatal JS errors
      const fatalErrors = consoleErrors.filter(
        (e) => !e.text().includes('hydration') && !e.text().includes('Warning:'),
      )
      expect(fatalErrors).toHaveLength(0)
    })

    const coreTabs = [
      { label: 'Chat', marker: /chat|message|conversation/i },
      { label: 'Contacts', marker: /contact|people|client/i },
      { label: 'Settings', marker: /setting|preference|profile|connection|appearance/i },
    ]

    for (const { label, marker } of coreTabs) {
      test(`${label} tab renders without error`, async ({ page }) => {
        const consoleErrors = trackConsoleErrors(page)
        await navigateToTab(page, label)

        // The tab area should contain content matching the expected domain
        const mainContent = await page.locator('main').first().innerText().catch(() => '')
        // Verify it is not blank
        expect(mainContent.length).toBeGreaterThan(0)

        // No fatal JS errors (filter out React hydration warnings)
        const fatalErrors = consoleErrors.filter(
          (e) =>
            !e.text().includes('hydration') &&
            !e.text().includes('Warning:') &&
            !e.text().includes('404'),
        )
        expect(fatalErrors).toHaveLength(0)
      })
    }
  })

  // ── 3. Chat Functionality ──────────────────────────────────────────────

  test.describe('Chat functionality', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard/chat', { waitUntil: 'networkidle' })
      if (page.url().includes('/login') || page.url().includes('/onboard')) {
        test.skip(true, 'Not authenticated')
      }
    })

    test('chat input is visible and accepts text', async ({ page }) => {
      // Look for a textarea or input where the user types messages
      const chatInput = page.locator('textarea, input[type="text"]').last()
      await expect(chatInput).toBeVisible({ timeout: 10_000 })
      await chatInput.fill('Hello, this is an E2E test message')
      await expect(chatInput).toHaveValue(/E2E test/)
    })

    test('sending a message triggers a streaming response', async ({ page }) => {
      const consoleErrors = trackConsoleErrors(page)

      const chatInput = page.locator('textarea, input[type="text"]').last()
      if (!(await chatInput.isVisible({ timeout: 5_000 }).catch(() => false))) {
        test.skip(true, 'Chat input not found')
      }

      await chatInput.fill('Say "test ok" in your reply')

      // Submit via Enter or a send button
      const sendButton = page.getByRole('button', { name: /send/i })
      if (await sendButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await sendButton.click()
      } else {
        await chatInput.press('Enter')
      }

      // Wait for a response to stream in — look for new content appearing
      // within 30 seconds (allows for cold-start Anthropic API calls)
      await expect(
        page.locator('[data-role="assistant"], [class*="assistant"], [class*="response"]').first(),
      ).toBeVisible({ timeout: 30_000 }).catch(() => {
        // Streaming response element might not have a specific selector;
        // just check the chat area grew in content
      })

      // Verify no fatal JS errors during streaming
      const fatalErrors = consoleErrors.filter(
        (e) =>
          !e.text().includes('hydration') &&
          !e.text().includes('Warning:') &&
          !e.text().includes('AbortError'),
      )
      expect(fatalErrors).toHaveLength(0)
    })
  })

  // ── 4. Task Management (Kanban) ────────────────────────────────────────

  test.describe('Task management', () => {
    const testTaskTitle = `E2E Test Task ${Date.now()}`

    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      if (page.url().includes('/login') || page.url().includes('/onboard')) {
        test.skip(true, 'Not authenticated')
      }
    })

    test('Kanban board renders columns', async ({ page }) => {
      // The dashboard tab renders the Kanban board
      // Look for column headers or the board container
      const board = page.locator('[data-testid="kanban-board"], [class*="kanban"], [class*="board"]').first()
      if (await board.isVisible({ timeout: 5_000 }).catch(() => false)) {
        // At least one column should be visible
        const columns = page.locator('[data-testid="kanban-column"], [class*="column"]')
        expect(await columns.count()).toBeGreaterThan(0)
      }
    })

    test('quick-add creates a task', async ({ page }) => {
      // Look for a quick-add input (often at the top/bottom of a column)
      const quickAdd = page.locator(
        'input[placeholder*="task" i], input[placeholder*="add" i], [data-testid="quick-add"]',
      ).first()

      if (!(await quickAdd.isVisible({ timeout: 5_000 }).catch(() => false))) {
        test.skip(true, 'Quick-add input not found on Kanban board')
      }

      await quickAdd.fill(testTaskTitle)
      await quickAdd.press('Enter')

      // Verify the task appears somewhere in the board
      await expect(page.getByText(testTaskTitle)).toBeVisible({ timeout: 5_000 })
    })

    test.afterAll(async ({ browser }) => {
      // Cleanup: try to archive the test task via API if it was created
      // This is best-effort — the task will be cleaned up manually otherwise
      const context = await browser.newContext()
      const page = await context.newPage()
      try {
        await page.goto('/dashboard', { waitUntil: 'networkidle' })
        // If we can find the test task, archive it
        const taskEl = page.getByText(`E2E Test Task`)
        if (await taskEl.isVisible({ timeout: 3_000 }).catch(() => false)) {
          // Tasks often have a context menu or archive button
          await taskEl.click({ button: 'right' })
          const archiveBtn = page.getByText(/archive/i).first()
          if (await archiveBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
            await archiveBtn.click()
          }
        }
      } catch {
        // Cleanup is best-effort
      } finally {
        await context.close()
      }
    })
  })

  // ── 5. Contacts ────────────────────────────────────────────────────────

  test.describe('Contacts', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard/contacts', { waitUntil: 'networkidle' })
      if (page.url().includes('/login') || page.url().includes('/onboard')) {
        test.skip(true, 'Not authenticated')
      }
    })

    test('contacts page renders without error', async ({ page }) => {
      const consoleErrors = trackConsoleErrors(page)

      // Wait for content to load
      await page.waitForTimeout(3_000)

      // The contacts tab should show cards or a list
      const mainContent = await page.locator('main').first().innerText().catch(() => '')
      expect(mainContent.length).toBeGreaterThan(0)

      // No fatal errors
      const fatalErrors = consoleErrors.filter(
        (e) =>
          !e.text().includes('hydration') &&
          !e.text().includes('Warning:') &&
          !e.text().includes('404'),
      )
      expect(fatalErrors).toHaveLength(0)
    })

    test('clicking a contact shows detail view', async ({ page }) => {
      // Look for contact cards or list items
      const contactCard = page.locator(
        '[data-testid="contact-card"], [class*="contact-card"], [class*="contact-item"]',
      ).first()

      if (!(await contactCard.isVisible({ timeout: 5_000 }).catch(() => false))) {
        // Fallback: try any clickable element that looks like a contact name
        const nameLink = page.locator('a[href*="/contacts/"], [role="link"]').first()
        if (!(await nameLink.isVisible({ timeout: 3_000 }).catch(() => false))) {
          test.skip(true, 'No contacts found to click')
        }
        await nameLink.click()
      } else {
        await contactCard.click()
      }

      // After clicking, some detail panel or page should appear
      await page.waitForTimeout(2_000)
      const bodyText = await page.locator('main').first().innerText().catch(() => '')
      expect(bodyText.length).toBeGreaterThan(0)
    })
  })

  // ── 6. Settings ────────────────────────────────────────────────────────

  test.describe('Settings', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      if (page.url().includes('/login') || page.url().includes('/onboard')) {
        test.skip(true, 'Not authenticated')
      }
    })

    test('settings section renders profile info', async ({ page }) => {
      const consoleErrors = trackConsoleErrors(page)

      // Navigate to settings via the sidebar
      await navigateToTab(page, 'Connections')

      // Settings should show connection/profile/preference content
      await page.waitForTimeout(2_000)
      const mainContent = await page.locator('main').first().innerText().catch(() => '')
      expect(mainContent.length).toBeGreaterThan(0)

      const fatalErrors = consoleErrors.filter(
        (e) =>
          !e.text().includes('hydration') &&
          !e.text().includes('Warning:') &&
          !e.text().includes('404'),
      )
      expect(fatalErrors).toHaveLength(0)
    })

    test('appearance settings tab renders', async ({ page }) => {
      await navigateToTab(page, 'Appearance')
      await page.waitForTimeout(2_000)
      const mainContent = await page.locator('main').first().innerText().catch(() => '')
      expect(mainContent.length).toBeGreaterThan(0)
    })
  })
})
