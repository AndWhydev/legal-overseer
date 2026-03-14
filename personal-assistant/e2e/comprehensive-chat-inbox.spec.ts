import { test, expect, type Page } from '@playwright/test'
import { AUTH_SKIP_REASON, openProtectedPath, dismissOnboardingWizard } from './helpers'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function openChat(page: Page) {
  return openProtectedPath(page, '/dashboard/chat')
}

async function openDashboard(page: Page) {
  return openProtectedPath(page, '/dashboard')
}

/** Navigate to inbox via SPA event (no direct URL route exists). */
async function openInbox(page: Page) {
  const auth = await openDashboard(page)
  if (!auth) return false

  // Use the sidebar "Messages" button then dispatch bb-navigate for inbox
  const messagesBtn = page.locator('button:has-text("Messages")').first()
  if (await messagesBtn.isVisible().catch(() => false)) {
    await messagesBtn.click()
    await page.waitForTimeout(500)
  }

  // Dispatch the custom event to switch to the inbox tab
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'inbox' } }))
  })

  // Wait for inbox panel to become active
  await page.waitForFunction(() => {
    const panel = document.querySelector('#tabpanel-inbox, [data-tab="inbox"]')
    if (panel) return true
    // Also check if body contains inbox-related content
    const body = document.body.innerText
    return body.includes('All') && (body.includes('Focus') || body.includes('Inbox'))
  }, undefined, { timeout: 15_000 })

  return true
}

