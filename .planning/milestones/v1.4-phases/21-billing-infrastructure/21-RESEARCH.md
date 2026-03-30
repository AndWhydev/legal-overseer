# Phase 21: Billing Infrastructure - Research

**Researched:** 2026-03-19
**Domain:** Stripe subscription billing, webhook handling, plan gating, usage metering, trial management
**Confidence:** HIGH

## Summary

Phase 21 completes the billing infrastructure that is already 70-90% built. The existing codebase has `plan-gates.ts` (4 tiers), `usage-metering.ts`, `trial-manager.ts`, `dunning.ts`, `checkout.ts`, two webhook routes, a subscriptions table, a usage_events table, a webhook_events table, a pricing page, and billing API routes. The work is hardening and fixing, not greenfield.

There are three critical defects to fix: (1) two overlapping Stripe webhook routes must be consolidated into one, (2) ad-hoc Stripe Price creation per checkout must be replaced with pre-created Products/Prices, and (3) the trial duration is hardcoded to 14 days but the spec requires 30. Beyond those fixes, the phase adds growth role plan gating at the tool execution layer, Stripe Customer Portal for self-service, trial expiry notifications, and a usage dashboard in the billing settings UI.

**Primary recommendation:** Install the `stripe` SDK (v20.4.1), consolidate webhook routes first, then fix checkout to use pre-created prices. Plan gating goes into `executeAgentTool()` as a single guard before the handler call.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BILL-01 | Stripe webhook routes consolidated into single handler with event routing and idempotency | Two existing routes found at `/api/billing/webhook` and `/api/webhooks/stripe`. Both use same `verifyStripeWebhook()`. Consolidate into one with `webhook_events.external_event_id` dedup |
| BILL-02 | Stripe Products and Prices pre-created (replace ad-hoc price creation per checkout) | `checkout.ts` lines 83-95 create new Price per checkout. Replace with env var price IDs: `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_SCALE` |
| BILL-03 | Subscription lifecycle works end-to-end (create, upgrade, downgrade, cancel) | `handleSubscriptionEvent()` handles created/updated/cancelled. Missing: upgrade/downgrade via Stripe Customer Portal, `trial_will_end` handler |
| BILL-04 | Plan gating enforced at tool execution layer (growth tools gated) | `executeAgentTool()` at tools.ts:793 is the single chokepoint. Add plan gate check before handler call using `PLAN_FEATURES` growth role mapping |
| BILL-05 | Usage metering wired into agent run logger | Already wired -- `run-logger.ts` calls `trackUsage()` for `agent_run` and `token_usage`. Storage tracking needs wiring via attachment upload flow |
| BILL-06 | 30-day free trial with feature access matching growth plan | `trial-manager.ts` line 27 hardcodes 14 days, `checkout.ts` line 113 hardcodes 14. Change both to 30. `createTrial()` sets tier param (already supports growth) |
| BILL-07 | Trial conversion and expiry notifications via email | Missing `customer.subscription.trial_will_end` handler. Stripe fires this 3 days before trial end. Need email via existing `sendCommandReplyEmail()` |
| BILL-08 | Pricing page with plan comparison and live Stripe Checkout integration | Pricing page exists at `src/app/(public)/pricing/page.tsx`. Currently links to GET `/api/billing/checkout?tier=X`. Needs `@stripe/stripe-js` for proper Checkout redirect |
| BILL-09 | Stripe Customer Portal for self-service plan management | Not built. Requires `stripe.billingPortal.sessions.create()`. Add portal session endpoint and link from billing settings |
| BILL-10 | Dunning sequence handles failed payments with escalating notifications | Already built in `dunning.ts` -- 5-step sequence (day 0, 1, 3, 7, 14). Needs integration with consolidated webhook handler |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` | ^20.4.1 | Type-safe Stripe API calls (checkout, subscriptions, portal, webhooks) | Official SDK. Current code uses raw fetch -- typed SDK prevents billing bugs. Server-only, 300KB |
| `@stripe/stripe-js` | ^8.10.0 | Client-side Stripe.js loader for Checkout redirect | Required for PCI compliance. Loads from js.stripe.com CDN. ~2KB loader |

### Already Installed (DO NOT ADD)
| Library | Version | Purpose |
|---------|---------|---------|
| `@supabase/supabase-js` | 2.95.3 | DB client, storage API |
| `resend` | 6.9.2 | Email transport for trial/dunning emails |
| `@anthropic-ai/sdk` | 0.74.0 | AI SDK (agent engine) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `stripe` SDK | Raw fetch (current approach) | Raw fetch works but no types, no retry logic, no idempotency key helpers, manual URL encoding -- risky for billing |
| `@stripe/stripe-js` | Manual `<script>` tag | Works but needs global type declarations, no tree-shaking, harder to manage in Next.js |

**Installation:**
```bash
cd personal-assistant && npm install stripe @stripe/stripe-js
```

**Environment Variables Needed:**
```env
# Already configured (verify)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# New for Phase 21
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_PRICE_STARTER=price_...        # Pre-created in Stripe Dashboard
STRIPE_PRICE_GROWTH=price_...         # Pre-created in Stripe Dashboard
STRIPE_PRICE_SCALE=price_...          # Pre-created in Stripe Dashboard
```

## Architecture Patterns

### Recommended Project Structure
```
src/lib/billing/
  checkout.ts              # MODIFY: use pre-created prices, stripe SDK
  plan-gates.ts            # MODIFY: add growthRoles field, growth_tool gate action
  usage-metering.ts        # EXISTING: already wired via run-logger.ts
  trial-manager.ts         # MODIFY: 14->30 days, add email notification
  dunning.ts               # EXISTING: works, wire into consolidated webhook
  subscription-handler.ts  # NEW: centralized event dispatcher for all webhook events

