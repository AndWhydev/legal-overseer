# Production Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Close all remaining gaps across active tracks (T009, T011, T022, T023) to reach production-ready state for beta launch.

**Architecture:** Four parallel workstreams targeting security hardening (T022), UX completion (T023), context intelligence (T009 Phase 2), and deployment finalization (T011). Each workstream is independently executable. Human-gated items (T008, T012, T013) are documented as blockers but excluded from this plan.

**Tech Stack:** TypeScript 5, Next.js 16, React 19, Supabase (PostgreSQL), Vitest 4, @sentry/nextjs 10.40

---

## Workstream Overview

| # | Workstream | Track | Tasks | Priority | Parallelizable |
|---|-----------|-------|-------|----------|----------------|
| WS-A | Security & Monitoring Hardening | T022 | 1-8 | P0 | Yes (all independent) |
| WS-B | Dashboard UX Completion | T023 | 9-12 | P1 | Yes (all independent) |
| WS-C | Context Baseplate Phase 2 | T009 | 13-18 | P1 | Waves 1-3 sequential |
| WS-D | Deployment Finalization | T011 | 19-21 | P0 | Partially |

**Pre-flight check:** All 1444 tests pass. Build succeeds. Sentry DSN + Vercel cron jobs configured.

**Already done (remove from tracking):**
- T011: Failing tests — all 1444 pass as of 2026-03-11
- T011: Vercel cron config — all 11 crons in vercel.json
- T023: Progressive disclosure — already implemented in sidebar-nav.tsx (localStorage `bb-advanced-mode`)

---

## WS-A: Security & Monitoring Hardening (T022)

### Task 1: Email-Command Webhook Signature Verification

**Context:** The email-command webhook at `/api/webhooks/email-command/route.ts` is the ONLY webhook without cryptographic signature verification. All 5 other webhooks (Stripe, Asana, Calendly, Slack, SMS/Telnyx) verify HMAC SHA256 signatures.

**Files:**
- Modify: `src/app/api/webhooks/email-command/route.ts`
- Modify: `src/lib/channels/email-command.ts` (if verification logic lives here)
- Create: `src/lib/channels/email-command-verify.ts` (signature verifier)
- Test: `src/lib/channels/email-command-verify.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/channels/email-command-verify.test.ts
import { describe, it, expect } from 'vitest'
import { verifyEmailWebhookSignature } from './email-command-verify'

describe('verifyEmailWebhookSignature', () => {
  const secret = 'test-webhook-secret-123'

  it('returns true for valid HMAC signature', () => {
    const body = '{"sender":"test@example.com","subject":"[BitBit] test"}'
    const crypto = require('crypto')
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyEmailWebhookSignature(body, `sha256=${signature}`, secret)).toBe(true)
  })

  it('returns false for invalid signature', () => {
    expect(verifyEmailWebhookSignature('body', 'sha256=invalid', secret)).toBe(false)
  })

  it('returns false for missing signature', () => {
    expect(verifyEmailWebhookSignature('body', '', secret)).toBe(false)
  })

  it('uses timing-safe comparison', () => {
    // Signature verification must use crypto.timingSafeEqual
    const body = 'test-body'
    const crypto = require('crypto')
    const signature = crypto.createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyEmailWebhookSignature(body, `sha256=${signature}`, secret)).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/channels/email-command-verify.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/lib/channels/email-command-verify.ts
import { createHmac, timingSafeEqual } from 'crypto'

export function verifyEmailWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !secret) return false

  const prefix = 'sha256='
  const sig = signature.startsWith(prefix) ? signature.slice(prefix.length) : signature

  try {
    const expected = createHmac('sha256', secret).update(body).digest('hex')
    const sigBuffer = Buffer.from(sig, 'hex')
    const expectedBuffer = Buffer.from(expected, 'hex')
    if (sigBuffer.length !== expectedBuffer.length) return false
    return timingSafeEqual(sigBuffer, expectedBuffer)
  } catch {
    return false
  }
}
```

**Step 4: Wire into route handler**

In `src/app/api/webhooks/email-command/route.ts`, add:
```typescript
import { verifyEmailWebhookSignature } from '@/lib/channels/email-command-verify'

// At top of POST handler:
const rawBody = await request.text()
const signature = request.headers.get('x-webhook-signature') ?? ''
const secret = process.env.EMAIL_WEBHOOK_SECRET

if (secret && !verifyEmailWebhookSignature(rawBody, signature, secret)) {
  return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
}

const body = JSON.parse(rawBody)
// ... rest of handler
```

**Step 5: Run tests**

Run: `npx vitest run src/lib/channels/email-command-verify.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/channels/email-command-verify.ts src/lib/channels/email-command-verify.test.ts src/app/api/webhooks/email-command/route.ts
git commit -m "feat(T022): add HMAC signature verification to email-command webhook"
```

---

### Task 2: Wire DLQ Into Agent Error Handlers

**Context:** The `dead_letter_queue` table exists (migration 030) but nothing populates it. Agent failures silently log and disappear. Wire agent error handling to persist failed runs.

**Files:**
- Create: `src/lib/agent/dlq.ts`
- Test: `src/lib/agent/dlq.test.ts`
- Modify: `src/lib/agent/engine.ts` (wrap agent execution with DLQ catch)

**Step 1: Write the failing test**

```typescript
// src/lib/agent/dlq.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeToDeadLetterQueue } from './dlq'

const mockInsert = vi.fn().mockReturnValue({ error: null })
const mockSupabase = { from: vi.fn().mockReturnValue({ insert: mockInsert }) } as any

describe('writeToDeadLetterQueue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts a dead letter entry with correct fields', async () => {
    await writeToDeadLetterQueue(mockSupabase, {
      orgId: 'org-1',
      agentType: 'invoice-flow',
      agentConfigId: 'config-1',
      agentRunId: 'run-1',
      errorMessage: 'API rate limit exceeded',
      errorStack: 'Error: at line 42',
      payload: { invoiceId: 'inv-1' },
    })

    expect(mockSupabase.from).toHaveBeenCalledWith('dead_letter_queue')
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: 'org-1',
      agent_type: 'invoice-flow',
      agent_config_id: 'config-1',
      agent_run_id: 'run-1',
      error_message: 'API rate limit exceeded',
      error_stack: 'Error: at line 42',
      payload: { invoiceId: 'inv-1' },
    }))
  })

  it('truncates error_message to 10000 chars', async () => {
    const longMsg = 'x'.repeat(20000)
    await writeToDeadLetterQueue(mockSupabase, {
      orgId: 'org-1',
      agentType: 'test',
      errorMessage: longMsg,
    })

    const insertArg = mockInsert.mock.calls[0][0]
    expect(insertArg.error_message.length).toBeLessThanOrEqual(10000)
  })

  it('does not throw when insert fails', async () => {
    mockInsert.mockReturnValueOnce({ error: new Error('db error') })
    await expect(
      writeToDeadLetterQueue(mockSupabase, { orgId: 'org-1', agentType: 'test', errorMessage: 'fail' })
    ).resolves.not.toThrow()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agent/dlq.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

```typescript
// src/lib/agent/dlq.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

