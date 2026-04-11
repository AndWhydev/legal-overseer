---
phase: quick-5
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - scripts/channel-smoke-test.ts
  - scripts/smoke-test-results.json
  - personal-assistant/src/lib/agent/tools/superpower-tools.ts
  - personal-assistant/src/lib/agent/tools.ts
  - scripts/onboarding-e2e-test.ts
autonomous: true
requirements: [T011, T010, T027]
must_haves:
  truths:
    - "Smoke tests verify each channel credential works against real APIs (Stripe, Telnyx, Resend, Meta)"
    - "Onboarding E2E test verifies the full signup-to-workspace flow against production APIs"
    - "browse_website tool navigates URLs and returns extracted content via Playwright headless"
  artifacts:
    - path: "scripts/channel-smoke-test.ts"
      provides: "Extended smoke test hitting real Stripe/Telnyx/Resend/Meta APIs"
      contains: "testStripeApiKey"
    - path: "scripts/onboarding-e2e-test.ts"
      provides: "Onboarding flow E2E verification script"
      contains: "testOnboardingFlow"
    - path: "personal-assistant/src/lib/agent/tools/superpower-tools.ts"
      provides: "browse_website tool definition and handler"
      contains: "browse_website"
  key_links:
    - from: "personal-assistant/src/lib/agent/tools/superpower-tools.ts"
      to: "personal-assistant/src/lib/agent/tools.ts"
      via: "superpowerToolDefinitions export consumed by getAgentTools()"
      pattern: "browse_website"
---

<objective>
Channel smoke tests, onboarding E2E verification, and browse_website agent superpower tool.

Purpose: Validate all production channel credentials work, verify the onboarding flow end-to-end, and add the browse_website tool for agent web navigation capability.
Output: Extended smoke test script, onboarding E2E test script, browse_website tool in superpower-tools.ts
</objective>

<execution_context>
@/home/claude/.claude/get-shit-done/workflows/execute-plan.md
@/home/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@scripts/channel-smoke-test.ts
@personal-assistant/src/lib/agent/tools/superpower-tools.ts
@personal-assistant/src/lib/agent/tools.ts
@personal-assistant/src/lib/channels/sms.ts
@personal-assistant/src/lib/channels/stripe.ts
@personal-assistant/src/app/api/onboarding/route.ts
@personal-assistant/src/app/api/onboarding/first-value/route.ts

<interfaces>
<!-- Key types and contracts the executor needs -->

From personal-assistant/src/lib/agent/tools.ts:
```typescript
export type ToolGroup = 'core' | 'memory' | 'channel' | 'web' | 'comms'
export type AgentToolHandler = (
  input: Record<string, unknown>,
  orgId: string,
  supabase: SupabaseClient
) => Promise<ToolResult>
export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
  queued?: boolean
  approvalId?: string
}
// TOOL_GROUPS.web.tools currently: ['web_search', 'fetch_url']
// JIT_INSTRUCTIONS has entries for web_search, fetch_url
```

From personal-assistant/src/lib/agent/tools/superpower-tools.ts:
```typescript
export const superpowerToolDefinitions: Anthropic.Tool[] = [...]
export const superpowerToolHandlers: Record<string, AgentToolHandler> = {...}
// Existing tools: web_search, fetch_url, send_email, send_sms
// Pattern: tool definition in array + handler in Record
```

From scripts/channel-smoke-test.ts:
```typescript
type TestStatus = 'PASS' | 'FAIL' | 'SKIP'
interface TestResult { name: string; status: TestStatus; detail: string; durationMs: number; httpStatus?: number }
// Existing tests: health, channelStatus, gmailOAuth, outlookOAuth, relay, tokenRefresh, whatsAppBridge
// Helper: timedFetch(url, options) — 10s timeout, manual redirect
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Expand channel smoke tests with real API credential verification</name>
  <files>scripts/channel-smoke-test.ts, scripts/smoke-test-results.json</files>
  <action>
Add 5 new test functions to the existing `scripts/channel-smoke-test.ts` that verify real API credentials work by making lightweight, read-only API calls. Insert them after the existing test functions and add them to the `main()` results array.

**1. testStripeApiKey():**
- Read `STRIPE_SECRET_KEY` from env (already loaded from .env.local)
- SKIP if not set
- Call `GET https://api.stripe.com/v1/balance` with `Authorization: Bearer {key}`
- PASS if 200 response
- Return balance info snippet in detail

**2. testTelnyxApiKey():**
- Read `TELNYX_API_KEY` from env
- SKIP if not set
- Call `GET https://api.telnyx.com/v2/messaging_profiles` with `Authorization: Bearer {key}` and `Content-Type: application/json`
- PASS if 200
- Include profile count in detail

**3. testResendApiKey():**
- Read `RESEND_API_KEY` from env
- SKIP if not set
- Call `GET https://api.resend.com/domains` with `Authorization: Bearer {key}`
- PASS if 200
- Include domain count in detail

