import { test, expect, type Page } from '@playwright/test'
import { AUTH_SKIP_REASON, openProtectedPath } from './helpers'

async function openChat(page: Page) {
  return openProtectedPath(page, '/dashboard/chat')
}

function chatInputLocator(page: Page) {
  return page.locator('.bb-pill__textarea, .bb-pill__input, textarea[placeholder*="Message"], input[placeholder*="Ask BitBit"]')
}

test.describe('Chat', () => {
  test('chat interface has input field', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await chatInputLocator(page).first().waitFor({ state: 'visible', timeout: 15000 })
    await expect(chatInputLocator(page).first()).toBeVisible()
  })

  test('can type a message', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const input = chatInputLocator(page).first()
    await input.waitFor({ state: 'visible', timeout: 15000 })
    await input.fill('Hello from Playwright')
    await expect(input).toHaveValue('Hello from Playwright')
  })

  test('send button exists', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await page.waitForSelector('button[aria-label="Send"], button[aria-label="Send message"]', {
      state: 'visible',
      timeout: 15000,
    })

    await expect(page.locator('button[aria-label="Send"], button[aria-label="Send message"]').first()).toBeVisible()
  })
})