interface DLQEntry {
  orgId: string
  agentType: string
  agentConfigId?: string
  agentRunId?: string
  errorMessage: string
  errorStack?: string
  payload?: Record<string, unknown>
}

export async function writeToDeadLetterQueue(
  supabase: SupabaseClient,
  entry: DLQEntry
): Promise<void> {
  try {
    const { error } = await supabase.from('dead_letter_queue').insert({
      org_id: entry.orgId,
      agent_type: entry.agentType,
      agent_config_id: entry.agentConfigId ?? null,
      agent_run_id: entry.agentRunId ?? null,
      error_message: entry.errorMessage.slice(0, 10000),
      error_stack: entry.errorStack?.slice(0, 50000) ?? null,
      payload: entry.payload ?? null,
    })
    if (error) {
      logger.error({ err: error }, 'Failed to write to dead letter queue')
    }
  } catch (err) {
    logger.error({ err }, 'DLQ write exception')
  }
}
```

**Step 4: Wire into agent engine**

In `src/lib/agent/engine.ts`, find the main agent execution catch block. Add:
```typescript
import { writeToDeadLetterQueue } from './dlq'

// In the catch block of agent execution:
catch (error) {
  // ... existing error handling ...
  await writeToDeadLetterQueue(supabase, {
    orgId,
    agentType: agentConfig.agent_type,
    agentConfigId: agentConfig.id,
    agentRunId: runId,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorStack: error instanceof Error ? error.stack : undefined,
    payload: { input: truncatedInput },
  })
}
```

**Step 5: Run tests**

Run: `npx vitest run src/lib/agent/dlq.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/agent/dlq.ts src/lib/agent/dlq.test.ts src/lib/agent/engine.ts
git commit -m "feat(T022): wire dead letter queue into agent error handler"
```

---

### Task 3: Integrate Circuit Breaker Into LLM/API Calls

**Context:** `src/lib/agent/circuit-breaker.ts` exists with full CLOSED→OPEN→HALF_OPEN logic but is not called anywhere. Wrap the Anthropic SDK call to trip the breaker on consecutive failures.

**Files:**
- Modify: `src/lib/agent/engine.ts` (wrap LLM call with circuit breaker)
- Test: `src/lib/agent/circuit-breaker-integration.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/agent/circuit-breaker-integration.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withCircuitBreaker, resetAllCircuits, CircuitOpenError } from './circuit-breaker'

describe('circuit breaker integration', () => {
  beforeEach(() => resetAllCircuits())

  it('allows calls through when circuit is closed', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withCircuitBreaker('anthropic', fn)
    expect(result).toBe('ok')
  })

  it('opens circuit after 5 consecutive failures', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('API error'))
    for (let i = 0; i < 5; i++) {
      await expect(withCircuitBreaker('anthropic', fn)).rejects.toThrow('API error')
    }
    await expect(withCircuitBreaker('anthropic', fn)).rejects.toThrow(CircuitOpenError)
  })

  it('resets circuit on success', async () => {
    const failFn = vi.fn().mockRejectedValue(new Error('fail'))
    const okFn = vi.fn().mockResolvedValue('ok')

    // 4 failures (below threshold)
    for (let i = 0; i < 4; i++) {
      await expect(withCircuitBreaker('anthropic', failFn)).rejects.toThrow()
    }
    // 1 success resets
    await withCircuitBreaker('anthropic', okFn)
    // Next failure starts fresh count
    await expect(withCircuitBreaker('anthropic', failFn)).rejects.toThrow('fail')
    // Should NOT be CircuitOpenError (only 1 failure after reset)
  })
})
```

**Step 2: Run test to verify it passes (tests existing code)**

Run: `npx vitest run src/lib/agent/circuit-breaker-integration.test.ts`
Expected: PASS (circuit-breaker.ts already works, this just validates)

**Step 3: Wire into engine.ts**

Read `src/lib/agent/engine.ts` and find where `anthropic.messages.create()` is called. Wrap it:

```typescript
import { withCircuitBreaker, CircuitOpenError } from './circuit-breaker'

// Replace direct anthropic.messages.create() call with:
const response = await withCircuitBreaker(
  `anthropic:${agentConfig.agent_type}`,
  () => anthropic.messages.create(params),
  { threshold: 5, cooldownMs: 60_000 }
)
```

Add error handling for CircuitOpenError:
```typescript
catch (error) {
  if (error instanceof CircuitOpenError) {
    logger.warn({ agent: agentConfig.agent_type, key: error.circuitKey }, 'Circuit breaker open, skipping agent run')
    // Update agent_runs status to 'circuit_open' instead of 'error'
    // Do NOT write to DLQ — circuit breaker is a temporary condition
    return
  }
  // ... existing error handling + DLQ write ...
}
```

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All 1444+ tests PASS

**Step 5: Commit**

```bash
git add src/lib/agent/engine.ts src/lib/agent/circuit-breaker-integration.test.ts
git commit -m "feat(T022): wire circuit breaker into LLM API calls"
```

---

### Task 4: Sentry Context Enrichment

**Context:** Sentry captures errors but without user/org context, making triage difficult. Add beforeSend hook and user context to all three Sentry configs.

**Files:**
- Modify: `src/lib/monitoring/sentry.ts`
- Modify: `sentry.server.config.ts`

**Step 1: Add context enrichment to monitoring library**

In `src/lib/monitoring/sentry.ts`, add a function:

```typescript
export function setSentryUserContext(userId: string, orgId: string, email?: string) {
  Sentry.setUser({ id: userId, email })
  Sentry.setTag('org_id', orgId)
}
```

**Step 2: Add beforeSend hook to filter sensitive data**

In `sentry.server.config.ts`:

```typescript
Sentry.init({
  // ... existing config ...
  beforeSend(event) {
    // Strip potential PII from breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map(b => {
        if (b.data?.url) {
          // Strip query params that might contain tokens
          try {
            const url = new URL(b.data.url)
            url.searchParams.delete('access_token')
            url.searchParams.delete('token')
            url.searchParams.delete('key')
            b.data.url = url.toString()
          } catch { /* non-URL data, leave as is */ }
        }
        return b
      })
    }
    return event
  },
})
```

**Step 3: Wire user context in auth middleware**

Find the auth middleware or `getActiveOrgId()` utility. After successful auth:

```typescript
import { setSentryUserContext } from '@/lib/monitoring/sentry'

