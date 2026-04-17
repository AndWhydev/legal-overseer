import { test, expect } from '@playwright/test'
import { ensureAuthenticated, AUTH_SKIP_REASON } from './helpers'

/**
 * Onboarding E2E — chat-surface-first flow (v2, 2026-04-16).
 *
 * The previous stepper wizard ("workspace → connections → sync → agents →
 * value") is retired. The current flow is a conversational OnboardingChat
 * with two user-driven stages before the AI takes over:
 *
 *   Stage 0: pick-chat-surface — where BitBit lives (iMessage/WhatsApp/
 *            Android Messages/Telegram/Web)
 *   Stage 1: pick-email         — data sources BitBit reads
 *   Stage 2-3: crawl + synthesis (backend-driven, not asserted here)
 *   Stage 4: complete           — handoff card + "Let's go" button
 *
 * These tests assert the user-visible stages and skip if auth can't be
 * established in this environment.
 */

test.describe('Onboarding (chat-surface-first)', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
  })

  async function setupMinimalMocks(page: import('@playwright/test').Page) {
    await page.route('**/api/channels/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ channels: [] }),
      })
    })
    await page.route('**/api/profile/preferences', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      } else {
        await route.continue()
      }
    })
    await page.route('**/api/analytics/event', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })
  }

  test('chat-surface picker is the first stage and lists all 5 surfaces', async ({ page }) => {
    await setupMinimalMocks(page)

    const authenticated = await ensureAuthenticated(page, '/dashboard', {
      persistOnboardingComplete: false,
      dismissOnboarding: false,
    })

    test.skip(!authenticated, AUTH_SKIP_REASON)

    const pathname = new URL(page.url()).pathname
    if (pathname !== '/onboard') {
      test.skip(true, 'User already past first-run onboarding in this environment.')
      return
    }

    // Greeting asks about chat surface, not email.
    await expect(page.getByText(/where would you like to chat/i)).toBeVisible({
      timeout: 10_000,
    })

    // All five surfaces are offered.
    for (const label of ['iMessage', 'WhatsApp', 'Android Messages', 'Telegram', 'Web app']) {
      await expect(page.getByRole('button', { name: new RegExp(label, 'i') }).first()).toBeVisible()
    }
  })

  test('selecting Web advances to data-source stage (email picker)', async ({ page }) => {
    await setupMinimalMocks(page)

    const authenticated = await ensureAuthenticated(page, '/dashboard', {
      persistOnboardingComplete: false,
      dismissOnboarding: false,
    })

    test.skip(!authenticated, AUTH_SKIP_REASON)
    if (new URL(page.url()).pathname !== '/onboard') {
      test.skip(true, 'User already past first-run onboarding in this environment.')
      return
    }

    const webButton = page.getByRole('button', { name: /web app/i }).first()
    await expect(webButton).toBeVisible({ timeout: 10_000 })
    await webButton.click()

    // Email providers should appear after surface selection.
    await expect(page.getByRole('button', { name: /gmail/i }).first()).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByRole('button', { name: /outlook/i }).first()).toBeVisible()
  })

  test('preference PATCH fires with chosen surface', async ({ page }) => {
    const patchCalls: Record<string, unknown>[] = []
    await page.route('**/api/profile/preferences', async (route) => {
      if (route.request().method() === 'PATCH') {
        patchCalls.push(route.request().postDataJSON())
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      } else {
        await route.continue()
      }
    })
    await page.route('**/api/channels/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ channels: [] }),
      })
    })
    await page.route('**/api/analytics/event', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    const authenticated = await ensureAuthenticated(page, '/dashboard', {
      persistOnboardingComplete: false,
      dismissOnboarding: false,
    })

    test.skip(!authenticated, AUTH_SKIP_REASON)
    if (new URL(page.url()).pathname !== '/onboard') {
      test.skip(true, 'User already past first-run onboarding in this environment.')
      return
    }

    await page.getByRole('button', { name: /whatsapp/i }).first().click()
    await expect(page.getByRole('button', { name: /gmail/i }).first()).toBeVisible({
      timeout: 10_000,
    })

    // Verify the preference was persisted.
    const whatsappPatch = patchCalls.find(
      (b) => (b as { primary_chat_surface?: string }).primary_chat_surface === 'whatsapp',
    )
    expect(whatsappPatch).toBeTruthy()
  })
})