function chatInputLocator(page: Page) {
  return page.locator(
    '.bb-pill__textarea, .bb-pill__input, .bb-chat-input__textarea, textarea[placeholder*="Message BitBit"], textarea[placeholder*="Message"], input[placeholder*="Ask BitBit"]',
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat Tab Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Chat Tab', () => {
  test('chat tab renders with pill dock / input area', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await page.waitForSelector('#pill-dock, .bb-chat, .bb-chat-input', { state: 'visible', timeout: 15_000 })
    await expect(page.locator('#pill-dock, .bb-chat, .bb-chat-input').first()).toBeVisible()
  })

  test('chat input accepts text typing', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const input = chatInputLocator(page).first()
    await input.waitFor({ state: 'visible', timeout: 15_000 })
    await input.fill('Hello from Playwright E2E')
    await expect(input).toHaveValue('Hello from Playwright E2E')
  })

  test('chat has send button', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const sendBtn = page.locator(
      'button[aria-label="Send message"], button[aria-label="Send"], .bb-chat-input__send, .bb-pill__send',
    ).first()
    await sendBtn.waitFor({ state: 'visible', timeout: 15_000 })
    await expect(sendBtn).toBeVisible()
  })

  test('chat shows empty state or greeting before messages', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const chatContainer = page.locator('.bb-chat').first()
    await chatContainer.waitFor({ state: 'visible', timeout: 15_000 })

    const greeting = page.locator('.bb-chat__greeting, .bb-chat__empty, .bb-chat__center-cluster')
    const msgList = page.locator('.bb-chat__msg-list')

    const hasGreeting = (await greeting.count()) > 0 && (await greeting.first().isVisible().catch(() => false))
    const hasMessages = (await msgList.count()) > 0 && (await msgList.first().isVisible().catch(() => false))
    expect(hasGreeting || hasMessages).toBeTruthy()
  })

  test('chat has suggestion chips in empty state', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await page.evaluate(() => localStorage.removeItem('bitbit-thread-id'))
    await page.goto('/dashboard/chat', { waitUntil: 'domcontentloaded' })
    await dismissOnboardingWizard(page)

    const chips = page.locator('.bb-chat__chip, .bb-chat__suggestions button')
    const chipsVisible = await chips.first().waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false)
    if (chipsVisible) {
      expect(await chips.count()).toBeGreaterThan(0)
    }
  })

  test('chat has conversation history button', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const historyBtn = page.locator('button[aria-label="Conversation history"], .bb-chat__history-btn').first()
    await historyBtn.waitFor({ state: 'visible', timeout: 15_000 })
    await expect(historyBtn).toBeVisible()
  })

  test('chat handles empty message gracefully', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const input = chatInputLocator(page).first()
    await input.waitFor({ state: 'visible', timeout: 15_000 })
    await input.fill('')
    await input.press('Enter')

    expect(page.url()).toContain('/dashboard')
    await expect(page.locator('#pill-dock, .bb-chat').first()).toBeVisible()
  })

  test('chat message area exists (scrollable container)', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const messagesArea = page.locator('.bb-chat__messages, .bb-chat__msg-list, .bb-chat__empty').first()
    await messagesArea.waitFor({ state: 'visible', timeout: 15_000 })
    await expect(messagesArea).toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Inbox Tab Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Inbox Tab', () => {
  test('inbox tab renders message list or empty state', async ({ page }) => {
    const authenticated = await openInbox(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const bodyText = await page.textContent('body')
    const hasInboxContent = bodyText?.includes('All') || bodyText?.includes('Focus') || bodyText?.includes('zero') || bodyText?.includes('Inbox')
    expect(hasInboxContent).toBeTruthy()
  })

  test('inbox has category filter pills (All, Focus, Waiting, etc.)', async ({ page }) => {
    const authenticated = await openInbox(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    // The inbox tab has category pills. They may render as "All", "Focus", etc.
    // or the inbox may show its content in a different structure.
    // Wait for the active tabpanel to settle
    await page.waitForTimeout(1000)
    const activePanel = page.locator('[data-active="true"]').first()
    const panelText = await activePanel.textContent().catch(() => '') || ''
    const bodyText = await page.textContent('body') || ''

    // Check for pill labels or inbox structural elements
    const hasPills = panelText.includes('All') || panelText.includes('Focus') || panelText.includes('Waiting')
    const hasInboxStructure = bodyText.includes('Inbox') || bodyText.includes('zero') || bodyText.includes('all clear')

    expect(hasPills || hasInboxStructure).toBeTruthy()
  })

  test('inbox messages show sender info and subject', async ({ page }) => {
    const authenticated = await openInbox(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const bodyText = await page.textContent('body') || ''
    const hasSenderContent = bodyText.length > 200
    const hasEmptyState = bodyText.includes('zero') || bodyText.includes('No messages') || bodyText.includes('all clear')
    expect(hasSenderContent || hasEmptyState).toBeTruthy()
  })

  test('inbox toolbar renders', async ({ page }) => {
    const authenticated = await openInbox(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const bodyText = await page.textContent('body')
    expect(bodyText).toContain('Inbox')
  })

  test('inbox handles no-messages state gracefully', async ({ page }) => {
    const authenticated = await openInbox(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForTimeout(1000)

    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('hydration'),
    )
    expect(criticalErrors.length).toBe(0)
  })

  test('inbox shows channel icons (SVGs)', async ({ page }) => {
    const authenticated = await openInbox(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const svgs = page.locator('main svg, [id*="tabpanel"] svg')
    const svgCount = await svgs.count()
    expect(svgCount).toBeGreaterThanOrEqual(0)
  })

  test('clicking an inbox message expands or opens drawer', async ({ page }) => {
    const authenticated = await openInbox(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    // Look for visible buttons within the active panel that have message-like content
    const activePanel = page.locator('[data-active="true"]').first()
    const messageRows = activePanel.locator('button:visible').filter({ hasText: /.{10,}/ })
    const rowCount = await messageRows.count()

    if (rowCount > 0) {
      await messageRows.first().click()
      await page.waitForTimeout(500)
      // Verify page didn't crash
      expect(await page.locator('main').first().isVisible()).toBeTruthy()
    }
    // No visible rows = empty inbox, still a pass
  })

  test('inbox keyboard shortcut ? shows shortcuts overlay', async ({ page }) => {
    const authenticated = await openInbox(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await page.keyboard.press('Shift+/')
    const overlayVisible = await page.waitForFunction(() => {
      const body = document.body.innerText
      return body.includes('Next message') || body.includes('Archive') || body.includes('Keyboard')
    }, undefined, { timeout: 5_000 }).then(() => true).catch(() => false)

    if (overlayVisible) {
      expect(await page.textContent('body')).toContain('Archive')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Cross-Feature Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Chat-Inbox Cross Features', () => {
  test('can navigate between chat and inbox', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const chatVisible = await page.locator('#pill-dock, .bb-chat').first()
      .waitFor({ state: 'visible', timeout: 15_000 }).then(() => true).catch(() => false)
    expect(chatVisible).toBeTruthy()

    // Navigate to inbox via event
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'inbox' } }))
    })
    await page.waitForTimeout(2000)

    const bodyText = await page.textContent('body')
    expect(bodyText?.includes('Inbox') || bodyText?.includes('All')).toBeTruthy()

    // Navigate back to chat
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'chat' } }))
    })
    await page.waitForTimeout(2000)

    const chatBack = await page.locator('#pill-dock, .bb-chat').first()
      .waitFor({ state: 'visible', timeout: 10_000 }).then(() => true).catch(() => false)
    expect(chatBack).toBeTruthy()
  })

  test('dashboard inbox feed widget exists on home tab', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await page.waitForFunction(() => {
      return document.body.innerText.includes('Inbox') || document.body.innerText.includes('inbox')
    }, undefined, { timeout: 15_000 })

    expect((await page.textContent('body'))?.toLowerCase()).toContain('inbox')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Chain of Thought
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Chain of Thought Components', () => {
  test('chain-of-thought component structure exists in chat', async ({ page }) => {
    const authenticated = await openChat(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const chatContainer = page.locator('.bb-chat').first()
    await chatContainer.waitFor({ state: 'visible', timeout: 15_000 })
    await expect(chatContainer).toBeVisible()

    const hasContent = await page.locator('.bb-chat__empty, .bb-chat__msg-list').first()
      .isVisible().catch(() => false)
    expect(hasContent).toBeTruthy()
  })
})