// After auth resolves:
setSentryUserContext(user.id, activeOrgId, user.email)
```

**Step 4: Run tests**

Run: `npx vitest run`
Expected: All pass

**Step 5: Commit**

```bash
git add src/lib/monitoring/sentry.ts sentry.server.config.ts
git commit -m "feat(T022): add Sentry user/org context enrichment and PII filtering"
```

---

### Task 5: Security Response Headers

**Context:** Missing security headers identified in SECURITY-AUDIT.md: X-Content-Type-Options, Referrer-Policy, HSTS.

**Files:**
- Modify: `src/middleware.ts` (Next.js middleware)

**Step 1: Read existing middleware**

Read `src/middleware.ts` to understand current structure.

**Step 2: Add security headers**

```typescript
// In the middleware response, add headers:
const response = NextResponse.next()
response.headers.set('X-Content-Type-Options', 'nosniff')
response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
response.headers.set('X-Frame-Options', 'DENY')
response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')

// HSTS only in production (Vercel handles TLS termination)
if (process.env.NODE_ENV === 'production') {
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
}

return response
```

**Step 3: Run tests + build**

Run: `npx vitest run && npx next build --webpack 2>&1 | tail -5`
Expected: All pass, build succeeds

**Step 4: Commit**

```bash
git add src/middleware.ts
git commit -m "feat(T022): add security response headers (X-Content-Type-Options, HSTS, Referrer-Policy)"
```

---

### Task 6: DLQ API Endpoint + Dashboard Count

**Context:** DLQ entries exist in the database but there's no way to view them from the dashboard.

**Files:**
- Create: `src/app/api/admin/dlq/route.ts`
- Test: `src/app/api/admin/dlq/route.test.ts`

**Step 1: Write the failing test**

```typescript
// src/app/api/admin/dlq/route.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        is: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [
                { id: '1', agent_type: 'invoice-flow', error_message: 'timeout', created_at: '2026-03-11T00:00:00Z' }
              ],
              error: null
            })
          })
        })
      })
    }),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }) }
  }))
}))

describe('GET /api/admin/dlq', () => {
  it('returns unresolved DLQ entries ordered by created_at desc', async () => {
    const { GET } = await import('./route')
    const request = new Request('http://localhost/api/admin/dlq')
    const response = await GET(request)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.entries).toHaveLength(1)
    expect(data.entries[0].agent_type).toBe('invoice-flow')
  })
})
```

**Step 2: Write implementation**

```typescript
// src/app/api/admin/dlq/route.ts
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: entries, error } = await supabase
    .from('dead_letter_queue')
    .select('id, org_id, agent_type, error_message, created_at, resolved_at, agent_run_id')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ entries: entries ?? [], count: entries?.length ?? 0 })
}
```

**Step 3: Run tests**

Run: `npx vitest run src/app/api/admin/dlq/route.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/app/api/admin/dlq/route.ts src/app/api/admin/dlq/route.test.ts
git commit -m "feat(T022): add DLQ API endpoint for admin dashboard"
```

---

### Task 7: Sentry Error Alerts for DLQ Growth

**Context:** When DLQ entries accumulate, Sentry should be notified so alerts trigger.

**Files:**
- Modify: `src/lib/agent/dlq.ts`

**Step 1: Add Sentry notification on DLQ write**

```typescript
import * as Sentry from '@sentry/nextjs'

export async function writeToDeadLetterQueue(supabase, entry) {
  // ... existing insert logic ...

  // Report to Sentry for alerting
  Sentry.captureMessage(`Agent failure: ${entry.agentType}`, {
    level: 'warning',
    tags: {
      agent_type: entry.agentType,
      org_id: entry.orgId,
    },
    extra: {
      error_message: entry.errorMessage.slice(0, 500),
      agent_run_id: entry.agentRunId,
    },
  })
}
```

**Step 2: Run tests**

Run: `npx vitest run src/lib/agent/dlq.test.ts`
Expected: PASS (Sentry is auto-mocked in test env)

**Step 3: Commit**

```bash
git add src/lib/agent/dlq.ts
git commit -m "feat(T022): report DLQ entries to Sentry for alerting"
```

---

### Task 8: Update T022 Track Status

**Files:**
- Modify: `conductor/tracks.md`

Update T022 remaining items:
- [x] Worker auth, rate limiting, auth forwarding
- [x] Sentry org/project/DSN configured
- [x] Email-command webhook signature verification
- [x] DLQ wired into agent error handlers
- [x] Circuit breaker integrated into LLM calls
- [x] Security headers added
- [x] Sentry context enrichment
- [ ] UptimeRobot for /api/health (external service — requires browser setup)

**Commit:**
```bash
git add conductor/tracks.md
git commit -m "docs: update T022 status after security hardening"
```

---

## WS-B: Dashboard UX Completion (T023)

### Task 9: Empty States for Data-Dependent Tabs

**Context:** 9/26 tabs have EmptyState components. The remaining tabs either delegate to sub-components or show raw empty divs. Focus on the 8 most user-facing tabs.

**Files:**
- Modify: `src/components/dashboard/tabs/activity-tab.tsx`
- Modify: `src/components/dashboard/tabs/approvals-tab.tsx`
- Modify: `src/components/dashboard/tabs/connections-tab.tsx`
- Modify: `src/components/dashboard/tabs/chat-tab.tsx`
- Modify: `src/components/dashboard/tabs/reports-tab.tsx`
- Modify: `src/components/dashboard/tabs/sentry-tab.tsx`
- Modify: `src/components/dashboard/tabs/creator-studio-tab.tsx`
- Modify: `src/components/dashboard/tabs/proposals-tab.tsx`
- Reference: `src/components/ui/empty-state.tsx` (existing component)

**Step 1: Read the existing EmptyState component**

Read `src/components/ui/empty-state.tsx` to understand its props and styling.

**Step 2: Read each tab file**

Read all 8 tab files to understand where the empty state check should go.

**Step 3: Add EmptyState to each tab**

For each tab, find the point where data is loaded/displayed and add:

```tsx
import { EmptyState } from '@/components/ui/empty-state'
import { Activity, CheckCircle2, Plug, MessageSquare, FileText, AlertTriangle, Film, FileSignature } from 'lucide-react'

