# BitBit — Track Registry

## Completed Tracks

| ID | Track | Type | Completed |
|----|-------|------|-----------|
| T001 | Dual-Tier Tenancy | architecture | 2026-03-04 |
| T002 | Unified Connections Grid | feature | 2026-03-04 |
| T003 | OAuth Infrastructure | infrastructure | 2026-03-04 |
| T004 | Phase 1 Recovery (4 batches) | recovery | 2026-03-04 |
| T005 | Background Daemon Wiring | infrastructure | 2026-03-04 |
| T006 | Chat UX Overhaul (4 workstreams) | feature | 2026-03-04 |
| T007 | Swarm Build (18 teams, 1433 tests) | feature-batch | 2026-03-06 |
| T014 | Channel Adapters Expansion | feature-batch | 2026-03-06 |
| T015 | CI/CD Pipeline | infrastructure | 2026-03-06 |
| T016 | Mobile Responsive Dashboard | feature | 2026-03-06 |
| T017 | Self-Serve Onboarding | feature | 2026-03-06 |
| T018 | Analytics Real Data Wiring | feature | 2026-03-06 |
| T019 | Glassmorphic UI Redesign | feature | 2026-03-08 |
| T020 | Leads Pipeline Redesign | feature | 2026-03-08 |
| T021 | Production Security Hardening (WS1-WS7) | infrastructure | 2026-03-08 |

## Active Tracks

_None currently active_

## Planned Tracks

| ID | Track | Type | Priority | Blocked By |
|----|-------|------|----------|------------|
| T008 | Platform OAuth App Registrations | infrastructure | P0 | Human-gated (Stripe, Meta, Google, Xero, Slack) |
| T009 | Context Baseplate | architecture | P0 | T008 |
| T010 | Onboarding Flow | feature | P1 | T008, T009 |
| T011 | Production Validation & Deployment | infrastructure | P1 | T008 |
| T012 | Legal & Revenue Operations | business | P0 | Human-gated |
| T013 | Beta Launch Program | business | P1 | T008, T011, T012 |
| T022 | Security Verification & Monitoring | infrastructure | P1 | T011 |
| T023 | Dashboard UX Polish | feature | P2 | - |
| T024 | Creator Studio | feature | P3 | - |
| T025 | Knowledge Base | feature | P3 | - |

## Track Descriptions

### T008 — Platform OAuth App Registrations
Register production OAuth apps with external platforms. Human-gated: requires browser login, CAPTCHA solving, and credential management.
- Stripe: API keys + webhook endpoint + identity verification
- Meta/WhatsApp: Business verification (3-14 day wait) + WhatsApp Business App
- Google: OAuth consent screen (Gmail, Calendar, GSC, GA4)
- Microsoft: Azure AD app registration (Outlook Graph API)
- Xero: OAuth app for accounting adapter
- Slack: Bot token + Events API app

### T009 — Context Baseplate
The compiled world model. Entity graph built at ingest time, not at query time. This is what separates BitBit from reactive RAG-based assistants. Phase 1 semantic engine exists but the Context Baseplate pattern (pre-computed understanding) is the next evolution.

### T010 — Onboarding Flow
Single canonical beta onboarding journey. Spec written at `conductor/tracks/T010/spec.md`. Core routing and wizard implemented, but full spec delivery (FR-1 through FR-12) needs verification and completion.

### T011 — Production Validation & Deployment
Take code-complete agents and channels from "compiles with mocked tests" to "runs correctly in production." Includes:
- Deploy Fly.io worker, VPS relay daemon, Cloudflare edge cron
- Configure Vercel cron jobs for all 11 cron routes
- Smoke test each channel adapter against real credentials
- Load test relay daemon + concurrent agent runs
- Fix 3 failing tests (dashboard page, email-command, whatsapp-parser, email-templates)

### T012 — Legal & Revenue Operations
Business formation and first revenue. Includes:
- Entity decision (new company vs under Torkay/AWU)
- 50/50 equity agreement
- ABN/ACN registration
- Terms of service + privacy policy
- Stripe checkout wiring to live environment
- Andy's $200/mo founder subscription
- Banking setup

### T013 — Beta Launch Program
First external users beyond Andy. Includes:
- AWU case study document with real metrics
- Pricing page wired to Stripe checkout (4 tiers)
- Beta outreach to 5-10 agencies from Andy's network
- Referral/affiliate program design

### T022 — Security Verification & Monitoring
Production-grade operational infrastructure. Includes:
- RLS policy audit across all 54 migrations
- Webhook signature verification (Stripe, Asana, Calendly)
- Sentry.io error tracking wired into engine + relay daemon + agents
- UptimeRobot for /api/health
- Dead letter queue monitoring alerts
- Circuit breaker threshold tuning

### T023 — Dashboard UX Polish
Remaining UX improvements for non-technical users. Partially complete:
- [x] Dynamic KPI cards per industry pack (agency/content-creator/tradie) with charts and trends
- [x] Notification badges on sidebar items with real unread counts
- [x] CSS variable migration for light/dark mode support
- [ ] Progressive disclosure ("Advanced" toggle to hide power-user tabs)
- [ ] Empty state illustrations for tabs with no data
- [ ] Conversation interface unification (WhatsApp/SMS/email share one parser)