src/app/api/billing/
  webhook/route.ts         # REWRITE: consolidate both webhook routes here
  checkout/route.ts        # MODIFY: use stripe SDK, pre-created prices
  subscription/route.ts    # EXISTING: works
  usage/route.ts           # EXISTING: works
  portal/route.ts          # NEW: create Customer Portal session

src/app/api/webhooks/
  stripe/route.ts          # DELETE: consolidate into /api/billing/webhook

src/app/(public)/pricing/
  page.tsx                 # MODIFY: use @stripe/stripe-js for Checkout redirect

src/components/settings/
  billing-settings.tsx     # NEW: current plan, usage dashboard, portal link
```

### Pattern 1: Consolidated Webhook with Event Router
**What:** Single webhook endpoint dispatches to handler functions by event type, with idempotency via `webhook_events.external_event_id`
**When to use:** Always -- Stripe sends all events to one endpoint
**Example:**
```typescript
// Source: Stripe docs + existing webhook_events table
export async function POST(req: NextRequest) {
  const event = await verifyAndParse(req)

  // Idempotency check
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('external_event_id', event.id)
    .eq('status', 'success')
    .maybeSingle()
  if (existing) return NextResponse.json({ received: true }) // Already processed

  // Log event
  await logWebhookEvent(supabase, 'stripe', event.type, event.id, event.data.object, 'processing')

  // Dispatch
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await handleSubscriptionLifecycle(supabase, event)
      break
    case 'customer.subscription.trial_will_end':
      await handleTrialEnding(supabase, event)
      break
    case 'invoice.paid':
      await handleInvoicePaid(supabase, event)
      break
    case 'invoice.payment_failed':
      await handlePaymentFailed(supabase, event)
      break
    case 'checkout.session.completed':
      await handleCheckoutComplete(supabase, event)
      break
  }

  // Mark success
  await updateWebhookStatus(supabase, event.id, 'success')
  return NextResponse.json({ received: true })
}
```

### Pattern 2: Plan Gate at Tool Execution Layer
**What:** Check plan features in `executeAgentTool()` before calling handler. Return upgrade prompt if gated.
**When to use:** For all growth role tools (SEO, ads, content, tenders)
**Example:**
```typescript
// Source: existing executeAgentTool() at tools.ts:793
// Map tool names to required plan features
const TOOL_PLAN_GATE: Record<string, PlanName> = {
  'audit_visibility': 'growth',
  'generate_seo_content': 'growth',
  'generate_ad_scripts': 'growth',
  'search_tenders': 'scale',
  // ... etc
}

