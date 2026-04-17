import { test, expect } from '@playwright/test'

/**
 * 0→1 funnel E2E — landing → signup → checkout → onboard
 *
 * The full 0→1 journey for a brand-new visitor. This test suite does not
 * require authentication — it validates the *shape* of the public funnel:
 * copy promises match business reality, routes are wired end-to-end, and
 * the signup page honours tier context from pricing.
 *
 * Per currents-dev/playwright-best-practices:
 *   - Role-based selectors (getByRole) over CSS selectors
 *   - Deterministic waits with `expect(...).toBeVisible({ timeout })`
 *   - Cookie isolation per test (unauthed context)
 *   - No reliance on external services (Supabase/Stripe mocked where needed)
 */

test.describe('0→1 funnel (public, unauthed)', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
  })

  test('landing page hero CTA routes to /signup', async ({ page }) => {
    await page.goto('/')

    const startTrial = page.getByRole('link', { name: /^Start Trial$/i }).first()
    await expect(startTrial).toBeVisible({ timeout: 10_000 })
    await expect(startTrial).toHaveAttribute('href', '/signup')
  })

  test('landing page does NOT promise "free" or "no credit card"', async ({ page }) => {
    await page.goto('/')

    // These promises contradict the "no free tier, discount-code trials"
    // business model. If they reappear we want a loud test failure.
    await expect(page.getByText(/no credit card required/i)).toHaveCount(0)
    await expect(page.getByText(/start free trial/i)).toHaveCount(0)
    await expect(page.getByText(/get started free/i)).toHaveCount(0)
  })

  test('pricing → tier CTA flows to /signup?tier=<x> for unauthed users', async ({ page }) => {
    await page.goto('/pricing')

    // Growth is the highlighted "Most Popular" tier. Clicking it should
    // land an unauthed user on /signup?tier=growth (via the 401 handler).
    const growthCard = page.locator('div', { hasText: 'Most Popular' }).first()
    await expect(growthCard).toBeVisible({ timeout: 5_000 })

    await growthCard.getByRole('button', { name: /Start Trial/i }).click()

    await page.waitForURL(/\/signup\?tier=growth/, { timeout: 10_000 })
    expect(page.url()).toContain('/signup?tier=growth')
  })

  test('signup page renders email + password + OAuth buttons', async ({ page }) => {
    await page.goto('/signup')

    await expect(page.getByRole('heading', { name: /create your account/i })).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /apple/i })).toBeVisible()

    // "Log in" deep-link for returning users preserves empty tier context.
    const loginLink = page.getByRole('link', { name: /log in/i })
    await expect(loginLink).toHaveAttribute('href', '/login')
  })

  test('signup with ?tier=growth shows tier-aware CTA and pricing', async ({ page }) => {
    await page.goto('/signup?tier=growth')

    await expect(page.getByText(/Growth \(\$349\/mo\)/i)).toBeVisible({ timeout: 10_000 })
    await expect(
      page.getByRole('button', { name: /create account & continue to checkout/i }),
    ).toBeVisible()

    // "Log in" link carries the tier forward so returning users complete the
    // pricing → checkout round-trip after authenticating.
    const loginLink = page.getByRole('link', { name: /log in/i })
    const href = await loginLink.getAttribute('href')
    expect(href).toContain('/login?returnTo=')
    expect(decodeURIComponent(href ?? '')).toContain('/signup?tier=growth')
  })

  test('retired /waitlist redirects to /signup (preserving invite code)', async ({ page }) => {
    // Waitlist was retired 2026-04-16 in favour of open signup. Old URLs in
    // emails / Twitter / etc. must still land somewhere useful.
    await page.goto('/waitlist?invite=TESTCODE')
    await page.waitForURL(/\/signup/, { timeout: 10_000 })
    expect(page.url()).toContain('/signup')
    expect(page.url()).toContain('code=TESTCODE')
    // The code is surfaced as a visible reminder so users know to paste it
    // into Stripe's promotion-code field at checkout — not just round-tripped
    // through the URL.
    await expect(page.getByText(/TESTCODE/)).toBeVisible({ timeout: 5_000 })
  })

  test('waitlist preserves ?email= across the redirect for prefill', async ({ page }) => {
    await page.goto('/waitlist?invite=TESTCODE&email=returning%40example.com')
    await page.waitForURL(/\/signup/, { timeout: 10_000 })
    expect(page.url()).toContain('email=returning%40example.com')
    const emailInput = page.locator('input[type="email"]')
    await expect(emailInput).toHaveValue('returning@example.com', { timeout: 5_000 })
  })

  test('password-too-short error surfaces before network call', async ({ page }) => {
    await page.goto('/signup')

    await page.locator('input[type="email"]').fill('new.user@example.com')
    await page.locator('input[type="password"]').fill('short')

    // Submit button stays disabled for <8 char passwords — avoids a round
    // trip to Supabase for a rule we can enforce client-side.
    const submit = page.getByRole('button', { name: /create account/i }).first()
    await expect(submit).toBeDisabled()
  })

  test('login page "Sign up" link routes to /signup (not dead-end /onboard)', async ({ page }) => {
    await page.goto('/login')

    const signUp = page.getByRole('link', { name: /^sign up$/i })
    await expect(signUp).toBeVisible({ timeout: 10_000 })
    await expect(signUp).toHaveAttribute('href', '/signup')
  })
})