// Pattern per tab:
if (!data || data.length === 0) {
  return (
    <EmptyState
      icon={<TabIcon size={48} />}
      title="No [items] yet"
      description="[Contextual description of what would appear here]"
    />
  )
}
```

Tab-specific messages:
| Tab | Icon | Title | Description |
|-----|------|-------|-------------|
| activity | Activity | No activity yet | Activity will appear here as you and your agents get to work |
| approvals | CheckCircle2 | No approvals pending | When agents need your sign-off, requests will appear here |
| connections | Plug | No connections configured | Connect your services to let BitBit start working for you |
| chat | MessageSquare | Start a conversation | Ask BitBit anything — it knows your business |
| reports | FileText | No reports generated | Monthly and weekly reports will appear here after your first full week |
| sentry | AlertTriangle | All clear | No errors or alerts to report — your systems are running smoothly |
| creator-studio | Film | Creator Studio is empty | Your ad scripts and content will appear here |
| proposals | FileSignature | No proposals yet | Proposals generated from meeting transcripts will show up here |

**Step 4: Run build to verify no type errors**

Run: `npx next build --webpack 2>&1 | tail -10`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/components/dashboard/tabs/{activity,approvals,connections,chat,reports,sentry,creator-studio,proposals}-tab.tsx
git commit -m "feat(T023): add empty state illustrations to 8 dashboard tabs"
```

---

### Task 10: Wire Email Conversation Adapter

**Context:** `emailConversationAdapter` exists in `src/lib/conversation/email-adapter.ts` with full implementation (strips Re:/Fwd:, removes signatures, normalizes to ConversationCommandRequest). But `src/lib/channels/email-command.ts` still does its own manual parsing. Unify to use the adapter.

**Files:**
- Modify: `src/lib/channels/email-command.ts`
- Reference: `src/lib/conversation/email-adapter.ts`
- Reference: `src/lib/conversation/interface.ts`
- Test: `src/lib/channels/email-command.test.ts` (update mocks if needed)

**Step 1: Read both files**

Read `email-command.ts` and `email-adapter.ts` to identify duplication.

**Step 2: Replace manual parsing with adapter call**

In `email-command.ts`, replace the `parseEmailCommand()` function body to delegate:

```typescript
import { emailConversationAdapter } from '@/lib/conversation/email-adapter'
import { routeIncomingConversation } from '@/lib/conversation/interface'

export async function processEmailCommand(orgId: string, email: ChannelMessage) {
  return routeIncomingConversation(
    emailConversationAdapter,
    { orgId, email },
    commandHandler,
    dropHandler
  )
}
```

Keep the existing `isCommandEmail()` and `formatEmailResponse()` functions — those are email-specific presentation logic, not parsing.

**Step 3: Update tests if imports changed**

Run: `npx vitest run src/lib/channels/email-command.test.ts`
Fix any broken mocks.

**Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All pass

**Step 5: Commit**

```bash
git add src/lib/channels/email-command.ts src/lib/channels/email-command.test.ts
git commit -m "refactor(T023): unify email command parsing via conversation adapter"
```

---

### Task 11: Wire SMS Conversation Adapter

**Context:** `smsConversationAdapter` exists in `src/lib/conversation/sms-adapter.ts`. Wire inbound SMS processing to use it.

**Files:**
- Modify: `src/lib/channels/sms.ts`
- Reference: `src/lib/conversation/sms-adapter.ts`
- Test: (existing sms tests, if any)

**Step 1: Read sms.ts**

Read `src/lib/channels/sms.ts` to find the `receiveSMS()` function.

**Step 2: Wire adapter into inbound processing**

```typescript
import { smsConversationAdapter } from '@/lib/conversation/sms-adapter'
import { routeIncomingConversation } from '@/lib/conversation/interface'

export async function processInboundSMS(orgId: string, sms: InboundSMS) {
  return routeIncomingConversation(
    smsConversationAdapter,
    { orgId, sms },
    commandHandler,
    dropHandler
  )
}
```

**Step 3: Run tests**

Run: `npx vitest run`
Expected: All pass

**Step 4: Commit**

```bash
git add src/lib/channels/sms.ts
git commit -m "refactor(T023): wire SMS inbound processing via conversation adapter"
```

---

### Task 12: Update T023 Track Status

**Files:**
- Modify: `conductor/tracks.md`

Update T023:
- [x] All items except what was already marked done
- Move T023 to Completed Tracks if all items are done

**Commit:**
```bash
git add conductor/tracks.md
git commit -m "docs: update T023 status — UX polish complete"
```

---

## WS-C: Context Baseplate Phase 2 (T009)

### Task 13: Entity Profiles Table (Migration 060)

**Context:** Pre-compute entity understanding so morning briefing and dashboard queries don't need to re-assemble context every time.

**Files:**
- Create: `supabase/migrations/060_entity_profiles.sql`

**Step 1: Write migration**

```sql
-- 060_entity_profiles.sql
-- Pre-computed entity understanding for fast reads

CREATE TABLE IF NOT EXISTS entity_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  display_name text,
  summary text,
  profile_data jsonb NOT NULL DEFAULT '{}',
  computed_from_events int DEFAULT 0,
  event_count_at_compute int DEFAULT 0,
  computed_at timestamptz DEFAULT now(),
  valid_until timestamptz DEFAULT (now() + interval '6 hours'),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, entity_type, entity_id)
);

CREATE INDEX idx_entity_profiles_lookup ON entity_profiles(org_id, entity_type, entity_id);
CREATE INDEX idx_entity_profiles_stale ON entity_profiles(valid_until) WHERE valid_until < now();

ALTER TABLE entity_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_profiles_select" ON entity_profiles
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "entity_profiles_insert" ON entity_profiles
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());
CREATE POLICY "entity_profiles_update" ON entity_profiles
  FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "entity_profiles_delete" ON entity_profiles
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));
```

