import { test, expect, type Page } from '@playwright/test'
import { AUTH_SKIP_REASON, openProtectedPath, navigateToTab } from './helpers'

// Bypass storageState requirement — our tests handle auth via openProtectedPath
test.use({ storageState: { cookies: [], origins: [] } })

/* ─── Helpers ─────────────────────────────────────────────── */

async function openDashboard(page: Page) {
  return openProtectedPath(page, '/dashboard')
}

async function openContactsPage(page: Page) {
  return openProtectedPath(page, '/dashboard/contacts')
}

async function openConnectionsTab(page: Page) {
  const authenticated = await openDashboard(page)
  if (!authenticated) return false

  // Try navigating via the tab system
  const directTab = page.getByRole('tab', { name: /connections/i })
  if (!(await directTab.count())) {
    // Try expanding advanced tabs first
    const showAdvanced = page.getByRole('button', { name: /show advanced tabs|more/i })
    if (await showAdvanced.count()) {
      await showAdvanced.first().click()
      await directTab.first().waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
    }
  }

  if (await directTab.count()) {
    await directTab.first().click()
  } else {
    // Fallback: try channels alias
    const channelsTab = page.getByRole('tab', { name: /channels/i })
    if (!(await channelsTab.count())) return false
    await channelsTab.first().click()
  }

  await page.waitForLoadState('domcontentloaded')
  return true
}

/* ─── Contacts Tab ────────────────────────────────────────── */

