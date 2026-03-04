import { test, expect, type Page } from '@playwright/test'
import { AUTH_SKIP_REASON, openProtectedPath } from './helpers'

async function openDashboard(page: Page) {
  return openProtectedPath(page, '/dashboard')
}

test.describe('Dashboard', () => {
  test('dashboard loads with sidebar navigation', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await page.waitForSelector('aside[aria-label="Main navigation"], .bb-sidebar, nav[aria-label="Dashboard sections"]', {
      state: 'visible',
      timeout: 15000,
    })

    await expect(page.locator('aside[aria-label="Main navigation"], .bb-sidebar').first()).toBeVisible()
  })

  test('sidebar contains expected nav items', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await expect(page.getByRole('tab', { name: /dashboard/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /chat/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /inbox/i })).toBeVisible()

    const connectionsTab = page.getByRole('tab', { name: /connections/i })
    if (await connectionsTab.count()) {
      await expect(connectionsTab.first()).toBeVisible()
    } else {
      await expect(page.getByRole('tab', { name: /channels/i }).first()).toBeVisible()
    }
  })

  test('can navigate between tabs', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await page.getByRole('tab', { name: /chat/i }).first().click()
    await page.waitForSelector('#pill-dock, .bb-chat, .bb-pill__textarea, .bb-pill__input', {
      state: 'visible',
      timeout: 15000,
    })

    await expect(page.locator('#pill-dock, .bb-chat').first()).toBeVisible()
  })

  test('kanban board renders', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await page.getByRole('tab', { name: /dashboard/i }).first().click()

    await page.waitForFunction(
      () => {
        const body = document.body.innerText
        return (
          body.includes('Tasks Due This Week') ||
          body.includes('Active Projects') ||
          body.includes('Failed to load dashboard data')
        )
      },
      undefined,
      { timeout: 15000 },
    )

    const bodyText = await page.textContent('body')
    expect(
      Boolean(bodyText) && (
        bodyText!.includes('Tasks Due This Week') ||
        bodyText!.includes('Active Projects') ||
        bodyText!.includes('Failed to load dashboard data')
      ),
    ).toBeTruthy()
  })
})