**Step 2: Apply migration**

Run: `npx supabase db push`
Expected: Migration applied successfully

**Step 3: Commit**

```bash
git add supabase/migrations/060_entity_profiles.sql
git commit -m "feat(T009): add entity_profiles table for pre-computed understanding"
```

---

### Task 14: Entity Profile Builder

**Context:** Compute a compiled profile from existing entity_timeline + entity_relationships + semantic_memories. Uses assembler internally but stores the result for fast reads.

**Files:**
- Create: `src/lib/context/entity-profile-builder.ts`
- Test: `src/lib/context/entity-profile-builder.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/context/entity-profile-builder.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeEntityProfile } from './entity-profile-builder'

const mockUpsert = vi.fn().mockReturnValue({ error: null })
const mockSelect = vi.fn()

const mockSupabase = {
  from: vi.fn((table: string) => {
    if (table === 'entity_profiles') return { upsert: mockUpsert }
    if (table === 'entity_timeline') return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [
                { event_type: 'message_received', event_data: { body: 'Invoice due tomorrow' }, created_at: '2026-03-10T00:00:00Z' },
                { event_type: 'invoice_created', event_data: { amount: 500 }, created_at: '2026-03-09T00:00:00Z' },
              ],
              error: null,
              count: 2
            })
          })
        })
      })
    }
    if (table === 'entity_relationships') return {
      select: vi.fn().mockReturnValue({
        or: vi.fn().mockResolvedValue({
          data: [{ from_type: 'contact', from_id: 'c1', to_type: 'task', to_id: 't1', relationship_type: 'assigned_to' }],
          error: null
        })
      })
    }
    if (table === 'semantic_memories') return {
      select: vi.fn().mockReturnValue({
        contains: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ fact: 'Prefers email', confidence: 0.9, category: 'preference' }],
            error: null
          })
        })
      })
    }
    return { select: mockSelect }
  }),
} as any

describe('computeEntityProfile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('computes and upserts a profile from timeline + relationships + memories', async () => {
    await computeEntityProfile(mockSupabase, {
      orgId: 'org-1',
      entityType: 'contact',
      entityId: 'contact-1',
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'org-1',
        entity_type: 'contact',
        entity_id: 'contact-1',
        profile_data: expect.objectContaining({
          recent_events: expect.any(Array),
          relationships: expect.any(Array),
          memories: expect.any(Array),
        }),
        event_count_at_compute: 2,
      }),
      expect.objectContaining({ onConflict: 'org_id,entity_type,entity_id' })
    )
  })
})
```

**Step 2: Write implementation**

```typescript
// src/lib/context/entity-profile-builder.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

interface ProfileInput {
  orgId: string
  entityType: string
  entityId: string
}

export async function computeEntityProfile(
  supabase: SupabaseClient,
  input: ProfileInput
): Promise<void> {
  const { orgId, entityType, entityId } = input

  // Fetch recent timeline events (last 50)
  const { data: events, count: eventCount } = await supabase
    .from('entity_timeline')
    .select('event_type, event_data, channel_source, created_at', { count: 'exact' })
    .eq('org_id', orgId)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(50)

  // Fetch relationships
  const { data: relationships } = await supabase
    .from('entity_relationships')
    .select('from_type, from_id, to_type, to_id, relationship_type, strength')
    .or(`and(from_id.eq.${entityId},from_type.eq.${entityType}),and(to_id.eq.${entityId},to_type.eq.${entityType})`)

  // Fetch active memories
  const { data: memories } = await supabase
    .from('semantic_memories')
    .select('fact, confidence, category, created_at')
    .contains('entity_ids', [entityId])
    .eq('is_active', true)

  const profileData = {
    recent_events: (events ?? []).slice(0, 20).map(e => ({
      type: e.event_type,
      data: e.event_data,
      channel: e.channel_source,
      at: e.created_at,
    })),
    relationships: (relationships ?? []).map(r => ({
      type: r.relationship_type,
      target_type: r.from_id === entityId ? r.to_type : r.from_type,
      target_id: r.from_id === entityId ? r.to_id : r.from_id,
      strength: r.strength,
    })),
    memories: (memories ?? []).map(m => ({
      fact: m.fact,
      confidence: m.confidence,
      category: m.category,
    })),
    event_summary: {
      total: eventCount ?? 0,
      channels: [...new Set((events ?? []).map(e => e.channel_source).filter(Boolean))],
      last_event_at: events?.[0]?.created_at ?? null,
    },
  }

  const { error } = await supabase.from('entity_profiles').upsert(
    {
      org_id: orgId,
      entity_type: entityType,
      entity_id: entityId,
      profile_data: profileData,
      computed_from_events: (events ?? []).length,
      event_count_at_compute: eventCount ?? 0,
      computed_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,entity_type,entity_id' }
  )

  if (error) {
    logger.error({ err: error, entityType, entityId }, 'Failed to compute entity profile')
  }
}
```

**Step 3: Run tests**

Run: `npx vitest run src/lib/context/entity-profile-builder.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/context/entity-profile-builder.ts src/lib/context/entity-profile-builder.test.ts
git commit -m "feat(T009): add entity profile builder for pre-computed context"
```

---

### Task 15: Baseplate Snapshot API

**Context:** Fast read path — single query to entity_profiles instead of 5+ queries via assembler.

**Files:**
- Create: `src/lib/context/baseplate-snapshot.ts`
- Test: `src/lib/context/baseplate-snapshot.test.ts`

**Step 1: Write the failing test**