**4. testMetaWhatsAppToken():**
- Read `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` from env
- SKIP if either not set
- Call `GET https://graph.facebook.com/v21.0/{phone_number_id}?access_token={token}`
- PASS if 200 (token valid)
- FAIL with detail if 401/403 (token expired — note this is expected based on MEMORY.md warning about expired token)

**5. testBraveSearchApiKey():**
- Read `BRAVE_SEARCH_API_KEY` from env
- SKIP if not set
- Call `GET https://api.search.brave.com/res/v1/web/search?q=test&count=1` with `X-Subscription-Token: {key}`
- PASS if 200

Add all 5 to the `main()` results array after existing tests. Keep existing `printResults` and `writeJsonReport` functions unchanged. Do NOT modify any existing test function logic.

Also fix the existing token refresh test: change `method: 'POST'` to `method: 'GET'` since the cron route was returning 405 (Method Not Allowed) — or alternatively try both methods.
  </action>
  <verify>
    <automated>cd /home/claude/bitbit && npx tsx scripts/channel-smoke-test.ts https://app.bitbit.chat 2>&1 | tail -30</automated>
  </verify>
  <done>Smoke test runs all 12 tests (7 existing + 5 new), each channel credential is verified against its real API, JSON report updated. Tests that lack env vars gracefully SKIP.</done>
</task>

<task type="auto">
  <name>Task 2: Create onboarding E2E verification script</name>
  <files>scripts/onboarding-e2e-test.ts</files>
  <action>
Create `scripts/onboarding-e2e-test.ts` — a standalone verification script (same pattern as channel-smoke-test.ts) that verifies the onboarding flow works end-to-end against the deployed app.

**Structure:**
- Same env loading, color helpers, timedFetch, TestResult pattern as channel-smoke-test.ts
- Usage: `npx tsx scripts/onboarding-e2e-test.ts https://app.bitbit.chat`

**Tests to include (6 tests):**

**1. testOnboardingPageLoad():**
- GET `{baseUrl}/onboarding` — expect 200 or 307 redirect to login (both valid)
- Verifies the onboarding route exists and responds

**2. testOnboardingApiReachable():**
- POST `{baseUrl}/api/onboarding` with empty JSON body `{}`
- Expect 400 or 401 (validates the route responds, not that it creates an org)
- FAIL if 404 or 500

**3. testFirstValueApiReachable():**
- POST `{baseUrl}/api/onboarding/first-value` with empty JSON body
- Expect 400 or 401 (validates the route exists)
- FAIL if 404 or 500

**4. testE2eOnboardingHelper():**
- GET `{baseUrl}/api/auth/e2e/onboarding`
- Expect 405 (GET not supported) or 401 (auth required) — both valid, confirms route exists
- FAIL if 404

**5. testSkipOnboardingStep():**
- Check that the skip-for-now feature exists by verifying the onboarding page HTML contains "skip" or similar affordance
- GET `{baseUrl}/onboarding` and check response body (if 200) for skip-related content
- SKIP if redirect (user not authenticated)

**6. testAuthCallbackOAuthReturn():**
- GET `{baseUrl}/api/auth/callback/google` with no params
- Expect 400 (missing code/state) or redirect — both valid, confirms FR-6 callback route exists
- FAIL if 404

**Output:** Same colorized console output + JSON report to `scripts/onboarding-e2e-results.json`
  </action>
  <verify>
    <automated>cd /home/claude/bitbit && npx tsx scripts/onboarding-e2e-test.ts https://app.bitbit.chat 2>&1 | tail -20</automated>
  </verify>
  <done>Onboarding E2E test script runs 6 tests verifying all key onboarding routes exist and respond correctly. JSON report written.</done>
</task>

<task type="auto">
  <name>Task 3: Add browse_website agent superpower tool</name>
  <files>personal-assistant/src/lib/agent/tools/superpower-tools.ts, personal-assistant/src/lib/agent/tools.ts</files>
  <action>
Add a `browse_website` tool to the agent superpower tools following the exact same pattern as the existing `fetch_url` tool.

**In superpower-tools.ts:**

1. Add tool definition to `superpowerToolDefinitions` array:
```typescript
{
  name: 'browse_website',
  description: 'Navigate a website using a headless browser. Unlike fetch_url (which only does HTTP GET), this tool renders JavaScript, handles SPAs, and can interact with dynamic content. Use when fetch_url returns empty/broken content (JS-rendered pages), when you need to see what a page looks like after JavaScript execution, or when dealing with sites that block simple HTTP fetches. Returns extracted page text and optionally a base64 screenshot.',
  input_schema: {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: 'The full URL to browse (must start with http:// or https://)' },
      wait_for: { type: 'string', description: 'Optional CSS selector to wait for before extracting content (e.g. "#main-content", ".article-body")' },
      screenshot: { type: 'boolean', description: 'Whether to capture a screenshot (default: false). Returns base64 PNG.' },
      max_chars: { type: 'number', description: 'Maximum characters of text to return (default: 8000)' },
    },
    required: ['url'],
  },
}
```

