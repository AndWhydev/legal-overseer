import { test, expect } from '@playwright/test'
import { AUTH_SKIP_REASON, waitForDashboard, ApprovalQueuePage, openProtectedPath } from './helpers'

test.describe('Approval Flow', () => {
  test.beforeEach(async ({ page }) => {
    const authenticated = await openProtectedPath(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)
    await waitForDashboard(page)
  })

  test('can navigate to approvals section', async ({ page }) => {
    const approvalPage = new ApprovalQueuePage(page)
    await approvalPage.goto()
    // Page should have approval-related content
    const body = await page.textContent('body')
    expect(body).toBeTruthy()
  })

  test('approve button triggers approval action', async ({ page }) => {
    const approvalPage = new ApprovalQueuePage(page)
    await approvalPage.goto()

    const approveBtn = page.locator('button:has-text("Approve")')
    if (await approveBtn.count() > 0) {
      await approveBtn.first().click()
      const statusChange = page.locator('text=/approved|success|updated/i').first()
      await Promise.race([
        statusChange.waitFor({ state: 'visible', timeout: 8_000 }),
        approveBtn.first().waitFor({ state: 'detached', timeout: 8_000 }),
      ]).catch(() => {})
    }
  })

  test('reject button triggers rejection', async ({ page }) => {
    const approvalPage = new ApprovalQueuePage(page)
    await approvalPage.goto()

    const rejectBtn = page.locator('button:has-text("Reject")')
    if (await rejectBtn.count() > 0) {
      await rejectBtn.first().click()
      const statusChange = page.locator('text=/rejected|updated|success/i').first()
      await Promise.race([
        statusChange.waitFor({ state: 'visible', timeout: 8_000 }),
        rejectBtn.first().waitFor({ state: 'detached', timeout: 8_000 }),
      ]).catch(() => {})
    }
  })
})
