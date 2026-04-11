# T013 — Beta Launch Program

## Overview

Launch BitBit beta to 5-10 agencies from Andy's network. Requires working product (T011), revenue infrastructure (T012), and enough credentials to demonstrate real value (T008).

## Depends On

- T008 (Platform OAuth App Registrations)
- T011 (Production Validation & Deployment)
- T012 (Legal & Revenue Operations)

## What Exists

- Landing page scaffolded at `landing-page/` (7 pages including pricing, about, demo)
- Pricing page route at `/app/(public)/pricing`
- Beta onboarding flow: `lib/onboarding/beta-flow.ts` (137 lines)
- Multi-tenant signup: `lib/onboarding/multi-tenant.ts` (166 lines)
- Self-serve onboarding: `/onboard` page with 3-step wizard
- MRR tracking: `lib/analytics/mrr.test.ts`
- Churn tracking: `lib/analytics/churn.test.ts`

## Tasks

### Case Study & Social Proof

| # | Task | Owner | Effort |
|---|------|-------|--------|
| 1 | AWU case study document (before/after with real metrics from Andy's usage) | Both | 4 hr |
| 2 | Screenshots and demo recordings | Tor | 2 hr |

### Marketing Site

| # | Task | Owner | Effort |
|---|------|-------|--------|
| 3 | Complete landing page copy and design | Tor | 8 hr |
| 4 | Wire pricing page to Stripe checkout links (4 tiers: $199-$999+) | Tor | 3 hr |
| 5 | Deploy landing page to bitbit.com.au | Tor | 1 hr |

### Outreach

| # | Task | Owner | Effort |
|---|------|-------|--------|
| 6 | Agency targeting list from Andy's network | Andy | 2 hr |
| 7 | Beta outreach emails (5-10 agencies) | Andy | 2 hr |
| 8 | Referral/affiliate program design | Both | 3 hr |

### Analytics & Reporting

| # | Task | Owner | Effort |
|---|------|-------|--------|
| 9 | Wire MRR dashboard to real Stripe data | Tor | 2 hr |
| 10 | Per-client ROI calculation (agent actions vs subscription cost) | Tor | 2 hr |
| 11 | Churn risk indicators from usage patterns | Tor | 2 hr |
| 12 | Monthly revenue reporting email to founders | Tor | 2 hr |

## Acceptance Criteria

- [ ] Landing page live at bitbit.com.au with working pricing
- [ ] AWU case study published
- [ ] 5+ beta invites sent to real agencies
- [ ] At least 1 beta client onboarded beyond Andy
- [ ] MRR dashboard showing real revenue data
- [ ] Founders receiving monthly revenue reports
