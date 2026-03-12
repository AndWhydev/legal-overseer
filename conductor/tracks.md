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
| T027 | Agent Superpower Toolkit — Phase 1 (4 tools) | feature | 2026-03-11 |
| T028 | Agent Tool Orchestration — Phase 1 (ADR-001) | architecture | 2026-03-11 |
| T029 | Beta Blockers — Security, Safety, Compliance | infrastructure | 2026-03-11 |
| T030 | Landing Page Waitlist & Brand Refresh | marketing | 2026-03-11 |

## Active Tracks

| ID | Track | Type | Status | Notes |
|----|-------|------|--------|-------|
| T008 | Platform OAuth App Registrations | infrastructure | ~80% complete | Stripe webhook done (API bypass), Meta webhook done (Graph API), Google OAuth + APIs done, Telnyx webhook done (API), Resend DNS verified. Microsoft/Xero/Slack deferred (no accounts) |
| T009 | Context Baseplate | architecture | Phase 3 ~80% | Bidirectional context loop wired: inbound→timeline→profile refresh→chat injection→outbound write-back. Entity-mention-scanner, baseplate-to-prompt wiring, auto-contact creation from inbound messages. Migrations 053-061 applied, 066 pending. Remaining: e2e verification with real data, outbound write-back testing, relationship/memory seeding. BUG: no-reply contacts in DB from pre-filter import need cleanup. BUG: entity_profiles.relationships and memories empty (no seed data) |
| T011 | Production Validation & Deployment | infrastructure | Mostly complete | Fly.io + Cloudflare + VPS worker deployed. 12 cron routes. Channel smoke tests now unblocked — all 5 key platform credentials configured. Load test deferred until channels verified |

## Planned Tracks

| ID | Track | Type | Priority | Blocked By |
|----|-------|------|----------|------------|
| T010 | Onboarding Flow | feature | P1 | T008, T009. FR-6, FR-8, FR-11, FR-12 already committed |
| T012 | Legal & Revenue Operations | business | P0 | Human-gated. Deferred — Andy's responsibility, Meta Business Verification already complete |
| T013 | Beta Launch Program | business | P1 | T008 mostly unblocked, T012 still blocking |
| T024 | Creator Studio | feature | P3 | - |
| T025 | Knowledge Base | feature | P3 | - |
| T027 | Agent Superpower Toolkit | feature | P1 | Phase 1 shipped (web_search, fetch_url, send_email, send_sms). Phase 2 (browse_website via Playwright on Fly) planned. Spec: `conductor/tracks/T027/spec.md` |
| T028 | Agent Tool Orchestration (ADR-001) | architecture | P2 | Phase 1 shipped. Phase 2 (complexity routing + sub-agents) when quality complaints emerge. Phase 3 (multi-orchestrator) when tools > 100. Decision: `.claude/docs/research/tool-architecture-decision.md` |

## Track Descriptions

### T008 — Platform OAuth App Registrations
Register production OAuth apps with external platforms. Human-gated: requires browser login, CAPTCHA solving, and credential management.
- [x] Stripe: API keys set, webhook endpoint configured (API bypass)
- [x] Meta/WhatsApp: Webhook configured (Graph API), WhatsApp Business App live, Meta Business Verification complete (8 Mar 2026). Permanent System User token generated. WABA phone registration BLOCKED — Meta rejects VoIP numbers (Telnyx/Twilio/etc) for WhatsApp verification ("not supported on VoIP numbers due to fraud prevention"). Requires real mobile SIM number to complete registration
- [x] Google: OAuth consent screen published, redirect URIs added (/callback/gmail, /google-calendar, /google-analytics). Branding configured with privacy/terms links. Search Console verified. BUG: Gmail API returns FAILED_PRECONDITION — OAuth client is on GCP project 913966386681 but APIs may have been enabled on project 163710351496. Fix: enable Gmail/Calendar/Analytics APIs on project 913966386681. Also: Tor's refresh token invalidated by consent screen publish (re-auth needed). Pending: YouTube demo video for restricted scope verification (gmail.readonly)
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
- [x] Terms of service (21 sections, Australian law, ACL, AI liability) — live at bitbit.chat/terms
- [x] Privacy policy (20 sections, APP/GDPR, Google Limited Use) — live at bitbit.chat/privacy
- Stripe checkout wiring to live environment
- Andy's $200/mo founder subscription
- Banking setup
- [ ] WABA phone registration — requires real mobile SIM number (Meta blocks VoIP numbers for WhatsApp verification). Cheap prepaid AU SIM ($2 Boost/Amaysim) sufficient — only needs one verification SMS, then WhatsApp runs via Cloud API
- [ ] WABA payment method (credit/debit card) — required for business-initiated WhatsApp conversations at scale. Not blocking inbound/reply flows (1,000 free service conversations/month)
- [ ] Google OAuth verification — submit YouTube demo video (~2-3 min screen recording showing OAuth flow + how Gmail/Calendar data is used by AI agents). Required to remove "unverified app" warning and lift 100-user cap on restricted scopes

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

