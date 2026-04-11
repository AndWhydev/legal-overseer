---
phase: 21-billing-infrastructure
plan: 03
subsystem: billing
tags: [stripe, checkout, customer-portal, pricing, trial-email, dunning, billing-settings]

# Dependency graph
requires:
  - phase: 21-billing-infrastructure (plan 01)
    provides: Stripe SDK singleton, subscription-handler with handleTrialEnding placeholder, stripe_customer_id column
  - phase: 21-billing-infrastructure (plan 02)
    provides: Plan gating, PLAN_FEATURES with growthRoles, TRIAL_PERIOD_DAYS constant
provides:
  - Pricing page with Stripe Checkout redirect via @stripe/stripe-js
  - Customer Portal endpoint at POST /api/billing/portal
  - BillingSettings component with plan display, usage bars, trial countdown, portal link
  - handleTrialEnding implementation sending email 3 days before trial expiry
  - Dunning test suite covering full 5-step escalation sequence
affects: [22-cost-controls, 23-seo-tender, 24-content-creator]

# Tech tracking
tech-stack:
  added: []
  patterns: [stripe-url-redirect-checkout, billing-settings-usage-bars, trial-email-dedup-via-stripe-metadata]

key-files:
  created:
    - personal-assistant/src/app/api/billing/portal/route.ts
    - personal-assistant/src/components/settings/billing-settings.tsx
    - personal-assistant/src/lib/billing/dunning.test.ts
  modified:
    - personal-assistant/src/lib/billing/subscription-handler.ts
    - personal-assistant/src/app/(public)/pricing/page.tsx

key-decisions:
  - "Stripe.js v8 URL redirect instead of deprecated redirectToCheckout: checkout API returns session URL, client redirects directly"
  - "loadStripe kept as preload for Stripe.js fraud detection even though redirect is via URL"
  - "Trial email dedup via Stripe subscription metadata (trial_end_notified flag) rather than local DB"
  - "Portal endpoint falls back to subscriptions.stripe_customer_id when organizations.stripe_customer_id is null"

patterns-established:
  - "Billing portal pattern: auth check -> org lookup -> stripe_customer_id from org or subscription fallback -> portal session"
  - "Usage bars: green <60%, yellow 60-80%, red >80% with smooth width transition"

requirements-completed: [BILL-07, BILL-08, BILL-09, BILL-10]

# Metrics
duration: 12min
completed: 2026-03-18
---

# Phase 21 Plan 03: Pricing, Billing Settings & Trial Email Summary

**Stripe Checkout pricing page with 30-day trial, BillingSettings component with usage bars and Customer Portal, trial expiry email handler, and 6-test dunning suite**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-18T18:20:32Z
- **Completed:** 2026-03-18T18:32:22Z
- **Tasks:** 3 (2 auto + 1 checkpoint auto-approved)
- **Files modified:** 5

## Accomplishments
- Replaced handleTrialEnding placeholder with full implementation: org lookup, billing email resolution from org metadata or profile, email via sendCommandReplyEmail, Stripe metadata dedup
- Created Customer Portal endpoint with fallback from organizations to subscriptions table for stripe_customer_id
- Built BillingSettings component with current plan card, trial countdown, 3 usage bars (tokens/agent runs/storage), portal link, and past-due warning banner
- Updated pricing page: loadStripe import, POST-based checkout with URL redirect, 30-day trial copy, per-tier growth role features
- 6 dunning tests covering handlePaymentFailed, processDunningSequence at days 1/3/7/14, and resetDunningState

## Task Commits

Each task was committed atomically:

1. **Task 1: Trial expiry email, Customer Portal endpoint, dunning tests** - `3c030072` (feat)
2. **Task 2: Pricing page with Stripe Checkout, billing settings component** - `8f26db58` (feat)
3. **Task 3: Visual/functional verification** - Auto-approved checkpoint (no commit)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `src/app/api/billing/portal/route.ts` - POST endpoint creating Stripe Customer Portal session, returns URL
- `src/components/settings/billing-settings.tsx` - BillingSettings component: plan card, trial status, usage bars, portal link, past-due banner
- `src/lib/billing/dunning.test.ts` - 6 tests: payment failed init, step 1/3/7 emails, day 14 downgrade, dunning reset
- `src/lib/billing/subscription-handler.ts` - handleTrialEnding: org lookup, billing email resolution, email send, Stripe metadata dedup
- `src/app/(public)/pricing/page.tsx` - loadStripe preload, POST checkout with URL redirect, 30-day trial copy, per-tier growth roles

## Decisions Made
- **Stripe.js v8 URL redirect:** `redirectToCheckout` is removed in @stripe/stripe-js v8. Checkout API already returns session URL, so we redirect via `window.location.href`. `loadStripe` import kept for Stripe.js preloading (fraud detection).
- **Trial email dedup via Stripe metadata:** Setting `trial_end_notified: true` on the Stripe subscription metadata prevents duplicate emails if the webhook fires multiple times. This is more reliable than a local DB flag since Stripe is the source of truth.
- **Portal endpoint fallback chain:** Check `organizations.stripe_customer_id` first (fast path), fall back to `subscriptions.stripe_customer_id` (legacy path). Return 404 if neither exists.
- **Auto-approved checkpoint:** Task 3 checkpoint auto-approved in auto-advance mode. All billing tests pass (43/44 -- 1 pre-existing failure in plan-gates storage mock).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Stripe.js v8 missing redirectToCheckout**
- **Found during:** Task 2 (pricing page update)
- **Issue:** @stripe/stripe-js v8.11.0 does not export `redirectToCheckout` on the Stripe object (deprecated/removed)
- **Fix:** Changed to URL redirect via `window.location.href` using the session URL returned by checkout API. Kept `loadStripe` import for Stripe.js preloading.
- **Files modified:** personal-assistant/src/app/(public)/pricing/page.tsx
- **Verification:** TypeScript compiles without errors on pricing page
- **Committed in:** 8f26db58 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary due to Stripe.js v8 API change. No scope creep.

## Issues Encountered
- Pre-existing test failure in `plan-gates.test.ts > storage action > denies storage when over limit`: mock uses old `attachments` table approach but implementation was changed to `.rpc('get_org_storage_bytes')` in a prior phase. Not caused by this plan, not fixed (documented since 21-01).

## User Setup Required

**External services require manual configuration:**
- Set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` env var for client-side Stripe.js preloading on pricing page
- Ensure `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_SCALE` env vars are set (configured in 21-01)
- Configure Stripe Customer Portal in Stripe Dashboard (Settings > Billing > Customer Portal) with allowed actions

## Next Phase Readiness
- Full billing user experience complete: pricing -> checkout -> manage subscription -> usage visibility
- Phase 22 (Cost Controls) can layer budget enforcement on top of existing usage metering
- Phase 23/24 (Growth Roles) can rely on plan gating infrastructure from 21-02
- All billing tests provide regression safety (43 passing across 6 test files)

## Self-Check: PASSED

All 5 files verified present. Both task commits verified in git log.

---
*Phase: 21-billing-infrastructure*
*Completed: 2026-03-18*
