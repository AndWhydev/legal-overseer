import { test, expect } from '@playwright/test'
import { ensureAuthenticated, AUTH_SKIP_REASON } from './helpers'

test.describe('Onboarding', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
  })

  test('guides a first-time user through the secluded onboarding flow', async ({ page }) => {
    let connectionReady = false

    await page.route('**/api/channels/status', async (route) => {
      const payload = connectionReady
        ? {
            channels: [
              {
                type: 'gmail',
                connected: true,
                connectedAt: '2026-03-08T09:00:00.000Z',
                messageCount: 3,
                lastSync: '2026-03-08T09:00:30.000Z',
              },
            ],
          }
        : { channels: [] }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      })
    })

    await page.route('**/api/channels/sync', async (route) => {
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

    const pathname = new URL(page.url()).pathname

    if (pathname === '/onboard') {
      await expect(page.getByRole('heading', { name: /meet your bitbit/i })).toBeVisible()
      await expect
        .poll(async () => {
          return page.locator('section').first().evaluate((element) => {
            const styles = getComputedStyle(element)
            return {
              paddingTop: parseFloat(styles.paddingTop),
              paddingRight: parseFloat(styles.paddingRight),
            }
          })
        })
        .toEqual({
          paddingTop: 40,
          paddingRight: 40,
        })
      await page.getByRole('button', { name: /start with bitbit/i }).click()

      const businessName = page.getByLabel(/business name/i)
      if (await businessName.isVisible().catch(() => false)) {
        await businessName.fill('BitBit Beta')
        await page.getByLabel(/your name/i).fill('Beta Tester')
        await page.getByRole('button', { name: /continue to connections/i }).click()
      }

      await expect(page.getByRole('heading', { name: /connect your world/i })).toBeVisible()

      connectionReady = true
      await page.goto('/onboard?connected=gmail', { waitUntil: 'domcontentloaded' })
      await page.getByRole('button', { name: /start with bitbit/i }).click()

      const learnButton = page.getByRole('button', { name: /let bitbit learn/i })
      await expect(learnButton).toBeEnabled()
      await learnButton.click()

      await expect(page.getByRole('heading', { name: /bitbit is taking the first pass/i })).toBeVisible()
      await expect(page.getByText(/connecting the first threads of your world/i)).toBeVisible()
      await expect(page.getByText(/shaping the first live picture of your work/i)).toBeVisible()

      await expect(page.getByRole('heading', { name: /your bitbit is awake/i })).toBeVisible({ timeout: 10_000 })
      await expect(page.getByText(/i have started with gmail/i)).toBeVisible()
      await page.getByRole('button', { name: /open my workspace/i }).click()
      await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
      return
    }

    test.skip(true, 'Authenticated E2E user is already past the first-run onboarding flow in this environment.')
  })
})
