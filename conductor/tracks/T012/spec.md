# T012 — Legal & Revenue Operations

## Overview

Business formation, legal agreements, and first revenue. Everything needed before BitBit can accept money and operate as a business entity.

## Problem

BitBit has a working product but no legal entity, no equity agreement, no terms of service, and Stripe payouts are paused due to identity verification. Revenue cannot flow until these are resolved.

## Tasks

### Legal Foundation

| # | Task | Owner | Effort | Details |
|---|------|-------|--------|---------|
| 1 | Entity decision: BitBit as new company vs under Torkay/AWU | Both | 1 hr | Determines ABN, banking, contracts |
| 2 | 50/50 equity agreement (written, signed) | Both | 4 hr | Before any revenue |
| 3 | IP ownership documentation | Both | 2 hr | Who owns the code |
| 4 | ABN/ACN registration (if new entity) | Both | 1 hr | |
| 5 | Terms of service | Tor | 2 hr | Route exists at /app/(public)/terms |
| 6 | Privacy policy | Tor | 2 hr | Route exists at /app/(public)/privacy |
| 7 | Client service agreement template | Both | 2 hr | For beta clients |

### First Revenue

| # | Task | Owner | Effort | Details |
|---|------|-------|--------|---------|
| 8 | Fix Stripe identity verification | Tor | 15 min | BLOCKER — payouts paused |
| 9 | Wire billing/checkout.ts to live Stripe | Tor | 2 hr | Test with real payment |
| 10 | Wire plan-gates.ts to enforce feature limits per tier | Tor | 2 hr | Starter vs Growth vs Pro |
| 11 | Create Andy's $200/mo founder subscription | Tor | 30 min | Growth tier at 43% discount |
| 12 | Service agreement with Andy/AWU | Both | 1 hr | Formalize |
| 13 | Banking setup (BitBit revenue account) | Both | 1 hr | Separate from personal |

## Acceptance Criteria

- [ ] Legal entity decision made and documented
- [ ] Equity agreement signed by both parties
- [ ] Terms of service and privacy policy published
- [ ] Stripe identity verified and payouts unpaused
- [ ] Stripe checkout flow tested with a real payment
- [ ] Andy's subscription active and billing monthly
- [ ] Revenue account receiving funds

## Notes

- Stripe identity verification has been blocked by CAPTCHA in automated attempts — requires manual browser login
- Tasks 1-7 are human-gated and cannot be automated
- This track runs in parallel with T008 and T011