// Inside executeAgentTool, before handler call:
const requiredPlan = TOOL_PLAN_GATE[name]
if (requiredPlan) {
  const orgPlan = await getOrgPlan(supabase, orgId)
  const planOrder = ['free', 'starter', 'growth', 'scale']
  if (planOrder.indexOf(orgPlan) < planOrder.indexOf(requiredPlan)) {
    return {
      success: false,
      error: `This tool requires the ${requiredPlan} plan or higher. You're on the ${orgPlan} plan. Upgrade at /pricing`
    }
  }
}
```

### Pattern 3: Stripe Customer Portal Session
**What:** Create a short-lived portal session for self-service plan management
**When to use:** From billing settings page for upgrade/downgrade/cancel/payment update
**Example:**
```typescript
// Source: Stripe Customer Portal API docs
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  // Look up stripe_customer_id from subscriptions table
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${origin}/dashboard/settings`,
  })
  return NextResponse.json({ url: session.url })
}
```

### Anti-Patterns to Avoid
- **Ad-hoc Price creation per checkout:** The current `checkout.ts` creates a new Stripe Price object every checkout. This creates thousands of duplicate prices and breaks proration. Use pre-created Prices.
- **Two webhook routes:** The current `/api/billing/webhook` (subscription events) and `/api/webhooks/stripe` (payment/invoice events) overlap and risk double-processing. Consolidate into one.
- **Plan gating at frontend only:** The pricing page hides features, but API callers can bypass. Gate at `executeAgentTool()` server-side.
- **Trusting metadata.tier over price ID:** The current `handleSubscriptionEvent` reads `metadata.tier` which is set at checkout but not guaranteed to be correct on updates/downgrades. Map `price_id -> tier` using env vars as the source of truth.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook signature verification | Custom HMAC code | `stripe.webhooks.constructEvent()` | The current hand-rolled verification in `channels/stripe.ts` works but is fragile. The SDK handles edge cases (timing tolerance, encoding). |
| Customer Portal UI | Custom plan management pages | Stripe Customer Portal | Stripe hosts the UI for updating payment methods, cancelling, upgrading. PCI compliant out of the box. |
| Payment retry logic | Custom retry system | Stripe Smart Retries + dunning.ts | Stripe's built-in Smart Retries handle most payment recovery. `dunning.ts` adds notification layer on top. |
| Usage-based billing | Custom metering infra | Existing `usage_events` table + `getUsage()` | Already built and wired into run-logger. Just surface in UI. |

**Key insight:** The billing infrastructure is 70-90% built. This phase is about hardening existing code and fixing known defects, not building from scratch.

## Common Pitfalls

### Pitfall 1: Webhook Route Returns Non-200, Triggering Stripe Retry Storm
**What goes wrong:** Webhook processing fails (DB error, timeout), returns 4xx/5xx, Stripe retries aggressively (immediately, 5min, 30min, 2hr...)
**Why it happens:** The existing `/api/webhooks/stripe` returns 400 on catch. Vercel 30s timeout can kill long processing.
**How to avoid:** Always return 200 to Stripe. Log errors internally. The existing `/api/billing/webhook` already does this (returns 200 in catch block). Apply same pattern to consolidated route.
**Warning signs:** Stripe Dashboard > Webhooks shows repeated delivery attempts for the same event.

### Pitfall 2: Checkout Redirect Arrives Before Webhook
**What goes wrong:** User completes Stripe Checkout, redirected to `/dashboard?checkout=success`, tries to use paid features, but plan hasn't updated because webhook hasn't fired yet.
**Why it happens:** HTTP redirect is faster than webhook delivery. Stripe fires webhook asynchronously.
**How to avoid:** On success redirect, poll `/api/billing/subscription` for up to 10 seconds. Show "Setting up your plan..." interstitial. Alternatively, use `checkout.session.completed` webhook to update plan and poll for that.
**Warning signs:** Users report "I paid but still see the free plan" on first page load after checkout.