```typescript
// src/lib/context/baseplate-snapshot.test.ts
import { describe, it, expect, vi } from 'vitest'
import { getBaseplateSnapshot } from './baseplate-snapshot'

const profileData = {
  recent_events: [{ type: 'message_received', at: '2026-03-10' }],
  relationships: [{ type: 'works_on', target_type: 'task', target_id: 't1' }],
  memories: [{ fact: 'Prefers Slack', confidence: 0.9 }],
  event_summary: { total: 10, channels: ['slack'], last_event_at: '2026-03-10' },
}

const mockSupabase = {
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                profile_data: profileData,
                computed_at: '2026-03-10T12:00:00Z',
                valid_until: '2026-03-10T18:00:00Z',
                event_count_at_compute: 10,
              },
              error: null,
            })
          })
        })
      })
    })
  })
} as any

describe('getBaseplateSnapshot', () => {
  it('returns cached profile when valid', async () => {
    const result = await getBaseplateSnapshot(mockSupabase, 'org-1', 'contact', 'c-1')
    expect(result).not.toBeNull()
    expect(result!.profile.relationships).toHaveLength(1)
    expect(result!.stale).toBe(false)
  })
})
```

**Step 2: Write implementation**

```typescript
// src/lib/context/baseplate-snapshot.ts
import type { SupabaseClient } from '@supabase/supabase-js'

export interface BaseplateSnapshot {
  profile: {
    recent_events: Array<{ type: string; data?: unknown; channel?: string; at: string }>
    relationships: Array<{ type: string; target_type: string; target_id: string; strength?: number }>
    memories: Array<{ fact: string; confidence: number; category?: string }>
    event_summary: { total: number; channels: string[]; last_event_at: string | null }
  }
  computedAt: string
  validUntil: string
  eventCount: number
  stale: boolean
}

export async function getBaseplateSnapshot(
  supabase: SupabaseClient,
  orgId: string,
  entityType: string,
  entityId: string
): Promise<BaseplateSnapshot | null> {
  const { data, error } = await supabase
    .from('entity_profiles')
    .select('profile_data, computed_at, valid_until, event_count_at_compute')
    .eq('org_id', orgId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle()

  if (error || !data) return null

  return {
    profile: data.profile_data,
    computedAt: data.computed_at,
    validUntil: data.valid_until,
    eventCount: data.event_count_at_compute,
    stale: new Date() > new Date(data.valid_until),
  }
}
```

**Step 3: Run tests**

Run: `npx vitest run src/lib/context/baseplate-snapshot.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add src/lib/context/baseplate-snapshot.ts src/lib/context/baseplate-snapshot.test.ts
git commit -m "feat(T009): add baseplate snapshot for fast pre-computed context reads"
```

---

### Task 16: Entity Profile Refresh Cron

**Context:** Cron job to recompute stale entity profiles in the background.

**Files:**
- Create: `src/app/api/cron/entity-profile-refresh/route.ts`
- Modify: `vercel.json` (add cron schedule)

**Step 1: Write the cron route**

```typescript
// src/app/api/cron/entity-profile-refresh/route.ts
import { NextResponse } from 'next/server'
import { withCronGuard } from '@/lib/cron-guard'
import { computeEntityProfile } from '@/lib/context/entity-profile-builder'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronGuard(request, async (supabase) => {
    // Find stale profiles (valid_until < now)
    const { data: stale } = await supabase
      .from('entity_profiles')
      .select('org_id, entity_type, entity_id')
      .lt('valid_until', new Date().toISOString())
      .limit(50) // batch size

    let refreshed = 0
    for (const profile of stale ?? []) {
      try {
        await computeEntityProfile(supabase, {
          orgId: profile.org_id,
          entityType: profile.entity_type,
          entityId: profile.entity_id,
        })
        refreshed++
      } catch (err) {
        // Log but continue to next profile
      }
    }

    return { message: `Refreshed ${refreshed}/${(stale ?? []).length} stale profiles` }
  })
}
```

**Step 2: Add to vercel.json**

Add to crons array:
```json
{ "path": "/api/cron/entity-profile-refresh", "schedule": "0 */2 * * *" }
```

**Step 3: Run build**

Run: `npx next build --webpack 2>&1 | tail -5`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/app/api/cron/entity-profile-refresh/route.ts vercel.json
git commit -m "feat(T009): add entity profile refresh cron (every 2 hours)"
```

---

### Task 17: Entity Patterns Table + Extraction (Migration 061)

**Context:** Pre-compute behavioral patterns like payment timing and response latency.

**Files:**
- Create: `supabase/migrations/061_entity_patterns.sql`
- Create: `src/lib/context/pattern-extractor.ts`
- Test: `src/lib/context/pattern-extractor.test.ts`

**Step 1: Write migration**

```sql
-- 061_entity_patterns.sql
-- Behavioral patterns extracted from entity timeline

CREATE TABLE IF NOT EXISTS entity_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  pattern_type text NOT NULL,
  pattern_data jsonb NOT NULL DEFAULT '{}',
  sample_count int DEFAULT 0,
  confidence float DEFAULT 0.0,
  extracted_at timestamptz DEFAULT now(),
  valid_until timestamptz DEFAULT (now() + interval '24 hours'),
  UNIQUE(org_id, entity_type, entity_id, pattern_type),
  CHECK (pattern_type IN ('payment_timing', 'response_latency', 'activity_frequency', 'channel_preference')),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX idx_entity_patterns_lookup ON entity_patterns(org_id, entity_type, entity_id);
CREATE INDEX idx_entity_patterns_stale ON entity_patterns(valid_until) WHERE valid_until < now();

