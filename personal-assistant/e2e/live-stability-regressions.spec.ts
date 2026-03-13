import { test, expect } from '@playwright/test'
import { AUTH_SKIP_REASON, openProtectedPath } from './helpers'

async function enableTestModules(page: Parameters<typeof test>[0]['page']) {
  await page.evaluate(() => {
    window.localStorage.setItem(
      'bb-dev-overrides',
      JSON.stringify({
        ui_profile: 'full',
        enabled_modules: ['dashboard', 'chat', 'contacts', 'settings'],
        seed_data: { contacts: true },
      }),
    )
  })

  await page.reload({ waitUntil: 'domcontentloaded' })
}

async function openTab(page: Parameters<typeof test>[0]['page'], tabId: string) {
  await page.evaluate((id) => {
    window.sessionStorage.setItem('bitbit-tab', id)
  }, tabId)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator(`#tabpanel-${tabId}`)).toHaveAttribute('data-active', 'true')
}

test.describe('Live stability regressions', () => {
  test('inactive panels are hidden after dashboard navigation', async ({ page }) => {
    const authenticated = await openProtectedPath(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await enableTestModules(page)
    await openTab(page, 'settings')
    await expect(page.getByText('Save All Settings')).toBeVisible()

    await openTab(page, 'chat')

    await expect(page.locator('#tabpanel-settings')).toHaveAttribute('hidden', '')
    await expect(page.getByText('Save All Settings')).toBeHidden()
  })

  test('clicking a contact opens the contact detail drawer', async ({ page }) => {
    const authenticated = await openProtectedPath(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)

    await enableTestModules(page)
    await openTab(page, 'contacts')

    const firstCard = page.locator('.bb-contacts-card').first()
    await expect(firstCard).toBeVisible()
    await firstCard.click()

    await expect(page.getByRole('dialog', { name: 'Entity details' })).toBeVisible()
  })
})
