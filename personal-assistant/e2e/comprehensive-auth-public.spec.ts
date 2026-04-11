import { test, expect, type Page } from '@playwright/test'
import { AUTH_SKIP_REASON, ensureAuthenticated } from './helpers'

/**
 * Comprehensive E2E tests for authentication flows and public pages.
 * Covers: login page UI, session redirects, public pages, error handling.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function openDevPasswordLogin(page: Page) {
  const devToggle = page.getByRole('button', { name: /dev:\s*password login/i })
  if (await devToggle.count()) {
    await devToggle.first().click()
    await page
      .locator('input[type="password"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5_000 })
      .catch(() => {})
  }
}

function collectJsErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => {
    if (err.message.includes('Hydration')) return
    errors.push(err.message)
  })
  return errors
}

function filterCriticalErrors(errors: string[]): string[] {
  return errors.filter(
    (e) =>
      !e.includes('401') &&
      !e.includes('400') &&
      !e.includes('Failed to fetch') &&
      !e.includes('NetworkError') &&
      !e.includes('React Client Manifest'),
  )
}

// ---------------------------------------------------------------------------
// 1. Login Page
// ---------------------------------------------------------------------------

test.describe('Login Page', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('renders with email input, submit button, and OAuth providers', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')

    // Wait for form to appear
    await page.waitForSelector('form', { state: 'visible', timeout: 15_000 })

    // Email input
    await expect(page.locator('input[type="email"]').first()).toBeVisible()

    // Submit button ("Send sign-in link")
    await expect(
      page.locator('button[type="submit"]').first(),
    ).toBeVisible()

    // OAuth provider buttons
    await expect(
      page.getByRole('button', { name: /continue with google/i }).first(),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /continue with apple/i }).first(),
    ).toBeVisible()
  })

  test('dev password login toggle reveals password fields', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('form', { state: 'visible', timeout: 15_000 })

    // In dev mode, the toggle should exist
    const devToggle = page.getByRole('button', { name: /dev:\s*password login/i })
    const hasDevToggle = (await devToggle.count()) > 0

    if (!hasDevToggle) {
      test.skip(true, 'Dev password toggle not present (non-dev environment)')
      return
    }

    // Password input should not be visible before toggle
    const passwordBefore = page.locator('input[type="password"]:visible')
    expect(await passwordBefore.count()).toBe(0)

    // Click toggle
    await devToggle.first().click()

    // Now password input should be visible
    const passwordAfter = page.locator('input[type="password"]:visible').first()
    await passwordAfter.waitFor({ state: 'visible', timeout: 5_000 })
    await expect(passwordAfter).toBeVisible()

    // "Sign in with password" button should appear
    await expect(
      page.locator('button:has-text("Sign in with password")').first(),
    ).toBeVisible()
  })

  test('shows error on invalid credentials via dev password login', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('form', { state: 'visible', timeout: 15_000 })

    await openDevPasswordLogin(page)
    const passwordInput = page.locator('input[type="password"]:visible').first()
    const hasPasswordLogin = (await passwordInput.count()) > 0

    if (!hasPasswordLogin) {
      test.skip(true, 'Dev password login not available')
      return
    }

    // Fill in bad credentials
    await page.locator('input[type="email"]:visible').last().fill('invalid@example.com')
    await passwordInput.fill('wrong-password-123')
    await page.locator('button:has-text("Sign in with password"):visible').first().click()

    // Should show an error
    const errorMessage = page
      .locator(
        '.bb-auth-card__error, [role="alert"], p:has-text("invalid"), p:has-text("error"), p:has-text("Invalid")',
      )
      .first()
    await errorMessage.waitFor({ state: 'visible', timeout: 15_000 })
    await expect(errorMessage).toBeVisible()
  })

  test('empty email submission is prevented by HTML validation', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('form', { state: 'visible', timeout: 15_000 })

    const emailInput = page.locator('input[type="email"]').first()
    await expect(emailInput).toBeVisible()

    // The email input has required attribute — submit button should be disabled
    // when email is too short (canSubmit = email.trim().length > 3 && !isBusy)
    const submitBtn = page.locator('button[type="submit"]').first()
    await expect(submitBtn).toBeDisabled()

    // Type a short email (< 4 chars)
    await emailInput.fill('ab')
    await expect(submitBtn).toBeDisabled()

    // Type a valid-length email — button should enable
    await emailInput.fill('test@example.com')
    await expect(submitBtn).toBeEnabled()
  })

  test('successful login redirects to dashboard', async ({ page }) => {
    const authenticated = await ensureAuthenticated(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const currentPath = new URL(page.url()).pathname
    expect(currentPath).toMatch(/^\/dashboard/)
  })
})

// ---------------------------------------------------------------------------
// 2. Session & Redirects
// ---------------------------------------------------------------------------

test.describe('Session & Redirects', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('unauthenticated user hitting /dashboard gets redirected to /login', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')

    await page.waitForURL(
      (url) => url.pathname.startsWith('/login') || url.pathname.startsWith('/auth'),
      { timeout: 15_000 },
    )

    const currentPath = new URL(page.url()).pathname
    expect(
      currentPath.startsWith('/login') || currentPath.startsWith('/auth'),
    ).toBeTruthy()
  })

  test('unauthenticated user hitting /dashboard/chat gets redirected to /login', async ({ page }) => {
    await page.goto('/dashboard/chat')
    await page.waitForLoadState('domcontentloaded')

    await page.waitForURL(
      (url) => url.pathname.startsWith('/login') || url.pathname.startsWith('/auth'),
      { timeout: 15_000 },
    )

    const currentPath = new URL(page.url()).pathname
    expect(
      currentPath.startsWith('/login') || currentPath.startsWith('/auth'),
    ).toBeTruthy()
  })

  test('after login, user lands on dashboard (not stuck on login)', async ({ page }) => {
    const authenticated = await ensureAuthenticated(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const currentPath = new URL(page.url()).pathname
    expect(currentPath).not.toMatch(/^\/(login|auth)/)
    expect(currentPath).toMatch(/^\/dashboard/)
  })
})

// ---------------------------------------------------------------------------
// 3. Public Pages (no auth required)
// ---------------------------------------------------------------------------

test.describe('Public Pages', () => {
  // Use clean state — no auth cookies — to prove these pages are public
  test.use({ storageState: { cookies: [], origins: [] } })

  const publicPages = [
    { path: '/pricing', name: 'Pricing' },
    { path: '/terms', name: 'Terms' },
    { path: '/privacy', name: 'Privacy' },
    { path: '/demo', name: 'Demo' },
    { path: '/showcase', name: 'Showcase' },
  ]

  for (const { path, name } of publicPages) {
    test(`${name} (${path}) renders without JS errors and has content`, async ({ page }) => {
      const jsErrors = collectJsErrors(page)

      const response = await page.goto(path, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('domcontentloaded')

      // Page should load (200 or 304), not redirect to login
      const status = response?.status() ?? 0
      expect(status).toBeLessThan(400)

      const finalPath = new URL(page.url()).pathname
      // Public page should NOT redirect to login
      expect(finalPath.startsWith('/login')).toBeFalsy()

      // Should have meaningful content
      const bodyText = await page.textContent('body')
      expect((bodyText ?? '').length).toBeGreaterThan(50)

      // No critical JS errors
      const criticalErrors = filterCriticalErrors(jsErrors)
      const renderBreaking = criticalErrors.filter(
        (e) =>
          e.includes('is not a function') ||
          e.includes('Cannot read properties') ||
          e.includes('is not defined'),
      )
      expect(renderBreaking).toEqual([])
    })
  }

  test('Landing page (/) redirects to /login for unauthenticated users', async ({ page }) => {
    const jsErrors = collectJsErrors(page)

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('domcontentloaded')

    // Landing page redirects to login (app has no public landing page)
    const finalPath = new URL(page.url()).pathname
    expect(
      finalPath.startsWith('/login') || finalPath === '/',
    ).toBeTruthy()

    // Whatever page we land on should have content and no JS errors
    const bodyText = await page.textContent('body')
    expect((bodyText ?? '').length).toBeGreaterThan(50)

    const criticalErrors = filterCriticalErrors(jsErrors)
    const renderBreaking = criticalErrors.filter(
      (e) =>
        e.includes('is not a function') ||
        e.includes('Cannot read properties') ||
        e.includes('is not defined'),
    )
    expect(renderBreaking).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// 4. Error Handling
// ---------------------------------------------------------------------------

test.describe('Error Handling', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('navigating to /nonexistent-page shows 404 or redirects gracefully', async ({ page }) => {
    const response = await page.goto('/nonexistent-page-xyz-12345', {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForLoadState('domcontentloaded')

    const status = response?.status() ?? 0
    const currentPath = new URL(page.url()).pathname

    // Either a 404 page or a graceful redirect (login, home, etc.)
    const is404 = status === 404
    const isRedirected =
      currentPath === '/' ||
      currentPath.startsWith('/login') ||
      currentPath.startsWith('/auth')
    const hasNotFoundText = await page
      .locator('text=/not found|404|page.*not.*found/i')
      .count()
      .then((c) => c > 0)
      .catch(() => false)

    expect(is404 || isRedirected || hasNotFoundText).toBeTruthy()
  })

  test('navigating to /dashboard/nonexistent redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/dashboard/nonexistent-sub-route-xyz', {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForLoadState('domcontentloaded')

    // Since user is not authenticated, middleware should redirect to login
    await page.waitForURL(
      (url) =>
        url.pathname.startsWith('/login') ||
        url.pathname.startsWith('/auth') ||
        url.pathname === '/',
      { timeout: 15_000 },
    )

    const currentPath = new URL(page.url()).pathname
    expect(
      currentPath.startsWith('/login') ||
        currentPath.startsWith('/auth') ||
        currentPath === '/',
    ).toBeTruthy()
  })
})
