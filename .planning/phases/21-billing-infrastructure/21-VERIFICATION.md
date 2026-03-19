---
phase: 21-billing-infrastructure
verified: 2026-03-19T00:00:00Z
status: gaps_found
score: 9/10 must-haves verified
gaps:
  - truth: "Billing settings page shows current plan, usage bars, and trial status"
    status: failed
    reason: "BillingSettings component exists but is an orphan — not imported by any page, tab, or layout component. No user can reach it."
    artifacts:
      - path: "personal-assistant/src/components/settings/billing-settings.tsx"
        issue: "Exported but never imported; zero references from app code"
      - path: "personal-assistant/src/components/dashboard/tabs/settings-tab.tsx"
        issue: "Settings tab has Connections, Automations, and Appearance sections — no Billing section"
    missing:
      - "Import BillingSettings in settings-tab.tsx and render it as a 'Billing' tab or section"
human_verification:
  - test: "Navigate to /pricing, click 'Start 30-Day Free Trial' on any plan, confirm redirect to Stripe Checkout (test mode)"
    expected: "Stripe-hosted checkout page loads with correct plan and 30-day trial"
    why_human: "Cannot programmatically confirm Stripe Checkout redirect in test environment without real env vars"
  - test: "After a test subscription checkout, open /dashboard/settings and find the Billing section (once ORPHANED gap is fixed)"
    expected: "Current plan card, usage bars, trial countdown, and Manage Billing button visible"
    why_human: "Visual and functional UI verification; requires live Supabase session"
---

# Phase 21: Billing Infrastructure Verification Report

**Phase Goal:** BitBit has a working Stripe subscription system — users can subscribe, manage plans, and growth tools are gated by plan tier
**Verified:** 2026-03-19
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | All Stripe webhook events route through a single consolidated endpoint at /api/billing/webhook | VERIFIED | `src/app/api/billing/webhook/route.ts` handles all event types; `/api/webhooks/stripe` re-exports the same POST handler |
| 2 | Duplicate webhook events (same Stripe event ID) are processed exactly once | VERIFIED | `isDuplicate()` checks `webhook_events` table for `external_event_id` + `status = 'success'` before any dispatch |
| 3 | Checkout uses pre-created Stripe Price IDs, not ad-hoc price creation | VERIFIED | `checkout.ts` calls `getTierToPrice()[input.tier]` from env vars; no `stripe.prices.create` calls anywhere |
| 4 | Subscription lifecycle events correctly update both subscriptions table and organizations.plan | VERIFIED | `handleSubscriptionLifecycle()` handles created/updated/deleted, all writing `plan` column; org updated on all three branches |
| 5 | Growth tools return an upgrade prompt when invoked by a user on an insufficient plan | VERIFIED | `executeAgentTool` checks `TOOL_PLAN_REQUIREMENTS[name]`, calls `checkToolPlanGate(orgPlan, name)`, returns error string with upgrade CTA if denied |
| 6 | Usage metering tracks token_usage, agent_run, and storage_mb events per org per billing period | VERIFIED | `trackUsage()` in `run-logger.ts` lines 75/78 calls `agent_run` and `token_usage`; `getUsage()` aggregates all three event types |
| 7 | Trial duration is 30 days everywhere in the codebase (not 14) | VERIFIED | `TRIAL_PERIOD_DAYS = 30` in both `stripe-client.ts` and `trial-manager.ts`; checkout session sets `trial_period_days: TRIAL_PERIOD_DAYS`; the `14` references remaining in dunning.ts refer to dunning step days, not trial duration |
| 8 | User can select a plan on the pricing page, click subscribe, and be redirected to Stripe Checkout | VERIFIED (automated) / HUMAN NEEDED (live) | Pricing page posts to `/api/billing/checkout`, receives `url`, redirects via `window.location.href`; `loadStripe` imported for Stripe.js preloading |
| 9 | User can access Stripe Customer Portal from billing settings to manage subscription | PARTIALLY VERIFIED | `/api/billing/portal` route is correct (auth, org lookup, fallback chain, portal session); but `BillingSettings` component that calls it is orphaned — not rendered anywhere |
| 10 | Billing settings page shows current plan, usage bars, and trial status | FAILED | `BillingSettings` component is substantive and correct but not wired into any page or tab |