### Pitfall 3: Org-to-Subscription Mapping Fails for New Customers
**What goes wrong:** `handleSubscriptionEvent` looks up org by `stripe_subscription_id`, but for `created` events the subscription doesn't exist in the table yet. Falls through to `org_id: null`.
**Why it happens:** The subscription lookup returns null because the row hasn't been inserted yet. Current code: line 164-170 in `checkout.ts`.
**How to avoid:** For `created` events, extract `org_id` from `subscription.metadata.org_id` (set in checkout session creation at line 104). Also store `stripe_customer_id` on the organizations table for reliable fallback lookup.
**Warning signs:** Subscriptions table has rows with `org_id = null`.

### Pitfall 4: Trial Duration Mismatch
**What goes wrong:** Code says 14 days (trial-manager.ts line 27, checkout.ts line 113), but REQUIREMENTS.md says 30 days. Pricing page copy says 14. Inconsistency creates customer support issues.
**Why it happens:** Initial implementation used 14 as placeholder, spec changed to 30.
**How to avoid:** Single constant: `const TRIAL_PERIOD_DAYS = 30`. Used by createTrial(), checkout session creation, pricing page copy, trial status checks. Update in all locations.
**Warning signs:** Trial ends unexpectedly early for customers.

### Pitfall 5: Column Name Mismatch: `tier` vs `plan`
**What goes wrong:** The `subscriptions` table has a `plan` column (migration 028), but `handleSubscriptionEvent` in `checkout.ts` writes to `tier` (line 174). The `getOrgPlan()` function reads from `plan` column. If they're different columns, writes go to `tier` but reads come from `plan`, which is always `'free'`.
**Why it happens:** Code was written at different times with inconsistent naming.
**How to avoid:** Audit all code paths. The canonical column is `plan` (defined in migration 028, read by `getOrgPlan()`). All writes must use `plan`, not `tier`. The `handleSubscriptionEvent` upsert must write to `plan`.
**Warning signs:** After successful checkout, `getOrgPlan()` still returns `'free'`.

## Code Examples

### Pre-Created Price Checkout Session
```typescript
// Source: Stripe Checkout docs + existing checkout.ts
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const TIER_PRICE_IDS: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER!,
  growth: process.env.STRIPE_PRICE_GROWTH!,
  scale: process.env.STRIPE_PRICE_SCALE!,
}

const TRIAL_PERIOD_DAYS = 30

export async function createCheckoutSession(
  input: CheckoutSessionInput,
): Promise<{ sessionId: string; url: string }> {
  const priceId = TIER_PRICE_IDS[input.tier]
  if (!priceId) throw new Error(`No price configured for tier: ${input.tier}`)

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer_email: input.customerEmail,
    subscription_data: {
      trial_period_days: TRIAL_PERIOD_DAYS,
      metadata: { org_id: input.orgId, tier: input.tier },
    },
    payment_method_collection: 'always', // Collect card during trial
  })

  return { sessionId: session.id, url: session.url! }
}
```

### Idempotent Webhook Handler
```typescript
// Source: Stripe webhook best practices + existing webhook_events table
async function processWebhookIdempotent(
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  // Check if already processed
  const { data: existing } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('external_event_id', event.id)
    .eq('status', 'success')
    .maybeSingle()

  if (existing) return // Already processed -- idempotent

  // Insert processing record
  await supabase.from('webhook_events').insert({
    source: 'stripe',
    event_type: event.type,
    external_event_id: event.id,
    payload: event.data.object as Record<string, unknown>,
    status: 'processing',
  })

  // Process event...

  // Mark success
  await supabase
    .from('webhook_events')
    .update({ status: 'success', processed_at: new Date().toISOString() })
    .eq('external_event_id', event.id)
}
```

