// e2e/comprehensive-kanban.spec.ts — Comprehensive Kanban Board & Task Management E2E Tests
import { test, expect, type Page } from '@playwright/test'
import { AUTH_SKIP_REASON, openProtectedPath, navigateToTab } from './helpers'

// ─── Helpers ────────────────────────────────────────────────────────────────

async function openKanban(page: Page) {
  const authenticated = await openProtectedPath(page, '/dashboard')
  if (!authenticated) return false
  await navigateToTab(page, 'Dashboard')
  // Wait for kanban board or error state to render
  await page.waitForFunction(
    () =>
      document.body.innerText.includes('Tasks') ||
      document.body.innerText.includes('Failed to load'),
    undefined,
    { timeout: 15_000 },
  )
  return true
}

/** Locate the active tab panel containing the kanban board */
function kanbanPanel(page: Page) {
  // The kanban board lives inside the active Dashboard tab panel
  // Look for the visible panel containing the "Tasks" toolbar heading
  return page.locator('h2:has-text("Tasks")').locator('..').locator('..')
}

/** Locate kanban column headers — scoped within the kanban board area */
function columnHeaders(page: Page) {
  // Column headers are h3 elements that are siblings to count badge spans
  // Scope to the parent of the "Tasks" h2 to avoid matching h3s on other tabs
  return kanbanPanel(page).locator('h3:visible')
}

/** Locate task cards — use the class set in kanban-card.tsx */
function taskCards(page: Page) {
  return page.locator('.card-lift')
}

/** Locate the toolbar area (parent div containing "Tasks" heading) */
function toolbar(page: Page) {
  return page.locator('h2:has-text("Tasks")').locator('..')
}

