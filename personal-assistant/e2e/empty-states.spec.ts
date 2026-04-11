import { test, expect, type Page } from '@playwright/test'
import { AUTH_SKIP_REASON, openProtectedPath } from './helpers'

// Don't depend on persisted storageState file from setup
test.use({ storageState: { cookies: [], origins: [] } })

/**
 * Navigate to a tab using bb-navigate custom event + sessionStorage fallback.
 */
async function goToTab(page: Page, tabId: string) {
  await page.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: id } }))
  }, tabId)

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
 * Find a visible empty state within the currently active tab panel.
 * Multiple panels exist in the DOM but only the active one is visible.
 */
function visibleEmptyState(page: Page) {
  return page.locator('[data-testid="empty-state"]:visible').first()
}

/**
 * Smoke test: verifies that dashboard tabs render contextual empty state
 * components when no data exists, instead of showing blank screens.
 *
 * Uses API route mocking to guarantee empty data responses.
 */
test.describe('empty state rendering', () => {
  test('approvals tab shows positive empty state when no approvals pending', async ({ page }) => {
    // Mock approval queue API to return empty
    await page.route('**/api/agent/approvals', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ approvals: [] }),
        })
      } else {
        await route.continue()
      }
    })

    const authenticated = await openProtectedPath(page, '/dashboard')
    if (!authenticated) {
      test.skip(true, AUTH_SKIP_REASON)
      return
    }

    await page.waitForTimeout(1_000)
    await goToTab(page, 'approvals')

    const emptyState = visibleEmptyState(page)
    await expect(emptyState).toBeVisible({ timeout: 10_000 })

    const text = await emptyState.textContent()
    expect(text).toContain('Nothing needs approval')
  })

  test('jobs tab shows contextual empty state when no jobs exist', async ({ page }) => {
    // Mock Supabase REST for jobs to return empty
    await page.route('**/rest/v1/jobs**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
        headers: { 'content-range': '*/0' },
      })
    })

    const authenticated = await openProtectedPath(page, '/dashboard')
    if (!authenticated) {
      test.skip(true, AUTH_SKIP_REASON)
      return
    }

    await page.waitForTimeout(1_000)
    await goToTab(page, 'jobs')

    const emptyState = visibleEmptyState(page)
    await expect(emptyState).toBeVisible({ timeout: 10_000 })

    const text = await emptyState.textContent()
    expect(text).toContain('No active jobs')
    expect(text).toContain('ongoing work')

    // Should have a CTA button
    const actionBtn = emptyState.locator('button')
    await expect(actionBtn).toBeVisible()
  })

  test('contacts tab shows empty state with connect action', async ({ page }) => {
    // Mock contacts API to return empty
    await page.route('**/api/contacts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ contacts: [] }),
      })
    })

    const authenticated = await openProtectedPath(page, '/dashboard')
    if (!authenticated) {
      test.skip(true, AUTH_SKIP_REASON)
      return
    }

    await page.waitForTimeout(1_000)
    await goToTab(page, 'contacts')

    const emptyState = visibleEmptyState(page)
    await expect(emptyState).toBeVisible({ timeout: 10_000 })

    const text = await emptyState.textContent()
    expect(text).toContain('No contacts yet')
    expect(text).toContain('Connect your email')
  })
})
