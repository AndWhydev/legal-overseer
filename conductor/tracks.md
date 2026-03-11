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
| T022 | Security Verification & Monitoring | infrastructure | 2026-03-10 |
| T023 | Dashboard UX Polish | feature | 2026-03-10 |
| T026 | E2E Test Expansion (4 spec files, ~49 tests) | testing | 2026-03-11 |

## Active Tracks

| ID | Track | Type | Status | Notes |
|----|-------|------|--------|-------|
| T008 | Platform OAuth App Registrations | infrastructure | ~80% complete | Stripe webhook done (API bypass), Meta webhook done (Graph API), Google OAuth + APIs done, Telnyx webhook done (API), Resend DNS verified. Microsoft/Xero/Slack deferred (no accounts) |
| T009 | Context Baseplate | architecture | Phase 2 complete | Foundation tables, xref-cache, mention-extractor, entity profiles, baseplate snapshot, refresh cron, entity patterns. All migrations applied (053-061) |
| T011 | Production Validation & Deployment | infrastructure | Mostly complete | Fly.io + Cloudflare + VPS worker deployed. 12 cron routes. Channel smoke tests now unblocked — all 5 key platform credentials configured. Load test deferred until channels verified |

## Planned Tracks

| ID | Track | Type | Priority | Blocked By |
|----|-------|------|----------|------------|
| T010 | Onboarding Flow | feature | P1 | T008, T009. FR-6, FR-8, FR-11, FR-12 already committed |
| T012 | Legal & Revenue Operations | business | P0 | Human-gated. Deferred — Andy's responsibility, Meta Business Verification already complete |
| T013 | Beta Launch Program | business | P1 | T008 mostly unblocked, T012 still blocking |
| T024 | Creator Studio | feature | P3 | - |
| T025 | Knowledge Base | feature | P3 | - |

## Track Descriptions

### T008 — Platform OAuth App Registrations
Register production OAuth apps with external platforms. Human-gated: requires browser login, CAPTCHA solving, and credential management.
- [x] Stripe: API keys set, webhook endpoint configured (API bypass)
- [x] Meta/WhatsApp: Webhook configured (Graph API), WhatsApp Business App live, Meta Business Verification complete
- [x] Google: OAuth consent screen + redirect URIs + API enablement (Gmail, Calendar, GSC, GA4)
- [x] Telnyx: API key + webhook URL configured (API)
- [x] Resend: API key set, DNS verified (DKIM, SPF, DMARC)
- [ ] Microsoft: Azure AD app registration (Outlook Graph API) — deferred, no account
- [ ] Xero: OAuth app for accounting adapter — deferred, no account
- [ ] Slack: Bot token + Events API app — deferred, no account

### T009 — Context Baseplate
The compiled world model. Entity graph built at ingest time, not at query time. This is what separates BitBit from reactive RAG-based assistants. Phase 1 semantic engine exists but the Context Baseplate pattern (pre-computed understanding) is the next evolution.

### T010 — Onboarding Flow
Single canonical beta onboarding journey. Spec written at `conductor/tracks/T010/spec.md`. Core routing and wizard implemented, but full spec delivery (FR-1 through FR-12) needs verification and completion.

### T011 — Production Validation & Deployment
Take code-complete agents and channels from "compiles with mocked tests" to "runs correctly in production." Progress:
- [x] Deploy Fly.io worker (`bitbit-workers.fly.dev`, Sydney, 2x shared-cpu-1x 1024MB)
- [x] Deploy Cloudflare edge cron (`bitbit-edge-cron`, */5 cron, rate limiting)
- [x] Configure secrets on both services (Supabase, Anthropic, worker auth token)
- [x] Verify end-to-end chain: Cloudflare → Fly.io → Supabase all healthy
- [x] Deploy VPS relay daemon (worker.ts + health server)
- [x] Configure Vercel cron jobs (12 cron routes including entity-profile-refresh)
- [x] Fix failing tests (1460 tests passing)
- [ ] Smoke test each channel adapter against real credentials (now unblocked — 5 key platform credentials configured)
- [ ] Load test relay daemon + concurrent agent runs (deferred until channels verified)

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

### T022 — Security Verification & Monitoring ✅
Production-grade operational infrastructure. All code items complete:
- [x] RLS policy audit across all 61 migrations (dual-tier policies)
- [x] Webhook signature verification (all 6 webhooks: Stripe, Asana, Calendly, Slack, SMS, email-command)
- [x] Sentry.io error tracking (DSN, org, project, Vercel env vars, context enrichment, PII filtering)
- [x] Dead letter queue wiring + Sentry alerts on DLQ writes + admin API endpoint
- [x] Circuit breaker integrated into LLM API calls
- [x] Security response headers (X-Content-Type-Options, HSTS, Referrer-Policy, Permissions-Policy, X-Frame-Options)
- [ ] UptimeRobot for /api/health (external service — manual setup)

### T023 — Dashboard UX Polish ✅
UX improvements for non-technical users. All items complete:
- [x] Dynamic KPI cards per industry pack (agency/content-creator/tradie) with charts and trends
- [x] Notification badges on sidebar items with real unread counts
- [x] CSS variable migration for light/dark mode support
- [x] Interactive data-viz library (sparkline, bar, donut, gauge with hover tooltips)
- [x] KPI card horizontal layout (value-left, chart-right)
- [x] Progressive disclosure (localStorage `bb-advanced-mode` toggle in sidebar)
- [x] Empty states for all data-dependent tabs
- [x] Conversation interface unification (email + SMS wired through conversation adapters)