### Plan-Gated Tool Execution
```typescript
// Source: existing executeAgentTool at tools.ts:793
// Add before handler call:
const TOOL_PLAN_REQUIREMENTS: Record<string, PlanName> = {
  audit_visibility: 'growth',
  generate_seo_content: 'growth',
  generate_schema_markup: 'growth',
  visibility_report: 'growth',
  generate_ad_scripts: 'growth',
  list_ad_batches: 'growth',
  adapt_script: 'growth',
  schedule_post: 'growth',
  generate_blog: 'growth',
  content_calendar: 'growth',
  search_tenders: 'scale',
  score_tender: 'scale',
  generate_tender_response: 'scale',
}

const requiredPlan = TOOL_PLAN_REQUIREMENTS[name]
if (requiredPlan) {
  const orgPlan = await getOrgPlan(supabase, orgId)
  const order: PlanName[] = ['free', 'starter', 'growth', 'scale']
  if (order.indexOf(orgPlan) < order.indexOf(requiredPlan)) {
    return {
      success: false,
      error: `${name} requires the ${requiredPlan} plan. You're on ${orgPlan}. Upgrade at /pricing to unlock this feature.`,
    }
  }
}
```

### Trial Expiry Email
```typescript
// Source: existing sendCommandReplyEmail + trial-manager.ts
async function handleTrialEnding(
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription
  const orgId = subscription.metadata.org_id
  if (!orgId) return

  const { data: org } = await supabase
    .from('organizations')
    .select('name, metadata')
    .eq('id', orgId)
    .single()

  const billingEmail = (org?.metadata as any)?.billing_email
  if (!billingEmail) return

  await sendCommandReplyEmail(
    billingEmail,
    'Your BitBit trial ends in 3 days',
    `<div style="...">
      <h2>Your trial is ending soon</h2>
      <p>Your 30-day free trial for <strong>${org?.name}</strong> ends in 3 days.</p>
      <p>To continue using BitBit, ensure your payment method is up to date.</p>
      <a href="${getAppUrl()}/dashboard/settings">Manage Billing</a>
    </div>`,
  )

  // Mark notification sent
  await supabase
    .from('subscriptions')
    .update({ metadata: { ...subscription.metadata, trial_end_notified: true } })
    .eq('stripe_subscription_id', subscription.id)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw fetch to Stripe API | Stripe Node SDK v20+ | v20.4.1 current | Type safety, automatic retries, idempotency helpers |
| Ad-hoc price per checkout | Pre-created Products/Prices in Dashboard | Stripe best practice | Clean dashboard, reliable tier mapping, proration works |
| Separate webhook routes per concern | Single consolidated webhook endpoint | Best practice | No event double-processing, simpler configuration |
| Manual Customer Portal UI | Stripe-hosted Customer Portal | Available since 2020 | PCI compliant, handles payment method updates, proration preview |

**Deprecated/outdated:**
- `checkout.ts` ad-hoc price creation: Must be replaced before any real customers
- 14-day trial constant: Must be updated to 30 days per spec
- `/api/webhooks/stripe` route: Must be consolidated into `/api/billing/webhook`

## Open Questions

1. **Stripe Products/Prices setup**
   - What we know: Need `starter`, `growth`, `scale` products with monthly AUD prices ($199, $349, $599)
   - What's unclear: Whether to create via Stripe Dashboard manually or via a setup script
   - Recommendation: Create via Dashboard (one-time), store Price IDs as env vars. Simpler, no script maintenance.

2. **Payment method collection during trial**
   - What we know: `payment_method_collection: 'always'` collects card upfront; `'if_required'` skips it
   - What's unclear: User preference -- lower friction (no card) vs. higher conversion (card collected)
   - Recommendation: Use `'always'` -- collect card during trial. Higher conversion rate, smoother trial-to-paid transition. Pricing page already says "Start Free Trial" which implies card-free, so update copy to match.

3. **Usage dashboard scope**
   - What we know: `getUsage()` returns tokens, agent_runs, storage_mb for a billing period. `agent_runs` table has per-run cost estimates.
   - What's unclear: How much detail to show (per-tool breakdown? daily chart? just totals?)
   - Recommendation: Start with totals + progress bars (used/limit). Per-tool breakdown is Phase 22+ territory.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via vitest.config.ts) |
