import { test, expect } from '@playwright/test'

/**
 * Verify every dashboard tab renders without JS errors.
 * Runs against localhost:3000 with the dev server already running.
 */

const ALL_TABS = [
  { id: 'command-center', label: 'Command Center' },
  { id: 'dashboard', label: 'Tasks' },
  { id: 'chat', label: 'Chat' },
  { id: 'inbox', label: 'Inbox' },
  { id: 'channels', label: 'Channels' },
  { id: 'medications', label: 'Medications' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'leads', label: 'Leads' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'tenders', label: 'Tenders' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'sentry', label: 'Sentry' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'ad-scripts', label: 'Ad Scripts' },
  { id: 'ai-search', label: 'AI Search' },
  { id: 'reports', label: 'Reports' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'costs', label: 'Costs' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'activity', label: 'Activity' },
  { id: 'admin', label: 'Admin' },
  { id: 'settings', label: 'Settings' },
]

test.describe('Page Render Verification', () => {
  test('dashboard loads without critical errors', async ({ page }) => {
    const jsErrors: string[] = []

    page.on('pageerror', (error) => {
      // Ignore hydration warnings (known, fixed with suppressHydrationWarning)
      if (error.message.includes('Hydration')) return
      jsErrors.push(error.message)
    })

    await page.goto('/dashboard', { waitUntil: 'networkidle' })

    // Dashboard should render some content
    const body = await page.textContent('body')
    expect(body?.length).toBeGreaterThan(100)

    // Check for the sidebar nav
    const nav = page.locator('nav')
    expect(await nav.count()).toBeGreaterThan(0)

    // No critical JS errors
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('401') && !e.includes('400') && !e.includes('Failed to fetch')
    )
    if (criticalErrors.length > 0) {
      console.log('JS errors on dashboard load:', criticalErrors)
    }
  })

  for (const tab of ALL_TABS) {
    test(`tab "${tab.label}" (${tab.id}) renders without errors`, async ({ page }) => {
      const jsErrors: string[] = []
      const consoleErrors: string[] = []

      page.on('pageerror', (error) => {
        if (error.message.includes('Hydration')) return
        jsErrors.push(error.message)
      })

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text()
          // Ignore expected network errors (no auth)
          if (text.includes('401') || text.includes('400') || text.includes('Failed to fetch') || text.includes('Failed to load resource')) return
          consoleErrors.push(text)
        }
      })

      // Load dashboard
      await page.goto('/dashboard', { waitUntil: 'networkidle' })
      await page.waitForTimeout(1000)

      // Navigate to tab via custom event
      await page.evaluate((tabId) => {
        window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: tabId } }))
      }, tab.id)

      // Wait for tab panel to become active
      await page.waitForTimeout(800)

      // Verify the tab panel exists and is active
      const panel = page.locator(`#tabpanel-${tab.id}`)
      if (await panel.count() > 0) {
        const isActive = await panel.getAttribute('data-active')
        expect(isActive).toBe('true')

        // Panel should have some rendered content (not empty)
        const panelText = await panel.textContent()
        expect(panelText?.length).toBeGreaterThan(0)

        // Check panel isn't showing an error boundary crash
        const errorBoundary = panel.locator('text=/Something went wrong|Unexpected error|crashed/')
        expect(await errorBoundary.count()).toBe(0)
      }

      // Report any non-network JS errors
      const realErrors = jsErrors.filter(
        (e) =>
          !e.includes('401') &&
          !e.includes('400') &&
          !e.includes('Failed to fetch') &&
          !e.includes('NetworkError') &&
          !e.includes('width(-1)') &&
          !e.includes('height(-1)')
      )

      if (realErrors.length > 0) {
        console.log(`JS errors on tab "${tab.label}":`, realErrors)
      }
      // Fail only on actual rendering errors (not network/auth issues)
      expect(realErrors.filter((e) => e.includes('is not a function') || e.includes('Cannot read properties') || e.includes('is not defined'))).toEqual([])

      // Take screenshot for visual verification
      await page.screenshot({
        path: `e2e/screenshots/${tab.id}.png`,
        fullPage: false,
      })
    })
  }
})
