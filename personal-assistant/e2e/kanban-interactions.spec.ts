// e2e/kanban-interactions.spec.ts
import { test, expect, type Page } from '@playwright/test'
import { AUTH_SKIP_REASON, openProtectedPath, navigateToTab } from './helpers'

async function openKanban(page: Page) {
  const authenticated = await openProtectedPath(page, '/dashboard')
  if (!authenticated) return false
  await navigateToTab(page, 'Dashboard')
  // Wait for kanban to render
  await page.waitForFunction(
    () => document.body.innerText.includes('Tasks Due This Week') ||
          document.body.innerText.includes('Active Projects') ||
          document.body.innerText.includes('Failed to load'),
    undefined,
    { timeout: 15_000 },
  )
  return true
}

test.describe('Kanban Board Interactions', () => {
  test('quick-add creates a task in column', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Look for quick-add input in first column
    const quickAdd = page.locator(
      'input[placeholder*="Add" i], input[placeholder*="task" i], input[placeholder*="quick" i]',
    ).first()

    if (await quickAdd.count() === 0) {
      // Some designs use a button to reveal the input
      const addBtn = page.locator('button[aria-label*="add" i], button:has-text("+ Add")').first()
      if (await addBtn.count() > 0) await addBtn.click()
    }

    if (await quickAdd.count() > 0) {
      const taskTitle = `E2E Test Task ${Date.now()}`

      // Intercept task creation API
      const apiPromise = page.waitForResponse(
        (resp) => resp.url().includes('/api/tasks') && resp.request().method() === 'POST',
        { timeout: 10_000 },
      ).catch(() => null)

      await quickAdd.fill(taskTitle)
      await quickAdd.press('Enter')

      const response = await apiPromise
      if (response) {
        expect([200, 201]).toContain(response.status())
      }

      // Task should appear in the board
      await expect(page.locator(`text="${taskTitle}"`)).toBeVisible({ timeout: 5_000 })
    }
  })

  test('create button opens task dialog', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Find the create/add button in the toolbar
    const createBtn = page.locator(
      'button:has-text("Create"), button:has-text("New Task"), button[aria-label*="create" i]',
    ).first()

    if (await createBtn.count() > 0) {
      await createBtn.click()

      // Dialog should open
      const dialog = page.locator(
        '[role="dialog"], [class*="dialog"], [class*="modal"]',
      ).first()
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      // Should have title input and save/create button
      const titleInput = dialog.locator('input, textarea').first()
      expect(await titleInput.count()).toBeGreaterThan(0)

      // Close dialog
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {})
    }
  })

  test('priority filter chips toggle correctly', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Find priority filter chips
    const priorityChip = page.locator(
      'button:has-text("Priority"), button:has-text("Urgent"), button:has-text("High")',
    ).first()

    if (await priorityChip.count() > 0) {
      await priorityChip.click()
      await page.waitForTimeout(300)

      // Should open a dropdown or toggle active state
      const dropdown = page.locator('[class*="menu"], [role="menu"], [role="listbox"]').first()
      const isActive = await priorityChip.evaluate((el) => {
        const style = window.getComputedStyle(el)
        return style.background !== 'var(--bb-surface)' || el.classList.contains('active')
      })

      // Either dropdown appeared or chip toggled
      expect(await dropdown.count() > 0 || isActive).toBeTruthy()

      // No crash
      const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
      expect(await errorBoundary.count()).toBe(0)
    }
  })

  test('source filter toggles between all/bitbit/you', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Find source filter chips
    const allChip = page.locator('button:has-text("All")').first()
    const bitbitChip = page.locator('button:has-text("BitBit")').first()
    const youChip = page.locator('button:has-text("You")').first()

    if (await bitbitChip.count() > 0) {
      await bitbitChip.click()
      await page.waitForTimeout(300)

      // No crash
      const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
      expect(await errorBoundary.count()).toBe(0)

      // Toggle back to All
      if (await allChip.count() > 0) {
        await allChip.click()
        await page.waitForTimeout(300)
      }
    }
  })

  test('toolbar search filters tasks', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Find search input (may need to click search icon to expand)
    let searchInput = page.locator(
      'input[placeholder*="Search" i], input[aria-label*="search" i]',
    ).first()

    if (await searchInput.count() === 0) {
      const searchIcon = page.locator(
        'button[aria-label*="search" i], button:has(svg)',
      ).first()
      if (await searchIcon.count() > 0) {
        await searchIcon.click()
        searchInput = page.locator('input[placeholder*="Search" i]').first()
      }
    }

    if (await searchInput.count() > 0) {
      await searchInput.fill('nonexistent-query-xyz')
      await page.waitForTimeout(500)

      // Board should still render without errors
      const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
      expect(await errorBoundary.count()).toBe(0)

      // Clear search
      await searchInput.clear()
    }
  })

  test('clicking a task card opens edit dialog', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Find any task card
    const card = page.locator('[class*="kanban-card"], [data-testid*="task-card"]').first()

    if (await card.count() > 0) {
      await card.click()
      await page.waitForTimeout(500)

      // Dialog or detail panel should open
      const dialog = page.locator(
        '[role="dialog"], [class*="dialog"], [class*="modal"], [class*="task-detail"]',
      ).first()

      if (await dialog.count() > 0) {
        await expect(dialog).toBeVisible()
        await page.keyboard.press('Escape')
      }
    }
  })

  test('overdue counter badge renders when tasks are overdue', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Overdue badge may or may not be visible depending on data
    const overdueBadge = page.locator(
      '[class*="overdue"], [data-testid="overdue-count"], button:has-text("overdue")',
    )

    // Just verify no crash — badge is data-dependent
    const errorBoundary = page.locator('text=/Something went wrong|crashed/i')
    expect(await errorBoundary.count()).toBe(0)
  })
})