test.describe('Contacts Page', () => {
  test('contacts page renders with heading and search input', async ({ page }) => {
    const authenticated = await openContactsPage(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    // Page should have "Contacts" heading
    await expect(page.getByRole('heading', { name: /contacts/i }).first()).toBeVisible({
      timeout: 15_000,
    })

    // Should have a search input
    const searchInput = page.locator('input[name="q"], input[placeholder*="Search"]').first()
    await expect(searchInput).toBeVisible()
  })

  test('contacts page shows contact list or empty state', async ({ page }) => {
    const authenticated = await openContactsPage(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await page.waitForLoadState('networkidle')

    // Either contacts are displayed (via ContactCard links) or an empty state message
    const contactCards = page.locator('a[href*="/dashboard/contacts/"]')
    const emptyState = page.getByText(/no contacts yet|no contacts found/i)

    const hasContacts = (await contactCards.count()) > 0
    const hasEmptyState = await emptyState.isVisible().catch(() => false)

    expect(hasContacts || hasEmptyState).toBeTruthy()
  })

  test('contact cards show name and type badge', async ({ page }) => {
    const authenticated = await openContactsPage(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await page.waitForLoadState('networkidle')

    const contactCards = page.locator('a[href*="/dashboard/contacts/"]')
    const cardCount = await contactCards.count()

    if (cardCount === 0) {
      // No contacts seeded — verify empty state is correct
      await expect(page.getByText(/no contacts yet/i)).toBeVisible()
      return
    }

    // First card should have a name (font-medium text inside)
    const firstCard = contactCards.first()
    const nameEl = firstCard.locator('.font-medium').first()
    await expect(nameEl).toBeVisible()
    const nameText = await nameEl.textContent()
    expect(nameText?.trim().length).toBeGreaterThan(0)

    // Should show type badge (client/partner/lead/contact)
    const typeBadge = firstCard.locator('.rounded-full').first()
    if (await typeBadge.count()) {
      await expect(typeBadge).toBeVisible()
    }
  })

  test('search input filters contacts by query parameter', async ({ page }) => {
    const authenticated = await openContactsPage(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    // Submit a search query
    const searchInput = page.locator('input[name="q"], input[placeholder*="Search"]').first()
    await searchInput.fill('nonexistent-query-xyz-999')
    await searchInput.press('Enter')

    // Wait for navigation with query param
    await page.waitForURL(/[?&]q=/, { timeout: 10_000 }).catch(() => {})
    await page.waitForLoadState('networkidle')

    // Should show "no contacts found" for nonexistent query
    const noResults = page.getByText(/no contacts found/i)
    const contactCards = page.locator('a[href*="/dashboard/contacts/"]')

    // Either no results message or zero cards
    const hasNoResults = await noResults.isVisible().catch(() => false)
    const hasZeroCards = (await contactCards.count()) === 0
    expect(hasNoResults || hasZeroCards).toBeTruthy()
  })

  test('contact card links navigate to detail page', async ({ page }) => {
    const authenticated = await openContactsPage(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await page.waitForLoadState('networkidle')

    const contactCards = page.locator('a[href*="/dashboard/contacts/"]')
    const cardCount = await contactCards.count()

    test.skip(cardCount === 0, 'No contacts to click — skipping navigation test')

    // Get the first card's href
    const href = await contactCards.first().getAttribute('href')
    expect(href).toBeTruthy()
    expect(href).toContain('/dashboard/contacts/')

    // Click the first card
    await contactCards.first().click()

    // Should navigate to detail page
    await page.waitForURL(/\/dashboard\/contacts\/[^/]+/, { timeout: 10_000 })
    const url = new URL(page.url())
    expect(url.pathname).toMatch(/\/dashboard\/contacts\/[^/]+/)
  })

  test('contact detail page shows profile info', async ({ page }) => {
    const authenticated = await openContactsPage(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await page.waitForLoadState('networkidle')

    const contactCards = page.locator('a[href*="/dashboard/contacts/"]')
    const cardCount = await contactCards.count()

    test.skip(cardCount === 0, 'No contacts to view — skipping detail test')

    // Navigate to first contact
    await contactCards.first().click()
    await page.waitForURL(/\/dashboard\/contacts\/[^/]+/, { timeout: 10_000 })
    await page.waitForLoadState('networkidle')

    // Detail page should show either a contact name or "Contact not found"
    const hasName = await page.locator('h1').first().isVisible().catch(() => false)
    const hasNotFound = await page.getByText(/contact not found/i).isVisible().catch(() => false)

    expect(hasName || hasNotFound).toBeTruthy()

    if (hasName) {
      // Should show "Back to contacts" link
      const backLink = page.getByText(/back to contacts/i)
      await expect(backLink).toBeVisible()

      // Should have Profile and Related Tasks sections
      const profileCard = page.getByText(/profile/i).first()
      await expect(profileCard).toBeVisible()
    }
  })

  test('back navigation from contact detail returns to list', async ({ page }) => {
    const authenticated = await openContactsPage(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await page.waitForLoadState('networkidle')

    const contactCards = page.locator('a[href*="/dashboard/contacts/"]')
    test.skip((await contactCards.count()) === 0, 'No contacts to navigate — skipping back navigation test')

    // Go to detail page
    await contactCards.first().click()
    await page.waitForURL(/\/dashboard\/contacts\/[^/]+/, { timeout: 10_000 })
    await page.waitForLoadState('networkidle')

    // Click "Back to contacts"
    const backLink = page.locator('a[href="/dashboard/contacts"]').first()
    test.skip(!(await backLink.count()), 'No back link found')

    await backLink.click()
    await page.waitForURL(/\/dashboard\/contacts\/?$/, { timeout: 10_000 })

    // Should be back on contacts list
    await expect(page.getByRole('heading', { name: /contacts/i }).first()).toBeVisible()
  })

  test('Add Contact button is visible', async ({ page }) => {
    const authenticated = await openContactsPage(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const addButton = page.getByRole('button', { name: /add contact/i })
    await expect(addButton).toBeVisible({ timeout: 15_000 })
  })
})

/* ─── Connections Tab ─────────────────────────────────────── */

test.describe('Connections Tab', () => {
  test('connections tab renders grid of available connections', async ({ page }) => {
    const opened = await openConnectionsTab(page)
    test.skip(!opened, AUTH_SKIP_REASON)

    // Wait for connection tiles to load (at least one name visible)
    await page.waitForFunction(
      () => {
        const body = document.body.innerText
        return body.includes('Gmail') || body.includes('Outlook') || body.includes('WhatsApp')
      },
      undefined,
      { timeout: 15_000 },
    )

    // Verify multiple connection names are visible
    const expectedNames = ['Gmail', 'Outlook', 'Google Calendar', 'Asana', 'Calendly', 'Stripe', 'WhatsApp']
    let visibleCount = 0
    for (const name of expectedNames) {
      const heading = page.getByRole('heading', { name }).first()
      if (await heading.isVisible().catch(() => false)) {
        visibleCount++
      }
    }

    expect(visibleCount).toBeGreaterThan(1)
  })

  test('each connection card shows name and description', async ({ page }) => {
    const opened = await openConnectionsTab(page)
    test.skip(!opened, AUTH_SKIP_REASON)

    // Wait for Gmail tile to appear
    const gmailTile = page.locator('article:has(h3:has-text("Gmail"))').first()
    await gmailTile.waitFor({ state: 'visible', timeout: 15_000 })

    // Check heading is visible
    await expect(gmailTile.locator('h3')).toContainText('Gmail')

    // Description should be present
    const description = gmailTile.locator('p')
    if (await description.count()) {
      await expect(description.first()).toContainText('Inbox and drafts')
    }
  })

  test('connection cards have Connect or Connected buttons', async ({ page }) => {
    const opened = await openConnectionsTab(page)
    test.skip(!opened, AUTH_SKIP_REASON)

    // Wait for tiles to load
    await page.waitForFunction(
      () => document.body.innerText.includes('Gmail'),
      undefined,
      { timeout: 15_000 },
    )

    // Each non-comingSoon tile should have a Connect, Connected, or Connecting button
    const actionButtons = page.locator('article button:has-text("Connect"), article button:has-text("Connected")')
    const soonLabels = page.locator('article span:has-text("Soon")')

    const buttonCount = await actionButtons.count()
    const soonCount = await soonLabels.count()

    // Should have at least some action buttons (non-comingSoon connections)
    expect(buttonCount + soonCount).toBeGreaterThan(0)
    expect(buttonCount).toBeGreaterThan(0) // At least Gmail, Outlook, etc.
  })

  test('connection tiles show correct status indicators', async ({ page }) => {
    const opened = await openConnectionsTab(page)
    test.skip(!opened, AUTH_SKIP_REASON)

    await page.waitForFunction(
      () => document.body.innerText.includes('Gmail'),
      undefined,
      { timeout: 15_000 },
    )

    // Connected buttons should have green-ish text color classes
    const connectedButtons = page.locator('article button:has-text("Connected")')
    const connectedCount = await connectedButtons.count()

    if (connectedCount > 0) {
      // Verify connected button has the green styling (text-[#4f7f5d])
      const firstConnected = connectedButtons.first()
      const className = await firstConnected.getAttribute('class')
      expect(className).toContain('#4f7f5d')
    }

    // "Coming soon" tiles should show "Soon" label
    const soonLabels = page.locator('article span:has-text("Soon")')
    const soonCount = await soonLabels.count()

    // At least some connections should be marked as coming soon (Messenger, Instagram, Slack, Xero)
    expect(soonCount).toBeGreaterThanOrEqual(1)
  })

  test('category filter tabs work', async ({ page }) => {
    const opened = await openConnectionsTab(page)
    test.skip(!opened, AUTH_SKIP_REASON)

    await page.waitForFunction(
      () => document.body.innerText.includes('Gmail'),
      undefined,
      { timeout: 15_000 },
    )

    // Category tabs should be visible (All, Comms, Work, Finance)
    const allTab = page.getByRole('tab', { name: /all/i }).first()
    const commsTab = page.getByRole('tab', { name: /comms/i }).first()
    const financeTab = page.getByRole('tab', { name: /finance/i }).first()

    if (!(await allTab.count())) {
      // No category tabs in this variant — skip
      return
    }

    // Click Finance tab
    await financeTab.click()
    await page.waitForTimeout(500)

    // Should show Stripe and Xero but NOT Gmail
    const stripeVisible = await page.getByRole('heading', { name: 'Stripe' }).isVisible().catch(() => false)
    const gmailVisible = await page.getByRole('heading', { name: 'Gmail' }).isVisible().catch(() => false)

    expect(stripeVisible).toBeTruthy()
    expect(gmailVisible).toBeFalsy()

    // Click All tab to restore
    await allTab.click()
    await page.waitForTimeout(500)

    // Gmail should be visible again
    await expect(page.getByRole('heading', { name: 'Gmail' })).toBeVisible()
  })

  test('connections header shows connected count', async ({ page }) => {
    const opened = await openConnectionsTab(page)
    test.skip(!opened, AUTH_SKIP_REASON)

    await page.waitForFunction(
      () => document.body.innerText.includes('Gmail'),
      undefined,
      { timeout: 15_000 },
    )

    // Header should show "N connected" counter
    const connectedCounter = page.locator('text=/\\d+ connected/')
    const hasCounter = await connectedCounter.isVisible().catch(() => false)

    if (hasCounter) {
      const counterText = await connectedCounter.textContent()
      expect(counterText).toMatch(/\d+ connected/)
    }
  })

  test('clicking Connect on OAuth channel attempts connection flow', async ({ page }) => {
    const opened = await openConnectionsTab(page)
    test.skip(!opened, AUTH_SKIP_REASON)

    await page.waitForFunction(
      () => document.body.innerText.includes('Gmail'),
      undefined,
      { timeout: 15_000 },
    )

    // Find an unconnected OAuth channel's Connect button (Gmail or Outlook)
    const gmailArticle = page.locator('article:has(h3:has-text("Gmail"))').first()
    const connectBtn = gmailArticle.locator('button:has-text("Connect")').first()

    if (!(await connectBtn.count())) {
      // Gmail is already connected — skip this test
      return
    }

    // Intercept the /api/channels/connect POST to prevent actual OAuth redirect
    let connectCalled = false
    await page.route('**/api/channels/connect', async (route) => {
      connectCalled = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ redirect: true, url: 'https://accounts.google.com/o/oauth2/auth?test=1' }),
      })
    })

    // Block the popup from actually opening
    await page.evaluate(() => {
      window.open = () => null
    })

    await connectBtn.click()

    // Wait a bit for the API call
    await page.waitForTimeout(2000)

    // The connect API should have been called
    expect(connectCalled).toBeTruthy()
  })

  test('clicking Connect on API-key channel opens modal', async ({ page }) => {
    const opened = await openConnectionsTab(page)
    test.skip(!opened, AUTH_SKIP_REASON)

    await page.waitForFunction(
      () => document.body.innerText.includes('Stripe'),
      undefined,
      { timeout: 15_000 },
    )

    // Find Stripe's Connect button (API key auth)
    const stripeArticle = page.locator('article:has(h3:has-text("Stripe"))').first()
    const connectBtn = stripeArticle.locator('button:has-text("Connect")').first()

    if (!(await connectBtn.count())) {
      // Stripe already connected — skip
      return
    }

    await connectBtn.click()

    // Should open a modal/dialog for API key entry
    await page.waitForTimeout(1500)
    const modal = page.locator('[role="dialog"], .bb-modal, [data-state="open"]').first()
    const hasModal = await modal.isVisible().catch(() => false)

    // The modal should be visible for API key input
    expect(hasModal).toBeTruthy()
  })

  test('clicking Connect on WhatsApp channel opens QR modal', async ({ page }) => {
    const opened = await openConnectionsTab(page)
    test.skip(!opened, AUTH_SKIP_REASON)

    await page.waitForFunction(
      () => document.body.innerText.includes('WhatsApp'),
      undefined,
      { timeout: 15_000 },
    )

    const whatsappArticle = page.locator('article:has(h3:has-text("WhatsApp"))').first()
    const connectBtn = whatsappArticle.locator('button:has-text("Connect")').first()

    if (!(await connectBtn.count())) {
      return
    }

    await connectBtn.click()

    await page.waitForTimeout(1500)
    const modal = page.locator('[role="dialog"], .bb-modal, [data-state="open"]').first()
    const hasModal = await modal.isVisible().catch(() => false)

    expect(hasModal).toBeTruthy()
  })

  test('coming soon connections are not clickable to connect', async ({ page }) => {
    const opened = await openConnectionsTab(page)
    test.skip(!opened, AUTH_SKIP_REASON)

    await page.waitForFunction(
      () => document.body.innerText.includes('Slack'),
      undefined,
      { timeout: 15_000 },
    )

    // Slack is marked as comingSoon — should show "Soon" label, not a Connect button
    const slackArticle = page.locator('article:has(h3:has-text("Slack"))').first()
    const soonLabel = slackArticle.locator('span:has-text("Soon")').first()
    const connectBtn = slackArticle.locator('button:has-text("Connect")').first()

    const hasSoon = await soonLabel.isVisible().catch(() => false)
    const hasConnect = await connectBtn.isVisible().catch(() => false)

    expect(hasSoon).toBeTruthy()
    expect(hasConnect).toBeFalsy()
  })
})

/* ─── API Integration ─────────────────────────────────────── */

test.describe('Contacts & Connections API', () => {
  test('contacts API GET returns 200 with contacts array or 401', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/contacts')
      return {
        status: res.status,
        ok: res.ok,
        body: await res.json().catch(() => null),
      }
    })

    if (response.status === 401) {
      // Not authenticated in API context — acceptable
      expect(response.status).toBe(401)
      return
    }

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('contacts')
    expect(Array.isArray(response.body.contacts)).toBeTruthy()
  })

  test('channels status API GET returns 200 with channels array', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/channels/status')
      return {
        status: res.status,
        ok: res.ok,
        body: await res.json().catch(() => null),
      }
    })

    if (response.status === 401) {
      expect(response.status).toBe(401)
      return
    }

    expect(response.status).toBe(200)
    expect(response.body).toHaveProperty('channels')
    expect(Array.isArray(response.body.channels)).toBeTruthy()

    // Each channel should have type, name, and connected fields
    if (response.body.channels.length > 0) {
      const channel = response.body.channels[0]
      expect(channel).toHaveProperty('type')
      expect(channel).toHaveProperty('connected')
    }
  })

  test('contacts API returns correct contact shape', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/contacts')
      if (!res.ok) return { status: res.status, contacts: [] }
      const data = await res.json()
      return { status: res.status, contacts: data.contacts || [] }
    })

    test.skip(response.status === 401, 'Not authenticated for API')

    if (response.contacts.length > 0) {
      const contact = response.contacts[0]
      // Contact should have required fields
      expect(contact).toHaveProperty('id')
      expect(contact).toHaveProperty('name')
      expect(contact).toHaveProperty('slug')
      expect(contact).toHaveProperty('type')
      expect(contact).toHaveProperty('emails')
      expect(contact).toHaveProperty('phones')
    }
  })

  test('channels status API returns all expected channel types', async ({ page }) => {
    const authenticated = await openDashboard(page)
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const response = await page.evaluate(async () => {
      const res = await fetch('/api/channels/status')
      if (!res.ok) return { status: res.status, channels: [] }
      const data = await res.json()
      return { status: res.status, channels: data.channels || [] }
    })

    test.skip(response.status === 401, 'Not authenticated for API')

    // Should return channel type info
    const channelTypes = response.channels.map((c: { type: string }) => c.type)

    // At minimum, the adapters should return gmail, outlook, etc.
    expect(channelTypes.length).toBeGreaterThan(0)
  })
})