| Config file | `personal-assistant/vitest.config.ts` |
| Quick run command | `cd personal-assistant && npx vitest run src/lib/billing/` |
| Full suite command | `cd personal-assistant && npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BILL-01 | Webhook consolidation + idempotency | unit | `npx vitest run src/lib/billing/subscription-handler.test.ts -x` | Wave 0 |
| BILL-02 | Pre-created prices in checkout | unit | `npx vitest run src/lib/billing/checkout.test.ts -x` | Wave 0 |
| BILL-03 | Subscription lifecycle (create/upgrade/downgrade/cancel) | unit | `npx vitest run src/lib/billing/subscription-handler.test.ts -x` | Wave 0 |
| BILL-04 | Plan gating at tool execution layer | unit | `npx vitest run src/lib/billing/plan-gates.test.ts -x` | Exists (extend) |
| BILL-05 | Usage metering wired into run logger | unit | `npx vitest run src/lib/billing/usage-metering.test.ts -x` | Exists |
| BILL-06 | 30-day trial duration | unit | `npx vitest run src/lib/billing/trial-manager.test.ts -x` | Exists (update) |
| BILL-07 | Trial expiry notifications | unit | `npx vitest run src/lib/billing/subscription-handler.test.ts -x` | Wave 0 |
| BILL-08 | Pricing page + Checkout redirect | manual-only | Manual: load /pricing, click tier, verify Checkout redirect | N/A |
| BILL-09 | Customer Portal session creation | unit | `npx vitest run src/lib/billing/checkout.test.ts -x` | Wave 0 |
| BILL-10 | Dunning sequence | unit | `npx vitest run src/lib/billing/dunning.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `cd personal-assistant && npx vitest run src/lib/billing/`
- **Per wave merge:** `cd personal-assistant && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/billing/subscription-handler.test.ts` -- covers BILL-01, BILL-03, BILL-07
- [ ] `src/lib/billing/checkout.test.ts` -- covers BILL-02, BILL-09
- [ ] `src/lib/billing/dunning.test.ts` -- covers BILL-10 (dunning.ts has no tests)
- [ ] Update `src/lib/billing/trial-manager.test.ts` -- update 14-day expectations to 30-day for BILL-06
- [ ] Extend `src/lib/billing/plan-gates.test.ts` -- add growth tool gating tests for BILL-04

## Existing Codebase Inventory

### Files to MODIFY

| File | What Changes | Why |
|------|-------------|-----|
| `src/lib/billing/checkout.ts` | Replace raw fetch with stripe SDK, use pre-created Price IDs, fix 14->30 day trial | BILL-02, BILL-06 |
| `src/lib/billing/plan-gates.ts` | Add `growthRoles` field to PlanFeatures, add `growth_tool` GateAction | BILL-04 |
| `src/lib/billing/trial-manager.ts` | Change 14->30 days, add email notification on trial ending | BILL-06, BILL-07 |
| `src/app/api/billing/webhook/route.ts` | Rewrite to handle ALL Stripe events (currently subscription-only) | BILL-01 |
| `src/app/api/billing/checkout/route.ts` | Use stripe SDK for session creation | BILL-02 |
| `src/app/(public)/pricing/page.tsx` | Use @stripe/stripe-js for Checkout redirect, fix "14-day" copy to "30-day" | BILL-08 |
| `src/lib/agent/tools.ts` | Add plan gate check in executeAgentTool() | BILL-04 |

### Files to CREATE

| File | Purpose |
|------|---------|
| `src/lib/billing/subscription-handler.ts` | Centralized event dispatcher for all webhook lifecycle events |
| `src/lib/billing/stripe-client.ts` | Singleton Stripe SDK instance, shared across billing code |
| `src/app/api/billing/portal/route.ts` | Create Stripe Customer Portal session |
| `src/components/settings/billing-settings.tsx` | Current plan, usage bars, portal link, trial status |

### Files to DELETE

| File | Reason |
|------|--------|
| `src/app/api/webhooks/stripe/route.ts` | Consolidated into `/api/billing/webhook` |

### Database Schema (Existing)

The following tables already exist and are sufficient:

