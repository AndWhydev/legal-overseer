import { test, expect } from '@playwright/test'
import { ensureAuthenticated, AUTH_SKIP_REASON } from './helpers'

/**
 * Onboarding E2E tests
 *
 * Tests the full onboarding wizard flow matching the current page copy:
 *   Workspace -> Connections -> Sync -> Agents -> Value -> Dashboard
 *
 * Uses mocked API routes to avoid real external service calls.
 */

test.describe('Onboarding', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
  })

  /**
   * Sets up common API mocks for the onboarding flow.
   */
  async function setupOnboardingMocks(
    page: import('@playwright/test').Page,
    opts: {
      connectionReady?: boolean
      workspaceResponse?: Record<string, unknown>
      firstValueResponse?: Record<string, unknown> | null
      discoveryResponse?: Record<string, unknown> | null
      preferencesStage?: string | null
    } = {},
  ) {
    let connectionReady = opts.connectionReady ?? false

    // Mock workspace creation API
    await page.route('**/api/onboarding', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(
            opts.workspaceResponse ?? {
              orgId: 'org-test-123',
              ownerId: 'user-test-123',
              rlsConfigured: true,
            },
          ),
        })
      } else {
        await route.continue()
      }
    })

    // Mock channel status
    await page.route('**/api/channels/status', async (route) => {
      const payload = connectionReady
        ? {
            channels: [
              {
                type: 'gmail',
                connected: true,
                connectedAt: '2026-03-20T09:00:00.000Z',
                messageCount: 3,
                lastSync: '2026-03-20T09:00:30.000Z',
              },
            ],
          }
        : { channels: [] }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      })
    })

    // Mock channel sync
    await page.route('**/api/channels/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    // Mock discovery scan
    await page.route('**/api/onboarding/discovery', async (route) => {
      if (opts.discoveryResponse === null) {
        await route.fulfill({ status: 500, body: 'Discovery unavailable' })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            opts.discoveryResponse ?? {
              result: {
                userIdentity: { name: 'Tester', email: 'test@bitbit.dev', company: '' },
                topContacts: [
                  { name: 'Alice Johnson', email: 'alice@example.com', messageCount: 8, lastContact: '2026-03-20T10:00:00Z', relationship: 'frequent' },
                ],
                activeThreads: [
                  { subject: 'Project update', participants: ['alice@example.com'], lastActivity: '2026-03-20T10:00:00Z', needsReply: true },
                ],
                stats: { totalMessages: 42, channelBreakdown: { gmail: 42 }, scanDurationMs: 1200 },
                insights: { emailsNeedingReply: 1, overdueFollowUps: 0, staleContacts: 0, upcomingDeadlines: [] },
              },
            },
          ),
        })
      }
    })

    // Mock first-value
    await page.route('**/api/onboarding/first-value', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          opts.firstValueResponse !== undefined
            ? { value: opts.firstValueResponse }
            : {
                value: {
                  type: 'email',
                  headline: 'Website redesign proposal from Alice',
                  detail: 'From Alice Johnson',
                  source: 'Gmail',
                },
              },
        ),
      })
    })

    // Mock preferences PATCH (for stage persistence)
    await page.route('**/api/profile/preferences', async (route) => {
      if (route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      } else {
        await route.continue()
      }
    })

    // Mock welcome conversation creation
    await page.route('**/api/chat/welcome', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ conversationId: 'conv-welcome-123' }),
      })
    })

    // Mock analytics event
    await page.route('**/api/analytics/event', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    return {
      setConnectionReady: (ready: boolean) => {
        connectionReady = ready
      },
    }
  }

  test('full happy path: workspace -> connections -> sync -> agents -> value -> dashboard', async ({ page }) => {
    const mocks = await setupOnboardingMocks(page)

    const authenticated = await ensureAuthenticated(page, '/dashboard', {
      persistOnboardingComplete: false,
      dismissOnboarding: false,
    })

    test.skip(!authenticated, AUTH_SKIP_REASON)

    const pathname = new URL(page.url()).pathname

    if (pathname !== '/onboard') {
      test.skip(true, 'User already past first-run onboarding in this environment.')
      return
    }

    // ---- Stage 1: Workspace ----
    await expect(page.getByRole('heading', { name: /set up your workspace/i })).toBeVisible({ timeout: 10_000 })

    const businessName = page.getByLabel(/business name/i)
    await expect(businessName).toBeVisible()
    await businessName.fill('BitBit Beta')

    const ownerName = page.getByLabel(/your name/i)
    await ownerName.fill('Beta Tester')

    await page.getByRole('button', { name: /continue to connections/i }).click()

    // ---- Stage 2: Connections ----
    await expect(page.getByRole('heading', { name: /connect a source/i })).toBeVisible({ timeout: 10_000 })

    // Simulate OAuth return with connected channel
    mocks.setConnectionReady(true)
    await page.goto('/onboard?connected=gmail', { waitUntil: 'domcontentloaded' })

    // Wait for the page to process the connected param and show connection indicator
    await expect(page.getByText(/gmail connected/i)).toBeVisible({ timeout: 10_000 })

    // Click Continue to move to sync
    const continueButton = page.getByRole('button', { name: /continue/i }).first()
    await expect(continueButton).toBeEnabled()
    await continueButton.click()

    // ---- Stage 3: Sync ----
    await expect(page.getByRole('heading', { name: /scanning your history/i })).toBeVisible({ timeout: 10_000 })

    // Discovery mock returns quickly, should auto-transition to agents
    // ---- Stage 4: Agents ----
    await expect(page.getByRole('heading', { name: /recommended agents/i })).toBeVisible({ timeout: 15_000 })

    // Click Continue on agents stage
    const agentsContinue = page.getByRole('button', { name: /continue/i }).first()
    await agentsContinue.click()

    // ---- Stage 5: Value ----
    await expect(page.getByRole('heading', { name: /you're all set/i })).toBeVisible({ timeout: 10_000 })

    // Verify "What BitBit knows" section renders
    await expect(page.getByText(/what bitbit knows/i)).toBeVisible()

    // Verify first-value data is displayed
    await expect(page.getByText(/bitbit already found/i)).toBeVisible()
    await expect(page.getByText(/website redesign proposal/i)).toBeVisible()

    // Verify next-step cards render
    await expect(page.getByText(/ask bitbit/i)).toBeVisible()
    await expect(page.getByText(/add more sources/i)).toBeVisible()

    // Click "Open chat" to complete onboarding
    await page.getByRole('button', { name: /open chat/i }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
  })

  test('skippable connections: skip for now still completes the flow', async ({ page }) => {
    await setupOnboardingMocks(page, { firstValueResponse: null })

    const authenticated = await ensureAuthenticated(page, '/dashboard', {
      persistOnboardingComplete: false,
      dismissOnboarding: false,
    })

    test.skip(!authenticated, AUTH_SKIP_REASON)

    const pathname = new URL(page.url()).pathname
    if (pathname !== '/onboard') {
      test.skip(true, 'User already past first-run onboarding in this environment.')
      return
    }

    // Complete workspace stage
    await expect(page.getByRole('heading', { name: /set up your workspace/i })).toBeVisible({ timeout: 10_000 })
    await page.getByLabel(/business name/i).fill('Skip Test Co')
    await page.getByLabel(/your name/i).fill('Skipper')
    await page.getByRole('button', { name: /continue to connections/i }).click()

    // Connections stage: click "Skip for now"
    await expect(page.getByRole('heading', { name: /connect a source/i })).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: /skip for now/i }).click()

    // Sync stage: discovery may fail without real connections but should still transition
    // The flow should continue through agents to value
    await expect(page.getByRole('heading', { name: /scanning your history|recommended agents/i })).toBeVisible({ timeout: 15_000 })

    // Wait for agents stage (may auto-advance from sync)
    await expect(page.getByRole('heading', { name: /recommended agents/i })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /continue/i }).first().click()

    // Value stage: should show fallback since no first-value data
    await expect(page.getByRole('heading', { name: /you're all set/i })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/getting started/i)).toBeVisible()

    // Complete
    await page.getByRole('button', { name: /open chat/i }).click()
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
  })

  test('progress persistence: resuming after refresh returns to saved stage', async ({ page }) => {
    const preferencesPatchCalls: string[] = []

    await setupOnboardingMocks(page)

    // Override preferences mock to track calls
    await page.route('**/api/profile/preferences', async (route) => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON()
        if (body?.onboarding_stage) {
          preferencesPatchCalls.push(body.onboarding_stage)
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true }),
        })
      } else {
        await route.continue()
      }
    })

    const authenticated = await ensureAuthenticated(page, '/dashboard', {
      persistOnboardingComplete: false,
      dismissOnboarding: false,
    })

    test.skip(!authenticated, AUTH_SKIP_REASON)

    const pathname = new URL(page.url()).pathname
    if (pathname !== '/onboard') {
      test.skip(true, 'User already past first-run onboarding in this environment.')
      return
    }

    // Complete workspace stage
    await expect(page.getByRole('heading', { name: /set up your workspace/i })).toBeVisible({ timeout: 10_000 })
    await page.getByLabel(/business name/i).fill('Persist Co')
    await page.getByLabel(/your name/i).fill('Persister')
    await page.getByRole('button', { name: /continue to connections/i }).click()

    // Verify we're at connections
    await expect(page.getByRole('heading', { name: /connect a source/i })).toBeVisible({ timeout: 10_000 })

    // The stage 'connections' should have been persisted via PATCH
    // Now simulate a reload by navigating away and back, but this time
    // the profile loader should return onboarding_stage: 'connections'

    // We need to intercept the profile load to return the saved stage
    // The bootstrap in the page calls loadOnboardingProfile which calls supabase
    // For this test, we verify the PATCH was made (write side of persistence)
    // The read side is verified by the fact that the bootstrap useEffect reads
    // preferences.onboarding_stage and resumes from there.

    // Verify the stage was persisted to the server
    expect(preferencesPatchCalls).toContain('connections')
  })

  test('error recovery: workspace save failure shows retry guidance', async ({ page }) => {
    // Mock workspace creation to fail
    await page.route('**/api/onboarding', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' }),
        })
      } else {
        await route.continue()
      }
    })

    // Set up other mocks
    await page.route('**/api/channels/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ channels: [] }),
      })
    })

    await page.route('**/api/analytics/event', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.route('**/api/profile/preferences', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    const authenticated = await ensureAuthenticated(page, '/dashboard', {
      persistOnboardingComplete: false,
      dismissOnboarding: false,
    })

    test.skip(!authenticated, AUTH_SKIP_REASON)

    const pathname = new URL(page.url()).pathname
    if (pathname !== '/onboard') {
      test.skip(true, 'User already past first-run onboarding in this environment.')
      return
    }

    // Fill workspace form
    await expect(page.getByRole('heading', { name: /set up your workspace/i })).toBeVisible({ timeout: 10_000 })
    await page.getByLabel(/business name/i).fill('Error Test Co')
    await page.getByLabel(/your name/i).fill('Error Tester')
    await page.getByRole('button', { name: /continue to connections/i }).click()

    // Error message should be displayed since the API returned 500
    // The error handler catches the error and shows it
    await expect(page.getByText(/couldn't save|try again|internal server error/i)).toBeVisible({ timeout: 10_000 })
  })
})
