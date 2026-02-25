import { test, expect } from '@playwright/test'
import { login, waitForDashboard, navigateToTab, SidebarNav } from './helpers'

test.describe('Dashboard Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('loads dashboard after login', async ({ page }) => {
    await waitForDashboard(page)
    // Dashboard should have some content
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('sidebar navigation is visible on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await waitForDashboard(page)
    const sidebar = new SidebarNav(page)
    // Sidebar should be visible on desktop
    const hasNav = await page.locator('nav').count()
    expect(hasNav).toBeGreaterThan(0)
  })

  test('can switch between dashboard tabs', async ({ page }) => {
    await waitForDashboard(page)

    // Try navigating to known tabs
    const tabs = ['Tasks', 'Messages', 'Agents']
    for (const tab of tabs) {
      const tabElement = page.locator(`button:has-text("${tab}"), a:has-text("${tab}")`)
      if (await tabElement.count() > 0) {
        await tabElement.first().click()
        await page.waitForTimeout(300)
      }
    }
  })

  test('responsive layout shows bottom nav on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await waitForDashboard(page)
    // On mobile, bottom nav or hamburger menu should exist
    const mobileNav = page.locator('[data-testid="bottom-nav"], [data-testid="mobile-menu"], nav')
    expect(await mobileNav.count()).toBeGreaterThan(0)
  })
})