- **`subscriptions`** (migration 028): id, org_id, stripe_subscription_id (unique), stripe_customer_id, plan, status (active/past_due/cancelled/trialing/paused), current_period_start, current_period_end, cancel_at, cancelled_at, amount, currency, metadata, trial_ends_at (migration 046), stripe_price_id (migration 046)
- **`usage_events`** (migration 046): id, org_id, event_type, metadata, created_at
- **`webhook_events`** (migration 075): id, org_id, source, event_type, external_event_id, payload, status, response_code, error_message, retry_count, created_at, processed_at
- **`organizations`** (migration 001): has `plan` column (text, default 'free')

### Migration Needed

A small migration may be needed to add `stripe_customer_id` to `organizations` table for reliable bidirectional customer lookup. The `subscriptions` table already has this column but looking up org->customer requires joining through subscriptions.

```sql
-- 093_billing_hardening.sql
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer
  ON organizations (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
```

## Sources

### Primary (HIGH confidence)
- Stripe Node SDK v20.4.1 - [npm](https://www.npmjs.com/package/stripe), [GitHub releases](https://github.com/stripe/stripe-node/releases)
- @stripe/stripe-js v8.10.0 - [npm](https://www.npmjs.com/package/@stripe/stripe-js)
- Stripe Customer Portal - [API docs](https://docs.stripe.com/api/customer_portal/sessions), [integration guide](https://docs.stripe.com/customer-management/integrate-customer-portal)
- Stripe Subscription Webhooks - [official docs](https://docs.stripe.com/billing/subscriptions/webhooks)
- Stripe Checkout Subscriptions - [quickstart](https://docs.stripe.com/billing/quickstart), [build guide](https://docs.stripe.com/payments/checkout/build-subscriptions)
- Stripe Trial Periods - [official docs](https://docs.stripe.com/billing/subscriptions/trials)
- Stripe Idempotent Requests - [API docs](https://docs.stripe.com/api/idempotent_requests)

### Secondary (MEDIUM confidence)
- Stripe webhook best practices - [Stigg blog](https://www.stigg.io/blog-posts/best-practices-i-wish-we-knew-when-integrating-stripe-webhooks)
- Stripe + Next.js lifecycle guide - [DEV Community](https://dev.to/thekarlesi/stripe-subscription-lifecycle-in-nextjs-the-complete-developer-guide-2026-4l9d)
- Webhook idempotency patterns - [NestJS example](https://dev.to/aniefon_umanah_ac5f21311c/building-reliable-stripe-subscriptions-in-nestjs-webhook-idempotency-and-optimistic-locking-3o91)

### Codebase Analysis (HIGH confidence - direct observation)
- `src/lib/billing/checkout.ts` -- ad-hoc price creation at lines 83-95, 14-day trial at line 113
- `src/lib/billing/plan-gates.ts` -- 4-tier plan features, missing growthRoles field
- `src/lib/billing/usage-metering.ts` -- working, already wired via run-logger.ts
- `src/lib/billing/trial-manager.ts` -- 14-day hardcode at line 27, working trial status check
- `src/lib/billing/dunning.ts` -- 5-step sequence, fully built, needs webhook integration
- `src/app/api/billing/webhook/route.ts` -- subscription events only, good error handling
- `src/app/api/webhooks/stripe/route.ts` -- payment/invoice events, has idempotency via webhook_events
- `src/lib/channels/stripe.ts` -- hand-rolled webhook verification, works but fragile
- `src/lib/agent/tools.ts` -- executeAgentTool at line 793 is the single gating point
- `src/lib/agent/run-logger.ts` -- already calls trackUsage() for agent_run and token_usage
- `src/app/(public)/pricing/page.tsx` -- static pricing page with GET links to checkout
- `supabase/migrations/028_missing_tables.sql` -- subscriptions table with plan column
- `supabase/migrations/046_billing_extensions.sql` -- usage_events table, trial_ends_at column
- `supabase/migrations/075_webhook_events.sql` -- webhook logging table with external_event_id

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - stripe SDK is the official choice, versions verified on npm
- Architecture: HIGH - existing code thoroughly analyzed, patterns verified against Stripe docs
- Pitfalls: HIGH - all pitfalls directly observed in codebase or verified against Stripe documentation

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable domain, Stripe API version changes rarely affect patterns)