**Score: 9/10 truths verified** (1 failed, 1 human-needed overlap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `personal-assistant/src/lib/billing/stripe-client.ts` | Singleton Stripe SDK, TRIAL_PERIOD_DAYS, price/tier mapping | VERIFIED | Lazy Proxy singleton; `TRIAL_PERIOD_DAYS = 30`; `getPriceToTier()` / `getTierToPrice()` functions (vs. constants in plan, but functionally identical) |
| `personal-assistant/src/lib/billing/subscription-handler.ts` | Centralized subscription event dispatcher | VERIFIED | Exports `handleSubscriptionLifecycle`, `handleCheckoutComplete`, `handleTrialEnding`, `handleInvoicePaid`, `handlePaymentFailed` |
| `personal-assistant/src/app/api/billing/webhook/route.ts` | Consolidated webhook with idempotency | VERIFIED | Full switch/case dispatcher; idempotency check; always returns 200 |
| `personal-assistant/supabase/migrations/093_billing_hardening.sql` | stripe_customer_id on organizations | VERIFIED | `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT` + index |
| `personal-assistant/src/lib/billing/plan-gates.ts` | Plan feature matrix with growthRoles, TOOL_PLAN_REQUIREMENTS | VERIFIED | `PlanFeatures` has `growthRoles: string[]` and `fileAttachments: boolean`; `TOOL_PLAN_REQUIREMENTS` maps 13 tools; `checkToolPlanGate()` uses `PLAN_ORDER.indexOf()` |
| `personal-assistant/src/lib/agent/tools.ts` | Plan gate check before handler call | VERIFIED | Lines 809-817: checks `TOOL_PLAN_REQUIREMENTS[name]`, calls `checkToolPlanGate`, returns upgrade error before handler |
| `personal-assistant/src/lib/billing/trial-manager.ts` | 30-day trial creation | VERIFIED | `const TRIAL_PERIOD_DAYS = 30`; `trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_PERIOD_DAYS)` |
| `personal-assistant/src/lib/billing/usage-metering.ts` | Usage tracking for tokens, runs, storage | VERIFIED | `trackUsage()` accepts `token_usage`, `agent_run`, `storage_mb`; `getUsage()` returns per-type breakdown |
| `personal-assistant/src/app/(public)/pricing/page.tsx` | Pricing page with loadStripe and checkout redirect | VERIFIED | `loadStripe` imported; POST to `/api/billing/checkout`; URL redirect; "30-day free trial" copy on all plan CTAs |
| `personal-assistant/src/app/api/billing/portal/route.ts` | Customer Portal session creation | VERIFIED | POST endpoint; auth check; org lookup; fallback to subscriptions table; `stripe.billingPortal.sessions.create` |
| `personal-assistant/src/components/settings/billing-settings.tsx` | BillingSettings UI component | STUB/ORPHANED | Component is substantive (plan card, usage bars, trial countdown, portal link, past-due banner — all implemented) but NOT imported by any file in the app |
| `personal-assistant/src/lib/billing/dunning.test.ts` | Dunning test suite | VERIFIED | 6 tests: handlePaymentFailed init, processDunningSequence steps 1/3/7, day-14 downgrade, resetDunningState |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `/api/billing/webhook/route.ts` | `subscription-handler.ts` | event type switch dispatch | WIRED | All 5 handler functions imported and dispatched in switch/case |
| `checkout.ts` | `STRIPE_PRICE_*` env vars | `getTierToPrice()` function call | WIRED | `getTierToPrice()` reads `process.env.STRIPE_PRICE_STARTER/GROWTH/SCALE` at call time |
| `/api/billing/webhook/route.ts` | `webhook_events` table | idempotency check + logWebhookEvent | WIRED | `isDuplicate()` queries `external_event_id`; `logWebhookEvent()` writes processing/success/failed states |
| `tools.ts` | `plan-gates.ts` | import TOOL_PLAN_REQUIREMENTS, getOrgPlan, checkToolPlanGate | WIRED | Line 24: `import { getOrgPlan, checkToolPlanGate, TOOL_PLAN_REQUIREMENTS }` |
| `tools.ts` | plan gate check | `planOrder.indexOf` comparison via `checkToolPlanGate` | WIRED | `TOOL_PLAN_REQUIREMENTS[name]` check at lines 809-817 |
| `run-logger.ts` | `usage-metering.ts` | trackUsage for agent_run and token_usage | WIRED | Lines 75/78: `trackUsage(supabase, run.org_id, 'agent_run', 1)` and `trackUsage(..., 'token_usage', totalTokens)` |
| `billing-settings.tsx` | `/api/billing/portal` | fetch POST + redirect | NOT WIRED IN APP | Component itself has the correct `handlePortalRedirect` fetch call, but component is not rendered anywhere |
| `subscription-handler.ts` | `sendCommandReplyEmail` (trial) | `handleTrialEnding` implementation | WIRED | `sendCommandReplyEmail(billingEmail, subject, htmlBody)` called in `handleTrialEnding`; subject is "Your BitBit trial ends in 3 days" |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| BILL-01 | 21-01 | Stripe webhook routes consolidated into single handler with idempotency | SATISFIED | `/api/billing/webhook` handles all event types; `/api/webhooks/stripe` re-exports it |
| BILL-02 | 21-01 | Stripe Products and Prices pre-created (no ad-hoc price creation per checkout) | SATISFIED | `createCheckoutSession` uses `getTierToPrice()[tier]` env var lookup; no `stripe.prices.create` calls |
| BILL-03 | 21-01 | Subscription lifecycle works end-to-end (create, upgrade, downgrade, cancel) | SATISFIED | `handleSubscriptionLifecycle` handles all three event actions, writing `plan` + org update |
| BILL-04 | 21-02 | Plan gating enforced at tool execution layer | SATISFIED | `TOOL_PLAN_REQUIREMENTS` + `checkToolPlanGate` in `executeAgentTool` before handler |
| BILL-05 | 21-02 | Usage metering wired into agent run logger | SATISFIED | `run-logger.ts` imports and calls `trackUsage` for `agent_run` and `token_usage` |
| BILL-06 | 21-02 | 30-day free trial (fix 14-day mismatch) | SATISFIED | `TRIAL_PERIOD_DAYS = 30` as constant in both modules; checkout session and trial-manager use it |
| BILL-07 | 21-03 | Trial conversion and expiry notifications via email | SATISFIED | `handleTrialEnding` implemented with org lookup, email resolution, `sendCommandReplyEmail`, Stripe metadata dedup |
| BILL-08 | 21-03 | Pricing page with plan comparison and live Stripe Checkout integration | SATISFIED (code) / HUMAN NEEDED (live) | Pricing page has correct implementation; live Stripe redirect needs human verification |
| BILL-09 | 21-03 | Stripe Customer Portal for self-service plan management | PARTIALLY SATISFIED | Portal route is correct; but `BillingSettings` (the only entrypoint) is not rendered in the app |
| BILL-10 | 21-03 | Dunning sequence handles failed payments with escalating notifications | SATISFIED | `dunning.ts` + `dunning.test.ts` cover full 5-step sequence; webhook dispatches `handlePaymentFailed` |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/components/settings/billing-settings.tsx` | 113 | Exported component with no importers | Blocker | Users cannot access billing settings, Customer Portal, or usage dashboard from the app |
| `src/lib/billing/trial-manager.ts` | 137 | `organisations` table reference (typo) in `convertTrial()` | Warning | `convertTrial` writes to `organisations` (British spelling) instead of `organizations` (US spelling used by the rest of the codebase) — likely a dormant bug |

### Human Verification Required

#### 1. Stripe Checkout Redirect

**Test:** Navigate to `/pricing`, click "Start 30-Day Free Trial" on any plan (Starter/Growth/Scale), observe network request and browser redirect
**Expected:** Browser redirects to `checkout.stripe.com/...` with the correct plan selected and 30-day trial
**Why human:** Requires `STRIPE_PRICE_*` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` env vars to be set; can't confirm Stripe URL construction in static analysis

#### 2. Billing Settings Reachability (After Gap Fix)

**Test:** After `BillingSettings` is wired into the settings UI, navigate to `/dashboard` settings area and find the Billing section
**Expected:** Current plan card, 3 usage bars (AI Tokens, Agent Runs, Storage), trial countdown if trialing, "Manage Billing" button that opens Stripe Customer Portal
**Why human:** Visual layout verification; requires authenticated session with active subscription

### Gaps Summary

One gap blocking full goal achievement:

**BILL-09 / BillingSettings orphan:** The `BillingSettings` component in `src/components/settings/billing-settings.tsx` was built correctly with all specified sections (plan card, trial countdown, usage bars, portal link, past-due banner) but was never imported or rendered. The settings tab (`settings-tab.tsx`) exports `SettingsConnectionsTab`, `SettingsAutomationsTab`, and `SettingsAppearanceTab` — but no billing tab. As a result, users have no in-app path to see their plan status, usage, or access the Customer Portal.

**Fix required:** Add a billing section or tab to the settings UI that renders `<BillingSettings />`. The simplest approach is to add a `SettingsBillingTab` wrapper in `settings-tab.tsx` that renders `BillingSettings`, then expose it in whatever dashboard shell renders the settings tabs.

**Secondary issue (non-blocking):** `convertTrial()` in `trial-manager.ts` references `organisations` (British spelling) rather than `organizations`. This is dormant since no code currently calls `convertTrial()`, but it will fail at runtime when the trial conversion flow is exercised.

---

_Verified: 2026-03-19_
_Verifier: Claude (gsd-verifier)_
