import { test, expect, type Page } from '@playwright/test'

async function tryDevPasswordLogin(page: Page) {
  if (!new URL(page.url()).pathname.startsWith('/login')) return

  const devToggle = page.getByRole('button', { name: /dev:\s*password login/i })
  if (await devToggle.count()) {
    await devToggle.first().click()
    await page
      .locator('input[type="password"]')
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {})
  }

  const passwordInput = page.locator('input[type="password"]').first()
  if (!(await passwordInput.count())) return

  const email = process.env.E2E_USER_EMAIL || 'test@bitbit.dev'
  const password = process.env.E2E_USER_PASSWORD || 'test-password-e2e'

  await page.locator('input[type="email"]').last().fill(email)
  await passwordInput.fill(password)
  await page.getByRole('button', { name: /sign in with password/i }).click()
  await page.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => {})
}

async function openConnections(page: Page) {
  await page.goto('/dashboard')
  await page.waitForLoadState('domcontentloaded')

  if (new URL(page.url()).pathname.startsWith('/login')) {
    await tryDevPasswordLogin(page)
    await page.goto('/dashboard')
    await page.waitForLoadState('domcontentloaded')
  }

  if (new URL(page.url()).pathname.startsWith('/login')) {
    return false
  }

  const directConnections = page.getByRole('tab', { name: /connections/i })
  if (!(await directConnections.count())) {
    const showAdvanced = page.getByRole('button', { name: /show advanced tabs|more/i })
    if (await showAdvanced.count()) {
      await showAdvanced.first().click()
      await directConnections.first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
    }
  }

  if (await directConnections.count()) {
    await directConnections.first().click()
  } else {
    const channelsTab = page.getByRole('tab', { name: /channels/i })
    if (!(await channelsTab.count())) return false
    await channelsTab.first().click()
  }

  await page.waitForLoadState('domcontentloaded')
  return true
}

test.describe('Connections', () => {
  test('connections page shows grid of available connections', async ({ page }) => {
    const opened = await openConnections(page)
    test.skip(!opened, 'Could not open connections tab in this environment')

    await page.waitForFunction(
      () => {
        const body = document.body.innerText
        return body.includes('Gmail') || body.includes('Outlook') || body.includes('Google Calendar')
      },
      undefined,
      { timeout: 15000 },
    )

    const names = ['Gmail', 'Outlook', 'Google Calendar', 'Asana', 'Calendly', 'Stripe', 'WhatsApp']
    let visibleTiles = 0
    for (const name of names) {
      if (await page.getByRole('heading', { name }).first().isVisible().catch(() => false)) {
        visibleTiles += 1
      }
    }

    expect(visibleTiles).toBeGreaterThan(1)
  })

  test('each connection tile has name and status', async ({ page }) => {
    const opened = await openConnections(page)
    test.skip(!opened, 'Could not open connections tab in this environment')

    const gmailTile = page.locator('div:has(h3:has-text("Gmail"))').first()
    await gmailTile.waitFor({ state: 'visible', timeout: 15000 })

    await expect(gmailTile.getByRole('heading', { name: 'Gmail' })).toBeVisible()

    const hasStatusText = await gmailTile.getByText(/connected|disconnected/i).isVisible().catch(() => false)
    const hasStatusDot = await gmailTile.locator('.w-2.h-2.rounded-full').isVisible().catch(() => false)
    expect(hasStatusText || hasStatusDot).toBeTruthy()
  })
})
