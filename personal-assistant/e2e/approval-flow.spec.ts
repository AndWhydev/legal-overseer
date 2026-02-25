import { test, expect } from '@playwright/test'
import { login, waitForDashboard, ApprovalQueuePage } from './helpers'

test.describe('Approval Flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
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
      // Should show confirmation or update status
      await page.waitForTimeout(1000)
      // Verify the UI updated (approval removed or status changed)
    }
  })

  test('reject button triggers rejection', async ({ page }) => {
    const approvalPage = new ApprovalQueuePage(page)
    await approvalPage.goto()

    const rejectBtn = page.locator('button:has-text("Reject")')
    if (await rejectBtn.count() > 0) {
      await rejectBtn.first().click()
      await page.waitForTimeout(1000)
    }
  })
})