2. Add handler to `superpowerToolHandlers`:
```typescript
async browse_website(input) {
  const url = input.url as string
  const waitFor = input.wait_for as string | undefined
  const takeScreenshot = (input.screenshot as boolean) || false
  const maxChars = (input.max_chars as number) || 8000

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { success: false, error: 'URL must start with http:// or https://' }
  }

  try {
    // Dynamic import — Playwright only available where installed
    const { chromium } = await import('playwright')

    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    })

    try {
      const context = await browser.newContext({
        userAgent: 'BitBit-Agent/1.0 (https://bitbit.chat)',
        viewport: { width: 1280, height: 720 },
      })
      const page = await context.newPage()

      // Navigate with timeout
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })

      // Wait for optional selector
      if (waitFor) {
        await page.waitForSelector(waitFor, { timeout: 10000 }).catch(() => {
          // Don't fail if selector not found — still return what we have
          logger.warn('[browse_website] Selector not found, proceeding:', waitFor)
        })
      } else {
        // Brief settle for JS rendering
        await page.waitForTimeout(2000)
      }

      // Extract title
      const title = await page.title()

      // Extract text content
      const text = await page.evaluate(() => {
        // Remove script, style, nav, footer
        const remove = document.querySelectorAll('script, style, noscript, nav, footer, header')
        remove.forEach(el => el.remove())
        return document.body?.innerText || ''
      })

      // Optional screenshot
      let screenshotBase64: string | undefined
      if (takeScreenshot) {
        const buffer = await page.screenshot({ type: 'png', fullPage: false })
        screenshotBase64 = buffer.toString('base64')
      }

      // Get final URL (after redirects)
      const finalUrl = page.url()

      await browser.close()

      const content = text.replace(/\n{3,}/g, '\n\n').trim()

      return {
        success: true,
        data: {
          url: finalUrl,
          title,
          content: content.slice(0, maxChars),
          truncated: content.length > maxChars,
          char_count: content.length,
          screenshot: screenshotBase64 ? `data:image/png;base64,${screenshotBase64.slice(0, 100)}... (${screenshotBase64.length} chars)` : undefined,
          has_screenshot: !!screenshotBase64,
        },
      }
    } catch (pageErr) {
      await browser.close()
      throw pageErr
    }
  } catch (err) {
    // Graceful fallback if Playwright not installed
    if (String(err).includes('Cannot find module') || String(err).includes('ERR_MODULE_NOT_FOUND')) {
      return {
        success: false,
        error: 'browse_website requires Playwright (not installed in this environment). Use fetch_url instead for simple HTTP fetches.'
      }
    }
    logger.error('[browse_website] Error:', err)
    return { success: false, error: `Browse error: ${String(err)}` }
  }
}
```

**In tools.ts:**

1. Add `browse_website` to `TOOL_GROUPS.web.tools` array (after 'fetch_url'):
```typescript
tools: ['web_search', 'fetch_url', 'browse_website'],
```

2. Add JIT instruction for `browse_website` in `JIT_INSTRUCTIONS`:
```typescript
browse_website: 'Use the extracted page content to answer the user\'s question. This content was rendered by a real browser, so JavaScript-generated content is included. If a screenshot was captured, describe what you see. Summarize key points rather than dumping raw text.',
```

Do NOT modify the screenshot data returned to the model — return the full base64 in the actual `data` but only a preview in the `screenshot` field (for token efficiency). Store the full screenshot separately under `screenshot_full` only if `takeScreenshot` is true.

Actually, simplify: return `screenshot_base64` as the full base64 string and let the caller (engine) decide. The preview approach is cleaner for the tool result display.
  </action>
  <verify>
    <automated>cd /home/claude/bitbit/personal-assistant && npx vitest run --reporter=verbose 2>&1 | tail -20</automated>
  </verify>
  <done>browse_website tool definition and handler added to superpower-tools.ts. TOOL_GROUPS.web includes browse_website. JIT instruction added. Graceful fallback when Playwright not installed. Build passes (no type errors).</done>
</task>

</tasks>

<verification>
1. Channel smoke test script compiles and runs: `npx tsx scripts/channel-smoke-test.ts https://app.bitbit.chat`
2. Onboarding E2E test script compiles and runs: `npx tsx scripts/onboarding-e2e-test.ts https://app.bitbit.chat`
3. TypeScript build passes: `cd personal-assistant && npx next build --webpack 2>&1 | tail -5`
4. Vitest passes: `cd personal-assistant && npx vitest run`
5. browse_website tool appears in getAgentTools() output
</verification>

<success_criteria>
- All 12 channel smoke tests run without crash (pass/fail/skip are all acceptable per credential availability)
- Onboarding E2E test script runs 6 tests confirming all routes exist
- browse_website tool is wired into the agent tool system (definition, handler, group, JIT instruction)
- No TypeScript compilation errors introduced
- Playwright gracefully reports unavailable if not installed (no crash)
</success_criteria>

<output>
After completion, create `.planning/quick/5-channel-smoke-tests-onboarding-verificat/5-SUMMARY.md`
</output>