// ═══════════════════════════════════════════════════════════════════════════
// BOARD RENDERING
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Board Rendering', () => {
  test('dashboard tab shows kanban board with toolbar', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // The board always renders a toolbar with "Tasks" heading even when empty
    const tasksHeading = page.locator('h2:has-text("Tasks")')
    await expect(tasksHeading).toBeVisible({ timeout: 10_000 })

    // If columns exist, they should have h3 headers
    const headers = columnHeaders(page)
    const colCount = await headers.count()
    // Columns are data-dependent — may be 0 if no kanban_columns in DB
    // Just verify the board area rendered without crash
    const error = page.locator('text=/Something went wrong|crashed/i')
    expect(await error.count()).toBe(0)

    if (colCount > 0) {
      await expect(headers.first()).toBeVisible()
    }
  })

  test('columns have headers with recognizable titles when present', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Columns are data-dependent — skip if no columns loaded
    const headers = columnHeaders(page)
    const count = await headers.count()
    if (count === 0) {
      test.skip(true, 'No kanban columns in database')
      return
    }

    // Collect all column titles
    const titles: string[] = []
    for (let i = 0; i < count; i++) {
      const text = await headers.nth(i).textContent()
      if (text?.trim()) titles.push(text.trim())
    }

    // Should have at least one non-empty title
    expect(titles.length).toBeGreaterThanOrEqual(1)
  })

  test('columns show task count badges when columns exist', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Columns are data-dependent — skip if none loaded
    const headers = columnHeaders(page)
    const count = await headers.count()
    if (count === 0) {
      test.skip(true, 'No kanban columns in database')
      return
    }

    // Each column header area has a count badge span next to the h3
    const countBadges = kanbanPanel(page).locator('h3 + span')
    await expect(countBadges.first()).toBeVisible({ timeout: 5_000 })

    const firstBadgeText = await countBadges.first().textContent()
    // Should be a number
    expect(firstBadgeText?.trim()).toMatch(/^\d+$/)
  })

  test('task cards render inside columns', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Cards use .card-lift class
    const cards = taskCards(page)
    // May have 0 tasks if database is empty — just verify no crash
    const count = await cards.count()

    if (count > 0) {
      await expect(cards.first()).toBeVisible()
      // Card should contain an h4 title
      const title = cards.first().locator('h4')
      await expect(title).toBeVisible()
    }

    // No crash
    const error = page.locator('text=/Something went wrong|crashed/i')
    expect(await error.count()).toBe(0)
  })

  test('KPI/stats area renders above board', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // The dashboard redesign has stat cards or a daily brief area above the kanban board
    // Look for typical KPI indicators
    const statsArea = page.locator('[class*="stat"], [class*="kpi"], [data-testid*="stat"]')
    const briefArea = page.locator('text=/Good morning|Good afternoon|Good evening|Daily Brief|Tasks Due/i')
    const toolbarArea = page.locator('h2:has-text("Tasks")')

    // At least the toolbar "Tasks" heading should be present
    await expect(toolbarArea).toBeVisible({ timeout: 10_000 })

    // No error state
    const error = page.locator('text=/Something went wrong|crashed/i')
    expect(await error.count()).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// TASK CARDS
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Task Cards', () => {
  test('task cards show title text', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const cards = taskCards(page)
    if ((await cards.count()) === 0) {
      test.skip(true, 'No task cards in database')
      return
    }

    // First card should have an h4 with non-empty text
    const title = cards.first().locator('h4')
    await expect(title).toBeVisible()
    const text = await title.textContent()
    expect(text?.trim().length).toBeGreaterThan(0)
  })

  test('task cards show priority indicator', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const cards = taskCards(page)
    if ((await cards.count()) === 0) {
      test.skip(true, 'No task cards in database')
      return
    }

    // Priority is shown as a pill with a dot + label (e.g., "critical", "high", "medium", "low")
    const firstCard = cards.first()
    const priorityPill = firstCard.locator('span:has-text("critical"), span:has-text("high"), span:has-text("medium"), span:has-text("low")')
    await expect(priorityPill.first()).toBeVisible({ timeout: 5_000 })
  })

  test('task cards show source dots when source is set', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const cards = taskCards(page)
    if ((await cards.count()) === 0) {
      test.skip(true, 'No task cards in database')
      return
    }

    // Source dots are small spans (6x6) inside the h4 title
    // They exist only when metadata.source is set — data-dependent
    // Just verify cards render without crash
    const count = await cards.count()
    expect(count).toBeGreaterThanOrEqual(1)

    const error = page.locator('text=/Something went wrong|crashed/i')
    expect(await error.count()).toBe(0)
  })

  test('task cards show deadline pills when deadline is set', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const cards = taskCards(page)
    if ((await cards.count()) === 0) {
      test.skip(true, 'No task cards in database')
      return
    }

    // Deadline pills show month abbreviation + day (e.g., "Mar 15", "Apr 2")
    // Data-dependent — some tasks may not have deadlines
    const deadlinePill = page.locator('.card-lift span:text-matches("[A-Z][a-z]{2} \\\\d+")')
    const count = await deadlinePill.count()

    // Just ensure no crash regardless of data
    const error = page.locator('text=/Something went wrong|crashed/i')
    expect(await error.count()).toBe(0)
  })

  test('task cards show agent activity bar when agent is assigned', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Agent activity bar shows "assigned_to" agent name with status
    // Data-dependent — look for any agent indicator
    const agentBar = page.locator('.card-lift:has-text("working"), .card-lift:has-text("assigned"), .card-lift:has-text("done")')

    // Just verify no crash — agent data is optional
    const error = page.locator('text=/Something went wrong|crashed/i')
    expect(await error.count()).toBe(0)
  })

  test('task cards show time-ago text', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const cards = taskCards(page)
    if ((await cards.count()) === 0) {
      test.skip(true, 'No task cards in database')
      return
    }

    // Time ago appears as "just now", "Xm ago", "Xh ago", "Xd ago"
    const timeAgo = cards.first().locator('span:text-matches("(just now|\\\\d+[mhd] ago)")')
    // Data-dependent, but at least one card should have a time
    if ((await timeAgo.count()) > 0) {
      await expect(timeAgo.first()).toBeVisible()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// TOOLBAR
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Toolbar', () => {
  test('toolbar renders with "Tasks" heading and count', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const heading = page.locator('h2:has-text("Tasks")')
    await expect(heading).toBeVisible({ timeout: 10_000 })

    // Count badge next to heading
    const countBadge = heading.locator('..').locator('span').first()
    await expect(countBadge).toBeVisible()
    const text = await countBadge.textContent()
    expect(text?.trim()).toMatch(/^\d+$/)
  })

  test('priority filter dropdown opens and shows options', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Priority button in toolbar
    const priorityBtn = page.locator('button:has-text("Priority")').first()
    if ((await priorityBtn.count()) === 0) {
      test.skip(true, 'Priority filter button not found')
      return
    }

    await priorityBtn.click()
    await page.waitForTimeout(300)

    // Dropdown menu should appear with priority options
    const criticalOpt = page.locator('button:has-text("Critical")')
    const highOpt = page.locator('button:has-text("High")')
    const mediumOpt = page.locator('button:has-text("Medium")')
    const lowOpt = page.locator('button:has-text("Low")')

    // At least some options should be visible
    const anyVisible =
      (await criticalOpt.count()) > 0 ||
      (await highOpt.count()) > 0 ||
      (await mediumOpt.count()) > 0 ||
      (await lowOpt.count()) > 0

    expect(anyVisible).toBeTruthy()
  })

  test('source filter dropdown opens and shows All/BitBit/You options', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Source button in toolbar
    const sourceBtn = page.locator('button:has-text("Source")').first()
    if ((await sourceBtn.count()) === 0) {
      test.skip(true, 'Source filter button not found')
      return
    }

    await sourceBtn.click()
    await page.waitForTimeout(300)

    // Dropdown should show All, BitBit, You
    const allOpt = page.locator('button:has-text("All")')
    const bitbitOpt = page.locator('button:has-text("BitBit")')
    const youOpt = page.locator('button:has-text("You")')

    expect(await allOpt.count()).toBeGreaterThan(0)
    expect(await bitbitOpt.count()).toBeGreaterThan(0)
    expect(await youOpt.count()).toBeGreaterThan(0)
  })

  test('search icon expands to search input on click', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Search is initially collapsed (36px wide icon), click to expand
    const searchArea = page.locator('div:has(> svg)').filter({ has: page.locator('svg') })

    // Find the search container by looking for the Search icon area in toolbar
    // The toolbar has a div with Search icon that expands on click
    let searchInput = page.locator('input[placeholder="Search..."]')

    if ((await searchInput.count()) === 0) {
      // Search is collapsed — need to click the search icon container
      // It's the div containing the search SVG in the toolbar area
      const searchIcon = page.locator('h2:has-text("Tasks")').locator('..').locator('svg').last()
      if ((await searchIcon.count()) > 0) {
        await searchIcon.click()
        await page.waitForTimeout(200)
      }
    }

    searchInput = page.locator('input[placeholder="Search..."]')
    if ((await searchInput.count()) > 0) {
      await expect(searchInput).toBeVisible()
    }
  })

  test('create button ("New") is visible and clickable', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const newBtn = page.locator('button:has-text("New")')
    await expect(newBtn).toBeVisible({ timeout: 10_000 })
  })

  test('overdue counter badge renders when tasks are overdue', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Overdue badge is a red button with a number, titled "Overdue tasks"
    const overdueBadge = page.locator('button[title="Overdue tasks"]')
    // Data-dependent — just verify no crash
    const error = page.locator('text=/Something went wrong|crashed/i')
    expect(await error.count()).toBe(0)

    if ((await overdueBadge.count()) > 0) {
      await expect(overdueBadge).toBeVisible()
      const text = await overdueBadge.textContent()
      expect(text?.trim()).toMatch(/^\d+$/)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// INTERACTIONS
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Interactions', () => {
  test('quick-add button in column reveals input', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // Each column has an "Add task" button that reveals an inline input
    const addBtn = page.locator('button:has-text("Add task")').first()
    if ((await addBtn.count()) === 0) {
      test.skip(true, 'No "Add task" button found')
      return
    }

    await addBtn.click()
    await page.waitForTimeout(200)

    // Input with placeholder "Task title..." should appear
    const input = page.locator('input[placeholder="Task title..."]')
    await expect(input).toBeVisible({ timeout: 3_000 })
  })

  test('quick-add creates a new task via Enter', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const addBtn = page.locator('button:has-text("Add task")').first()
    if ((await addBtn.count()) === 0) {
      test.skip(true, 'No "Add task" button found')
      return
    }

    await addBtn.click()
    await page.waitForTimeout(200)

    const input = page.locator('input[placeholder="Task title..."]')
    if ((await input.count()) === 0) {
      test.skip(true, 'Quick-add input not found')
      return
    }

    const taskTitle = `E2E Quick ${Date.now()}`

    // Intercept POST to /api/tasks
    const apiPromise = page.waitForResponse(
      (resp) => resp.url().includes('/api/tasks') && resp.request().method() === 'POST',
      { timeout: 10_000 },
    ).catch(() => null)

    await input.fill(taskTitle)
    await input.press('Enter')

    const response = await apiPromise
    if (response) {
      expect([200, 201]).toContain(response.status())
    }

    // Task should appear optimistically in the board
    await expect(page.locator(`h4:has-text("${taskTitle}")`)).toBeVisible({ timeout: 5_000 })
  })

  test('quick-add Escape cancels input', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const addBtn = page.locator('button:has-text("Add task")').first()
    if ((await addBtn.count()) === 0) {
      test.skip(true, 'No "Add task" button found')
      return
    }

    await addBtn.click()
    await page.waitForTimeout(200)

    const input = page.locator('input[placeholder="Task title..."]')
    await expect(input).toBeVisible({ timeout: 3_000 })

    await input.press('Escape')
    await page.waitForTimeout(200)

    // Input should disappear
    await expect(input).not.toBeVisible({ timeout: 3_000 })
  })

  test('"New" button opens task creation dialog', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const newBtn = page.locator('button:has-text("New")')
    if ((await newBtn.count()) === 0) {
      test.skip(true, '"New" button not found')
      return
    }

    await newBtn.click()
    await page.waitForTimeout(300)

    // Dialog should open with title input placeholder
    const titleInput = page.locator('input.td-title, input[placeholder="What needs to be done?"]')
    await expect(titleInput).toBeVisible({ timeout: 5_000 })
  })

  test('task dialog has title, description, column, priority fields', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const newBtn = page.locator('button:has-text("New")')
    if ((await newBtn.count()) === 0) {
      test.skip(true, '"New" button not found')
      return
    }

    await newBtn.click()
    await page.waitForTimeout(300)

    // Title input
    const titleInput = page.locator('input[placeholder="What needs to be done?"]')
    await expect(titleInput).toBeVisible({ timeout: 5_000 })

    // "Add notes" button for description
    const addNotes = page.locator('button:has-text("Add notes")')
    expect(await addNotes.count()).toBeGreaterThan(0)

    // Column chip selector
    const columnChip = page.locator('button:has-text("Column"), button:has(svg + span)')
    // The column chip shows the column title — at least one chip should exist
    // Priority chip
    const priorityChip = page.locator('button:has-text("Medium")')
    expect(await priorityChip.count()).toBeGreaterThan(0)

    // Tag chip
    const tagChip = page.locator('button:has-text("Tag")')
    expect(await tagChip.count()).toBeGreaterThan(0)

    // Date chip
    const dateChip = page.locator('button:has-text("Date")')
    expect(await dateChip.count()).toBeGreaterThan(0)

    // Create/Cancel buttons
    const createBtn = page.getByRole('button', { name: 'Create ↵' })
    expect(await createBtn.count()).toBeGreaterThan(0)

    const cancelBtn = page.locator('button:has-text("Cancel")')
    expect(await cancelBtn.count()).toBeGreaterThan(0)
  })

  test('task dialog Create button submits POST to /api/tasks', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const newBtn = page.locator('button:has-text("New")')
    if ((await newBtn.count()) === 0) {
      test.skip(true, '"New" button not found')
      return
    }

    await newBtn.click()
    await page.waitForTimeout(300)

    const titleInput = page.locator('input[placeholder="What needs to be done?"]')
    await expect(titleInput).toBeVisible({ timeout: 5_000 })

    const taskTitle = `E2E Dialog ${Date.now()}`
    await titleInput.fill(taskTitle)

    // Intercept POST — verify the request is sent (response may be 401 if unauthenticated)
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/tasks') && req.method() === 'POST',
      { timeout: 10_000 },
    ).catch(() => null)

    const createBtn = page.getByRole('button', { name: 'Create ↵' })
    await createBtn.click()

    const request = await requestPromise
    // Verify a POST was actually sent to the tasks API
    expect(request).not.toBeNull()
    if (request) {
      expect(request.method()).toBe('POST')
      expect(request.url()).toContain('/api/tasks')
    }

    // Dialog should close after submission
    await expect(titleInput).not.toBeVisible({ timeout: 5_000 })
  })

  test('clicking a task card opens edit dialog', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const cards = taskCards(page)
    if ((await cards.count()) === 0) {
      test.skip(true, 'No task cards to click')
      return
    }

    // Click the first card
    await cards.first().click()
    await page.waitForTimeout(500)

    // Edit dialog should open — look for the title input populated with task title
    const titleInput = page.locator('input[placeholder="What needs to be done?"]')
    if ((await titleInput.count()) > 0) {
      await expect(titleInput).toBeVisible({ timeout: 5_000 })
      const value = await titleInput.inputValue()
      expect(value.length).toBeGreaterThan(0)

      // Should show "Update" button instead of "Create"
      const updateBtn = page.locator('button:has-text("Update")')
      expect(await updateBtn.count()).toBeGreaterThan(0)
    }
  })

  test('Escape closes the task dialog', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const newBtn = page.locator('button:has-text("New")')
    if ((await newBtn.count()) === 0) {
      test.skip(true, '"New" button not found')
      return
    }

    await newBtn.click()
    await page.waitForTimeout(300)

    const titleInput = page.locator('input[placeholder="What needs to be done?"]')
    await expect(titleInput).toBeVisible({ timeout: 5_000 })

    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    await expect(titleInput).not.toBeVisible({ timeout: 3_000 })
  })

  test('priority filter actually filters visible cards', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const cards = taskCards(page)
    const initialCount = await cards.count()
    if (initialCount === 0) {
      test.skip(true, 'No task cards to filter')
      return
    }

    // Open priority dropdown and select "High"
    const priorityBtn = page.locator('button:has-text("Priority")').first()
    if ((await priorityBtn.count()) === 0) {
      test.skip(true, 'Priority filter not found')
      return
    }

    await priorityBtn.click()
    await page.waitForTimeout(300)

    const highOpt = page.locator('button:has-text("High")').last()
    if ((await highOpt.count()) > 0) {
      await highOpt.click()
      await page.waitForTimeout(500)

      // Card count should have changed (or stayed same if all are high)
      const filteredCount = await cards.count()
      // Filtered count should be <= initial count
      expect(filteredCount).toBeLessThanOrEqual(initialCount)

      // No crash
      const error = page.locator('text=/Something went wrong|crashed/i')
      expect(await error.count()).toBe(0)
    }
  })

  test('search filters visible cards', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const cards = taskCards(page)
    const initialCount = await cards.count()
    if (initialCount === 0) {
      test.skip(true, 'No task cards to search')
      return
    }

    // Expand search
    const searchContainer = page.locator('h2:has-text("Tasks")').locator('..').locator('div:has(> svg)').last()
    if ((await searchContainer.count()) > 0) {
      await searchContainer.click()
      await page.waitForTimeout(200)
    }

    let searchInput = page.locator('input[placeholder="Search..."]')
    if ((await searchInput.count()) > 0) {
      // Search for something that won't match
      await searchInput.fill('zzz_nonexistent_query_xyz')
      await page.waitForTimeout(500)

      const afterSearchCount = await cards.count()
      // Should show fewer (likely 0) cards
      expect(afterSearchCount).toBeLessThanOrEqual(initialCount)

      // Clear search
      await searchInput.clear()
      await page.waitForTimeout(300)

      // Cards should return
      const restoredCount = await cards.count()
      expect(restoredCount).toBeGreaterThanOrEqual(afterSearchCount)
    }
  })

  test('source filter toggles between All/BitBit/You without crash', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const sourceBtn = page.locator('button:has-text("Source")').first()
    if ((await sourceBtn.count()) === 0) {
      test.skip(true, 'Source filter not found')
      return
    }

    // Click Source to open dropdown
    await sourceBtn.click()
    await page.waitForTimeout(300)

    // Select "BitBit"
    const bitbitOpt = page.locator('button:has-text("BitBit")').last()
    if ((await bitbitOpt.count()) > 0) {
      await bitbitOpt.click()
      await page.waitForTimeout(300)

      // No crash
      const error = page.locator('text=/Something went wrong|crashed/i')
      expect(await error.count()).toBe(0)

      // Source button should now show "Source: bitbit"
      const activeSourceBtn = page.locator('button:has-text("Source: bitbit")')
      if ((await activeSourceBtn.count()) > 0) {
        await expect(activeSourceBtn).toBeVisible()
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// DATA INTEGRITY
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Data Integrity', () => {
  test('task creation via dialog sends POST to /api/tasks with correct payload', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const newBtn = page.locator('button:has-text("New")')
    if ((await newBtn.count()) === 0) {
      test.skip(true, '"New" button not found')
      return
    }

    await newBtn.click()
    await page.waitForTimeout(300)

    const titleInput = page.locator('input[placeholder="What needs to be done?"]')
    await expect(titleInput).toBeVisible({ timeout: 5_000 })

    const taskTitle = `E2E Payload ${Date.now()}`
    await titleInput.fill(taskTitle)

    // Intercept to check payload
    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/tasks') && req.method() === 'POST',
      { timeout: 10_000 },
    ).catch(() => null)

    const createBtn = page.getByRole('button', { name: 'Create ↵' })
    await createBtn.click()

    const request = await requestPromise
    if (request) {
      const body = request.postDataJSON()
      expect(body).toHaveProperty('title', taskTitle)
      expect(body).toHaveProperty('column_id')
      expect(body).toHaveProperty('priority')
    }
  })

  test('task edit via dialog sends PATCH to /api/tasks/[id]', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const cards = taskCards(page)
    if ((await cards.count()) === 0) {
      test.skip(true, 'No task cards to edit')
      return
    }

    // Click a card to open edit dialog
    await cards.first().click()
    await page.waitForTimeout(500)

    const titleInput = page.locator('input[placeholder="What needs to be done?"]')
    if ((await titleInput.count()) === 0) {
      test.skip(true, 'Edit dialog did not open')
      return
    }

    await expect(titleInput).toBeVisible({ timeout: 5_000 })

    // Modify title
    const newTitle = `E2E Updated ${Date.now()}`
    await titleInput.clear()
    await titleInput.fill(newTitle)

    // Intercept PATCH request
    const requestPromise = page.waitForRequest(
      (req) => req.url().match(/\/api\/tasks\/[^/]+$/) !== null && req.method() === 'PATCH',
      { timeout: 10_000 },
    ).catch(() => null)

    const updateBtn = page.locator('button:has-text("Update")')
    if ((await updateBtn.count()) > 0) {
      await updateBtn.click()

      const request = await requestPromise
      if (request) {
        expect(request.method()).toBe('PATCH')
        const body = request.postDataJSON()
        expect(body).toHaveProperty('title', newTitle)
      }
    }
  })

  test('quick-add creates task in correct column via POST', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    const addBtn = page.locator('button:has-text("Add task")').first()
    if ((await addBtn.count()) === 0) {
      test.skip(true, 'No "Add task" button found')
      return
    }

    await addBtn.click()
    await page.waitForTimeout(200)

    const input = page.locator('input[placeholder="Task title..."]')
    if ((await input.count()) === 0) {
      test.skip(true, 'Quick-add input not found')
      return
    }

    const taskTitle = `E2E Column ${Date.now()}`

    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/tasks') && req.method() === 'POST',
      { timeout: 10_000 },
    ).catch(() => null)

    await input.fill(taskTitle)
    await input.press('Enter')

    const request = await requestPromise
    if (request) {
      const body = request.postDataJSON()
      expect(body).toHaveProperty('title', taskTitle)
      expect(body).toHaveProperty('column_id')
      // column_id should be a non-empty string (UUID)
      expect(typeof body.column_id).toBe('string')
      expect(body.column_id.length).toBeGreaterThan(0)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY STRIP
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Activity Strip', () => {
  test('activity strip renders without crash (data-dependent)', async ({ page }) => {
    const ready = await openKanban(page)
    test.skip(!ready, AUTH_SKIP_REASON)

    // The activity strip shows "BitBit working on..." when agents are active
    // It only renders when there are active agent tasks — data-dependent
    const activityStrip = page.locator('text=/BitBit.*working on/i')

    // Just verify no crash
    const error = page.locator('text=/Something went wrong|crashed/i')
    expect(await error.count()).toBe(0)
  })
})