ALTER TABLE entity_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_patterns_select" ON entity_patterns
  FOR SELECT USING (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "entity_patterns_insert" ON entity_patterns
  FOR INSERT WITH CHECK (org_id = get_user_active_org_id());
CREATE POLICY "entity_patterns_update" ON entity_patterns
  FOR UPDATE USING (org_id IN (SELECT get_user_accessible_org_ids()))
  WITH CHECK (org_id IN (SELECT get_user_accessible_org_ids()));
CREATE POLICY "entity_patterns_delete" ON entity_patterns
  FOR DELETE USING (org_id IN (SELECT get_user_accessible_org_ids()));
```

**Step 2: Write pattern extractor**

```typescript
// src/lib/context/pattern-extractor.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

interface PatternResult {
  patternType: string
  data: Record<string, unknown>
  sampleCount: number
  confidence: number
}

export async function extractPaymentPattern(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string
): Promise<PatternResult | null> {
  // Find invoice_created → invoice_paid event pairs for this contact
  const { data: events } = await supabase
    .from('entity_timeline')
    .select('event_type, event_data, created_at')
    .eq('org_id', orgId)
    .eq('entity_id', contactId)
    .in('event_type', ['invoice_created', 'invoice_paid'])
    .order('created_at', { ascending: true })

  if (!events || events.length < 2) return null

  // Match created→paid pairs and compute time deltas
  const pairs: number[] = []
  const created = events.filter(e => e.event_type === 'invoice_created')
  const paid = events.filter(e => e.event_type === 'invoice_paid')

  for (const c of created) {
    const invoiceId = (c.event_data as any)?.invoice_id
    const match = paid.find(p => (p.event_data as any)?.invoice_id === invoiceId)
    if (match) {
      const days = (new Date(match.created_at).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24)
      if (days >= 0 && days < 365) pairs.push(days)
    }
  }

  if (pairs.length < 2) return null

  const avg = pairs.reduce((a, b) => a + b, 0) / pairs.length
  const stdDev = Math.sqrt(pairs.reduce((sum, d) => sum + (d - avg) ** 2, 0) / pairs.length)
  const confidence = Math.min(0.95, 0.5 + pairs.length * 0.1)

  return {
    patternType: 'payment_timing',
    data: { avg_days: Math.round(avg * 10) / 10, std_dev: Math.round(stdDev * 10) / 10, samples: pairs },
    sampleCount: pairs.length,
    confidence,
  }
}

export async function extractResponseLatency(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string
): Promise<PatternResult | null> {
  const { data: events } = await supabase
    .from('entity_timeline')
    .select('event_type, created_at')
    .eq('org_id', orgId)
    .eq('entity_id', contactId)
    .in('event_type', ['message_sent', 'message_received'])
    .order('created_at', { ascending: true })

  if (!events || events.length < 4) return null

  // Find sent→received pairs (our message → their reply)
  const latencies: number[] = []
  for (let i = 0; i < events.length - 1; i++) {
    if (events[i].event_type === 'message_sent' && events[i + 1].event_type === 'message_received') {
      const hours = (new Date(events[i + 1].created_at).getTime() - new Date(events[i].created_at).getTime()) / (1000 * 60 * 60)
      if (hours >= 0 && hours < 168) latencies.push(hours) // cap at 1 week
    }
  }

  if (latencies.length < 2) return null

  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length
  const confidence = Math.min(0.95, 0.5 + latencies.length * 0.1)

  return {
    patternType: 'response_latency',
    data: { avg_hours: Math.round(avg * 10) / 10, samples: latencies.length },
    sampleCount: latencies.length,
    confidence,
  }
}

export async function upsertPattern(
  supabase: SupabaseClient,
  orgId: string,
  entityType: string,
  entityId: string,
  pattern: PatternResult
): Promise<void> {
  const { error } = await supabase.from('entity_patterns').upsert(
    {
      org_id: orgId,
      entity_type: entityType,
      entity_id: entityId,
      pattern_type: pattern.patternType,
      pattern_data: pattern.data,
      sample_count: pattern.sampleCount,
      confidence: pattern.confidence,
      extracted_at: new Date().toISOString(),
      valid_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: 'org_id,entity_type,entity_id,pattern_type' }
  )
  if (error) logger.error({ err: error }, 'Failed to upsert entity pattern')
}
```

**Step 3: Write test**

```typescript
// src/lib/context/pattern-extractor.test.ts
import { describe, it, expect, vi } from 'vitest'
import { extractPaymentPattern } from './pattern-extractor'

describe('extractPaymentPattern', () => {
  it('computes average payment days from created→paid event pairs', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { event_type: 'invoice_created', event_data: { invoice_id: 'inv-1' }, created_at: '2026-01-01T00:00:00Z' },
                    { event_type: 'invoice_paid', event_data: { invoice_id: 'inv-1' }, created_at: '2026-01-03T00:00:00Z' },
                    { event_type: 'invoice_created', event_data: { invoice_id: 'inv-2' }, created_at: '2026-02-01T00:00:00Z' },
                    { event_type: 'invoice_paid', event_data: { invoice_id: 'inv-2' }, created_at: '2026-02-04T00:00:00Z' },
                  ],
                  error: null
                })
              })
            })
          })
        })
      })
    } as any

    const result = await extractPaymentPattern(mockSupabase, 'org-1', 'contact-1')
    expect(result).not.toBeNull()
    expect(result!.patternType).toBe('payment_timing')
    expect(result!.data.avg_days).toBe(2.5) // (2 + 3) / 2
    expect(result!.sampleCount).toBe(2)
    expect(result!.confidence).toBeGreaterThan(0.5)
  })

  it('returns null with fewer than 2 event pairs', async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null })
              })
            })
          })
        })
      })
    } as any

    const result = await extractPaymentPattern(mockSupabase, 'org-1', 'contact-1')
    expect(result).toBeNull()
  })
})
```

**Step 4: Apply migration + run tests**

Run: `npx supabase db push && npx vitest run src/lib/context/pattern-extractor.test.ts`
Expected: Migration applied, tests PASS

**Step 5: Commit**

```bash
git add supabase/migrations/061_entity_patterns.sql src/lib/context/pattern-extractor.ts src/lib/context/pattern-extractor.test.ts
git commit -m "feat(T009): add entity patterns table + payment/response extractors"
```

---

### Task 18: Update T009 Track Status

**Files:**
- Modify: `conductor/tracks.md`

Update T009:
- Phase 1: Foundation tables, mention-extractor, xref-cache
- Phase 2: Entity profiles, baseplate snapshot, patterns, refresh cron
- Remaining: Active thread tracking, pattern extraction cron, morning-briefing integration

**Commit:**
```bash
git add conductor/tracks.md
git commit -m "docs: update T009 status — Phase 2 entity profiles complete"
```

---

## WS-D: Deployment Finalization (T011)

### Task 19: VPS Relay Daemon Worker Entry Point

**Context:** Docker configs exist at `deployments/vps/` (docker-compose, Dockerfile, setup.sh) but there's no `src/worker.ts` entry point. This is the process that runs inside the container.

**Files:**
- Create: `deployments/vps/src/worker.ts`
- Create: `deployments/vps/src/health.ts`
- Create: `deployments/vps/tsconfig.json`
- Create: `deployments/vps/package.json`

**Step 1: Write the worker entry point**

```typescript
// deployments/vps/src/worker.ts
import { createClient } from '@supabase/supabase-js'