### T027 — Agent Superpower Toolkit
Transform agents from chatbot to autonomous assistant. Full spec: `conductor/tracks/T027/spec.md`
- **Phase 1 (P0)**: `web_search` (Brave API), `fetch_url` (readability extract), `send_email` (Resend), `send_sms` (Telnyx) — 4 new agent tools, ~2-3 hours
- **Phase 2 (P1)**: `browse_website` (Playwright headless in Fly) — navigate, extract, screenshot
- **Phase 3 (P2)**: 1Password Connect Server on Fly + generic credential tool + skill extensibility framework
- **Phase 4 (P3)**: Per-user Fly Sprites (sleep-to-zero VMs with persistent credentials/browser/filesystem)
- Reference: OpenClaw (68K stars, 13,700+ community skills), Stagehand v3, Composio (1000+ integrations)

### T028 — Agent Tool Orchestration (ADR-001)
Scalable tool orchestration architecture based on SOTA research (Manus AI, Anthropic, Google-MIT 2026, Shopify). Hybrid Pattern D: planner-compiled tool groups as default, selective sub-agents for complex multi-domain queries.

**Phase 1 (Shipped)**: Haiku planner selects tool groups → Sonnet receives filtered tools (5-12 instead of 20). KV cache preservation via stable tool sets. Context tokens reduced from ~6,000 to ~2,000-3,500 per session.
- `planner.ts`: `PlanOutput` with `toolGroups` field, Haiku prompt with group selection examples
- `tools.ts`: `getAgentTools(groups?)` with Set-based filtering, core always included
- `engine.ts`: wiring, logging, KV-safe late plan handling, backward-compatible fallback

**Phase 2 (Planned — trigger: quality complaints on complex queries)**: Complexity routing. Haiku determines `executionMode: 'single' | 'specialist' | 'orchestrator'`. Sub-agent candidates: Research, Communication, Business Operations, Automation. Spawned on demand, not always running.

**Phase 3 (Planned — trigger: tool count > 100)**: Multiple orchestrators with top-level intent classifier. Google-MIT multi-orchestrator pattern for 150+ tool tier.

**Key metrics**: $0.017/session (P2 only) → $0.032 blended (hybrid). 90-95% KV cache hit rate. 94-96% accuracy target.
**Decision record**: `.claude/docs/research/tool-architecture-decision.md`
**Research**: `.claude/docs/research/multi-agent-tool-orchestration-research.md`

### T029 — Beta Blockers: Security, Safety, Compliance ✅
7 tier-1 blockers fixed before beta launch:
- [x] GET /api/tasks scoped to user's org_id (was returning all tasks across orgs)
- [x] Agent kill switch — `agents_enabled` column on organisations table, checked in engine.ts before execution. Migration 063
- [x] Outbound comms (send_email, send_sms) always routed through approval queue during beta — no auto-execute path
- [x] Daily send limits using rate_limit_buckets table (key pattern: `send:{channel}:{orgId}:{date}`)
- [x] AI disclosure in privacy policy (Section 7 expanded: model providers, data handling, opt-out)
- [x] AI disclosure banner in chat interface ("Responses are AI-generated")
- [x] Commitment-prevention prompt injected into agent system prompt (no promises, no guarantees, no legal/financial advice)

### T030 — Landing Page Waitlist & Brand Refresh ✅
Replaced full marketing site with waitlist landing page at `bitbit.chat`:
- [x] Waitlist page with orbiting app icons (3 rings, 36 real App Store icons, 3D perspective, CSS keyframe rotation)
- [x] Spotlight beam background effect (diagonal animated gradients)
- [x] Email capture form → Supabase `waitlist_signups` table (server-side API route with service_role key)
- [x] Supabase migration 062: waitlist_signups table with RLS
- [x] New app icon: white background, black BitBit logo, iOS-style rounded corners
- [x] Favicon refresh site-wide (bitbit.chat + app.bitbit.chat): favicon.ico, apple-touch-icon, manifest.json, all metadata
- [x] Google Search Console verification
- [x] Privacy Policy and Terms of Service pages (live at /privacy, /terms)
- [x] Tab title: "Meet BitBit 👋"
- **Vercel project**: `bitbit-landing-page` (separate from dashboard)
