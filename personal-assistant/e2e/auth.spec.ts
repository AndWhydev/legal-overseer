import { test, expect, type Page } from '@playwright/test'

async function openDevPasswordLogin(page: Page) {
  const devToggle = page.getByRole('button', { name: /dev:\s*password login/i })
  if (await devToggle.count()) {
    await devToggle.first().click()
    await page
      .locator('input[type="password"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {})
  }
}

test.describe('Authentication', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
  })

  test('redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')

    await page.waitForURL(
      (url) => url.pathname.startsWith('/login') || url.pathname.startsWith('/auth'),
      { timeout: 15000 },
    )

    const currentPath = new URL(page.url()).pathname
    expect(currentPath.startsWith('/login') || currentPath.startsWith('/auth')).toBeTruthy()
  })

  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('form', { state: 'visible' })

    await openDevPasswordLogin(page)

    await expect(page.locator('input[type="email"]').first()).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
    await expect(page.locator('button[type="submit"]').first()).toBeVisible()
  })

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('form', { state: 'visible' })

    await openDevPasswordLogin(page)

    const passwordInput = page.locator('input[type="password"]').first()
    const hasPasswordLogin = (await passwordInput.count()) > 0

    if (hasPasswordLogin) {
      await page.locator('input[type="email"]').last().fill('invalid.user@example.com')
      await passwordInput.fill('wrong-password')
      await page.getByRole('button', { name: /sign in with password/i }).click()
    } else {
      await page.locator('input[type="email"]').first().fill('invalid.user@example.com')
      await page.getByRole('button', { name: /continue with email/i }).click()
    }

    const errorMessage = page
      .locator('.bb-auth-card__error, [role="alert"], p:has-text("invalid"), p:has-text("error"), p:has-text("failed")')
      .first()

    await errorMessage.waitFor({ state: 'visible', timeout: 15000 })
    await expect(errorMessage).toBeVisible()
  })
})