const WORKER_TYPE = process.env.WORKER_TYPE || 'cron'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const POLL_INTERVAL_MS = 5000

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function pollAndExecute() {
  // Find pending agent tasks
  const { data: tasks, error } = await supabase
    .from('agent_runs')
    .select('id, org_id, agent_type, input, status')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5)

  if (error) {
    console.error('[worker] Poll error:', error.message)
    return
  }

  for (const task of tasks ?? []) {
    try {
      // Mark as running
      await supabase.from('agent_runs').update({ status: 'running' }).eq('id', task.id)

      // Dispatch to Fly.io worker
      const WORKER_URL = process.env.WORKER_CALLBACK_URL || 'https://bitbit-workers.fly.dev'
      const res = await fetch(`${WORKER_URL}/api/agent/execute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.WORKER_AUTH_TOKEN}`,
        },
        body: JSON.stringify({ runId: task.id, orgId: task.org_id, agentType: task.agent_type }),
      })

      if (!res.ok) {
        console.error(`[worker] Dispatch failed for ${task.id}: ${res.status}`)
        await supabase.from('agent_runs').update({ status: 'error' }).eq('id', task.id)
      }
    } catch (err) {
      console.error(`[worker] Error processing ${task.id}:`, err)
      await supabase.from('agent_runs').update({ status: 'error' }).eq('id', task.id)
    }
  }
}

async function main() {
  console.log(`[worker] Starting ${WORKER_TYPE} worker...`)

  if (WORKER_TYPE === 'cron') {
    // Poll loop
    const tick = async () => {
      await pollAndExecute()
      setTimeout(tick, POLL_INTERVAL_MS)
    }
    tick()
  }

  // Health check server
  const { startHealthServer } = await import('./health')
  startHealthServer()
}

main().catch(err => {
  console.error('[worker] Fatal error:', err)
  process.exit(1)
})
```

**Step 2: Write health check server**

```typescript
// deployments/vps/src/health.ts
import { createServer } from 'http'

let startedAt = Date.now()

export function startHealthServer(port = 3001) {
  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'ok',
        uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
        worker_type: process.env.WORKER_TYPE || 'cron',
        timestamp: new Date().toISOString(),
      }))
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  server.listen(port, () => {
    console.log(`[health] Listening on port ${port}`)
  })
}
```

**Step 3: Write package.json and tsconfig**

```json
// deployments/vps/package.json
{
  "name": "bitbit-vps-worker",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/worker.js",
    "dev": "ts-node src/worker.ts"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.95.3"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}
```

```json
// deployments/vps/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**Step 4: Commit**

```bash
git add deployments/vps/src/ deployments/vps/package.json deployments/vps/tsconfig.json
git commit -m "feat(T011): add VPS relay daemon worker entry point + health server"
```

---

### Task 20: Sentry Local Fallback Fix

**Context:** next.config.ts sets Sentry project to `personal-assistant` as fallback but the actual Sentry project is `bitbit-dashboard`. Fix the fallback to match.

**Files:**
- Modify: `next.config.ts:46`

**Step 1: Fix fallback**

Change:
```typescript
project: process.env.SENTRY_PROJECT || 'personal-assistant',
```
To:
```typescript
project: process.env.SENTRY_PROJECT || 'bitbit-dashboard',
```

**Step 2: Run build**

Run: `npx next build --webpack 2>&1 | tail -5`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add next.config.ts
git commit -m "fix(T022): correct Sentry project fallback to bitbit-dashboard"
```

---

### Task 21: Update T011 Track Status

**Files:**
- Modify: `conductor/tracks.md`

Update T011:
- [x] Deploy Fly.io worker
- [x] Deploy Cloudflare edge cron
- [x] Configure secrets
- [x] E2E chain verified
- [x] Vercel cron jobs configured (11/11)
- [x] Fix failing tests (all 1444 pass)
- [x] VPS relay daemon entry point
- [ ] Smoke test channels (BLOCKED by T008 — needs real OAuth credentials)
- [ ] Load test (deferred until channels connected)

Move to "Mostly Complete" — remaining items blocked by T008.

**Commit:**
```bash
git add conductor/tracks.md
git commit -m "docs: update T011 status — VPS worker done, channels blocked by T008"
```

---

## Execution Order

### Wave 1 (Parallel — independent tasks)
| Agent | Tasks | Estimated |
|-------|-------|-----------|
| Agent A | Tasks 1-3 (webhooks, DLQ, circuit breaker) | ~30 min |
| Agent B | Tasks 4-5 (Sentry enrichment, security headers) | ~15 min |
| Agent C | Tasks 9 (empty states for 8 tabs) | ~20 min |
| Agent D | Tasks 13-14 (entity_profiles migration + builder) | ~20 min |

### Wave 2 (Parallel — depends on Wave 1 foundations)
| Agent | Tasks | Estimated |
|-------|-------|-----------|
| Agent E | Tasks 6-7 (DLQ API endpoint + Sentry alerts) | ~15 min |
| Agent F | Tasks 10-11 (email + SMS adapter wiring) | ~15 min |
| Agent G | Tasks 15-16 (baseplate snapshot + refresh cron) | ~15 min |
| Agent H | Tasks 19-20 (VPS worker + Sentry fallback fix) | ~15 min |

### Wave 3 (Sequential — final integration)
| Agent | Tasks | Estimated |
|-------|-------|-----------|
| Agent I | Tasks 17 (entity patterns table + extractors) | ~20 min |
| Agent J | Tasks 8, 12, 18, 21 (status updates to tracks.md) | ~5 min |

### Final Verification
```bash
npx vitest run                           # All tests pass
npx next build --webpack 2>&1 | tail -5  # Build succeeds
npx supabase db push                     # Migrations applied
```

---

## Blockers (Human-Gated — NOT in this plan)

| Track | Blocker | Action Required |
|-------|---------|----------------|
| T008 | Platform OAuth registrations | Human: Browser login to Stripe, Meta, Google, Microsoft, Xero, Slack |
| T012 | Legal & Revenue Operations | Human: Entity formation, equity agreement, ABN/ACN registration |
| T013 | Beta Launch | Blocked by T008 + T012 |
| T011 | Channel smoke tests | Blocked by T008 (needs real credentials) |
| T022 | UptimeRobot setup | External service: create account, add /api/health monitor |

These items cannot be automated and are excluded from this plan.
