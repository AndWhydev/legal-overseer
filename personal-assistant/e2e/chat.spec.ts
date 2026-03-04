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

async function openChat(page: Page) {
  await page.goto('/dashboard/chat')
  await page.waitForLoadState('domcontentloaded')

  if (new URL(page.url()).pathname.startsWith('/login')) {
    await tryDevPasswordLogin(page)
    await page.goto('/dashboard/chat')
    await page.waitForLoadState('domcontentloaded')
  }

  return !new URL(page.url()).pathname.startsWith('/login')
}

function chatInputLocator(page: Page) {
  return page.locator('.bb-pill__textarea, .bb-pill__input, textarea[placeholder*="Message"], input[placeholder*="Ask BitBit"]')
}

test.describe('Chat', () => {
  test('chat interface has input field', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, 'Could not authenticate to chat in this environment')

    await chatInputLocator(page).first().waitFor({ state: 'visible', timeout: 15000 })
    await expect(chatInputLocator(page).first()).toBeVisible()
  })

  test('can type a message', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, 'Could not authenticate to chat in this environment')

    const input = chatInputLocator(page).first()
    await input.waitFor({ state: 'visible', timeout: 15000 })
    await input.fill('Hello from Playwright')
    await expect(input).toHaveValue('Hello from Playwright')
  })

  test('send button exists', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, 'Could not authenticate to chat in this environment')

    await page.waitForSelector('button[aria-label="Send"], button[aria-label="Send message"]', {
      state: 'visible',
      timeout: 15000,
    })

    await expect(page.locator('button[aria-label="Send"], button[aria-label="Send message"]').first()).toBeVisible()
  })
})
