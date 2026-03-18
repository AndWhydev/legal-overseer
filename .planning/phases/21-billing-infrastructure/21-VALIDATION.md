---
phase: 21
slug: billing-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (via vitest.config.ts) |
| **Config file** | `personal-assistant/vitest.config.ts` |
| **Quick run command** | `cd personal-assistant && npx vitest run src/lib/billing/` |
| **Full suite command** | `cd personal-assistant && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd personal-assistant && npx vitest run src/lib/billing/`
- **After every plan wave:** Run `cd personal-assistant && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Requirement Test Map

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

---

## Wave 0 Gaps

- [ ] `src/lib/billing/subscription-handler.test.ts` — covers BILL-01, BILL-03, BILL-07
- [ ] `src/lib/billing/checkout.test.ts` — covers BILL-02, BILL-09
- [ ] `src/lib/billing/dunning.test.ts` — covers BILL-10
- [ ] Update `src/lib/billing/trial-manager.test.ts` — update 14-day expectations to 30-day for BILL-06
- [ ] Extend `src/lib/billing/plan-gates.test.ts` — add growth tool gating tests for BILL-04
