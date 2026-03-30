---
phase: 21-billing-infrastructure
plan: 01
subsystem: payments
tags: [stripe, webhook, subscription, checkout, idempotency, billing]

# Dependency graph
requires:
  - phase: none
    provides: existing billing scaffolding (checkout.ts, dunning.ts, plan-gates.ts)
provides:
  - Stripe SDK singleton with lazy initialization
  - Centralized subscription-handler with full lifecycle dispatch
  - Consolidated idempotent webhook endpoint at /api/billing/webhook
  - Pre-created price checkout (no ad-hoc Stripe price creation)
  - PRICE_TO_TIER and TIER_TO_PRICE env-var-based mappings
  - organizations.stripe_customer_id column (migration 093)
affects: [21-02-billing-dashboard, 21-03-trial-management, 22-cost-controls]

# Tech tracking
tech-stack:
  added: [stripe, "@stripe/stripe-js"]
  patterns: [lazy-singleton-stripe, event-dispatcher-switch, webhook-idempotency, price-env-var-mapping]

key-files:
  created:
    - personal-assistant/src/lib/billing/stripe-client.ts
    - personal-assistant/src/lib/billing/subscription-handler.ts
    - personal-assistant/src/lib/billing/subscription-handler.test.ts
    - personal-assistant/src/lib/billing/checkout.test.ts
    - personal-assistant/supabase/migrations/093_billing_hardening.sql
  modified:
    - personal-assistant/src/lib/billing/checkout.ts
    - personal-assistant/src/app/api/billing/webhook/route.ts
    - personal-assistant/src/app/api/webhooks/stripe/route.ts
    - personal-assistant/package.json

key-decisions:
  - "Lazy Stripe singleton via Proxy to avoid build/test failures when STRIPE_SECRET_KEY absent"
  - "Consolidated webhook uses service-role Supabase client (webhook has no user auth context)"
  - "Legacy /api/webhooks/stripe re-exports consolidated route for backwards compatibility"
  - "All subscription upserts write to plan column (not tier) matching getOrgPlan() reader"
  - "Trial period changed from 14 to 30 days (TRIAL_PERIOD_DAYS constant as single source of truth)"

patterns-established:
  - "Webhook idempotency: check webhook_events.external_event_id before processing"
  - "Price mapping via env vars: STRIPE_PRICE_STARTER/GROWTH/SCALE resolved at runtime"
  - "Subscription handler as centralized event dispatcher imported by webhook route"
  - "Always return 200 to Stripe webhook to prevent retry storms"

requirements-completed: [BILL-01, BILL-02, BILL-03]

# Metrics
duration: 14min
completed: 2026-03-18
---

# Phase 21 Plan 01: Billing Infrastructure Hardening Summary

**Stripe SDK with pre-created price checkout, consolidated idempotent webhook endpoint, and subscription lifecycle handler writing to plan column**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-18T17:54:08Z
- **Completed:** 2026-03-18T18:08:37Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Installed Stripe SDK and created lazy singleton with PRICE_TO_TIER/TIER_TO_PRICE env-var mappings
- Built subscription-handler with full lifecycle (created/updated/deleted), checkout completion, invoice paid, and payment failed handlers -- all writing to `plan` column consistently
- Consolidated two overlapping webhook routes into single idempotent endpoint with Stripe SDK signature verification
- Rewrote checkout to use pre-created Price IDs from env vars (eliminates ad-hoc price creation polluting Stripe dashboard)
- Added 093_billing_hardening migration adding stripe_customer_id to organizations
- 16 unit tests covering subscription handler and checkout behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Stripe SDK, create stripe-client singleton, subscription-handler module, and migration** - `9acfc76a` (feat)
2. **Task 2: Consolidate webhook routes, rewrite checkout to use pre-created prices** - `c757b077` (feat)

**Plan metadata:** [pending] (docs: complete plan)

_Note: TDD tasks have RED->GREEN commits bundled into single task commits_

## Files Created/Modified
- `src/lib/billing/stripe-client.ts` - Lazy Stripe singleton, TRIAL_PERIOD_DAYS, price/tier mapping functions
- `src/lib/billing/subscription-handler.ts` - Centralized event dispatcher for all subscription lifecycle events
- `src/lib/billing/subscription-handler.test.ts` - 11 tests for subscription handler and price mapping
- `src/lib/billing/checkout.test.ts` - 5 tests for pre-created price checkout
- `src/lib/billing/checkout.ts` - Rewritten to use Stripe SDK with pre-created Price IDs
- `src/app/api/billing/webhook/route.ts` - Consolidated webhook with idempotency and Stripe SDK verification
- `src/app/api/webhooks/stripe/route.ts` - Replaced with re-export to consolidated route
- `supabase/migrations/093_billing_hardening.sql` - stripe_customer_id on organizations table
- `package.json` - Added stripe and @stripe/stripe-js dependencies

## Decisions Made
- **Lazy Stripe singleton via Proxy:** Avoids build/test failures when STRIPE_SECRET_KEY is not set. The Proxy delegates to getStripe() on first property access.
- **Service-role client for webhook:** Webhook requests have no user auth context; service role key provides full DB access needed for subscription updates.
- **Backwards-compatible re-export:** /api/webhooks/stripe now re-exports /api/billing/webhook POST handler, allowing gradual Stripe dashboard migration.
- **plan column over tier column:** All subscription upserts consistently use `plan` field, matching what `getOrgPlan()` reads. Legacy code in checkout.ts also fixed.
- **30-day trial period:** Changed from 14 to 30 days via TRIAL_PERIOD_DAYS constant, providing single source of truth.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed legacy handleSubscriptionEvent writing to tier column**
- **Found during:** Task 2 (checkout.ts rewrite)
- **Issue:** The deprecated `handleSubscriptionEvent` function was writing to `tier` column and referencing `organisations` table (typo)
- **Fix:** Updated to write to `plan` column and reference `organizations` table
- **Files modified:** personal-assistant/src/lib/billing/checkout.ts
- **Verification:** grep confirms no bare `tier:` writes in subscription-handler
- **Committed in:** c757b077 (Task 2 commit)

**2. [Rule 3 - Blocking] Stripe SDK eager initialization fails in test/build**
- **Found during:** Task 1 (subscription-handler tests)
- **Issue:** `new Stripe(process.env.STRIPE_SECRET_KEY!)` at module top level fails when env var is missing (test environment, build time)
- **Fix:** Implemented lazy initialization via `getStripe()` function and Proxy export for backwards compatibility
- **Files modified:** personal-assistant/src/lib/billing/stripe-client.ts
- **Verification:** All 16 tests pass without STRIPE_SECRET_KEY set
- **Committed in:** 9acfc76a (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
- Pre-existing test failure in plan-gates.test.ts (storage mock incompatible with RPC-based implementation) -- out of scope, not caused by this plan's changes

## User Setup Required

**External services require manual configuration:**
- Set `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_SCALE` env vars with Price IDs from Stripe Dashboard Products
- Set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` for client-side Stripe.js
- Update Stripe webhook endpoint URL to `/api/billing/webhook`

## Next Phase Readiness
- Stripe SDK and subscription handler ready for billing dashboard (plan 21-02)
- Trial management hooks ready for plan 21-03 (handleTrialEnding is placeholder)
- organizations.stripe_customer_id column available for customer portal integration
- All billing tests provide regression safety for future changes

---
*Phase: 21-billing-infrastructure*
*Completed: 2026-03-18*
