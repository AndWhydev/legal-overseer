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
| T031 | Total Recall — Conversational Memory & Cross-Channel Continuity | architecture | 2026-03-13 |
| T033 | Inbox Redesign & Chat UX | feature | 2026-03-14 |
| T034 | RAG Infrastructure & Launch Readiness (Council Sprint) | architecture+feature | 2026-03-15 |
| T035 | v1.3 Agent Roles & Autonomy Engine (6 phases, 19 plans) | architecture+feature | 2026-03-18 |
| T036 | Post-v1.3 Engine Rewrite & UX Polish | architecture+feature | 2026-03-25 |
| T038 | Monochrome Glassmorphic Design System Overhaul | design+architecture | 2026-03-26 |

## Active Tracks

| ID | Track | Type | Status | Notes |
|----|-------|------|--------|-------|
| T008 | Platform OAuth App Registrations | infrastructure | ~80% complete | Stripe webhook done (API bypass), Meta webhook done (Graph API), Google OAuth + APIs done, Telnyx webhook done (API), Resend DNS verified. Microsoft/Xero/Slack deferred (no accounts) |
| T009 | Context Baseplate | architecture | ~98% complete | Bidirectional context loop fully wired and tested with real data (2026-03-17). Entity mention scanner matches first names (word-boundary). Baseplate snapshots inject into system prompt (Steve West: 4 emails, subjects, dates). Fact extraction fires per-turn via Haiku. Entity profiles refreshed (22/22). Context assembler budget: 16K tokens, systemPrompt 6K max. First-contact intelligence: BitBit scans channels when it doesn't know something. Cross-channel search with deeper Gmail sync. Proactive memory building wired. Remaining: knowledge graph persistence (in-memory only), no-reply contact cleanup |
| T011 | Production Validation & Deployment | infrastructure | Mostly complete | Fly.io + Cloudflare + VPS worker deployed. 23 cron routes. Channel smoke tests now unblocked — all 5 key platform credentials configured. Gmail find_messages tested via chat (Steve West emails retrieved). Load test deferred until channels verified |
| T037 | Lead Discovery & Outreach Campaigns | feature | In progress | LeadSwarm email campaigns, prospect discovery, outreach intelligence, campaign management with plan-limit enforcement. Branch: `feat/lead-discovery-outreach` |

## Planned Tracks

| ID | Track | Type | Priority | Blocked By |
|----|-------|------|----------|------------|
| T010 | Onboarding Flow | feature | P1 | T008, T009. FR-6, FR-8, FR-11, FR-12 already committed |
| T012 | Legal & Revenue Operations | business | P0 | Human-gated. Deferred — Andy's responsibility, Meta Business Verification already complete |
| T013 | Beta Launch Program | business | P1 | T008 mostly unblocked, T012 still blocking |
| T024 | Creator Studio | feature | P3 | - |
| T025 | Knowledge Base | feature | P3 | - |
| T027 | Agent Superpower Toolkit | feature | P1 | Phase 1 shipped (web_search, fetch_url, send_email, send_sms). Phase 2 shipped (browse_website via Playwright headless). Phase 3 (1Password Connect + credential tool + skill extensibility) planned. Spec: `conductor/tracks/T027/spec.md` |
| T028 | Agent Tool Orchestration (ADR-001) | architecture | P2 | Phase 1 shipped. Phase 2 (complexity routing + sub-agents) when quality complaints emerge. Phase 3 (multi-orchestrator) when tools > 100. Decision: `.claude/docs/research/tool-architecture-decision.md` |
| T039 | Composio Integration: Unified Connections | architecture+feature | P1 | Replace ~15 hand-coded channel adapters with Composio managed integrations. Keeps custom bridges (iMessage/WhatsApp/SMS). Unlocks 1000+ apps. Spec: `conductor/tracks/T039/spec.md` |

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
- [x] Configure Vercel cron jobs (16 cron routes including entity-profile-refresh)
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
- **Phase 2 (Shipped)**: `browse_website` (Playwright headless) — navigate, extract, screenshot
- **Phase 3 (P2)**: 1Password Connect Server on Fly + generic credential tool + skill extensibility framework
- **Phase 4 (P3)**: Per-user Fly Sprites (sleep-to-zero VMs with persistent credentials/browser/filesystem)
- Reference: OpenClaw (68K stars, 13,700+ community skills), Stagehand v3, Composio (1000+ integrations)

### T028 — Agent Tool Orchestration (ADR-001)
Scalable tool orchestration architecture based on SOTA research (Manus AI, Anthropic, Google-MIT 2026, Shopify). Hybrid Pattern D: planner-compiled tool groups as default, selective sub-agents for complex multi-domain queries.

**Phase 1 (Shipped)**: Haiku planner selects tool groups → Sonnet receives filtered tools (5-12 instead of 26). KV cache preservation via stable tool sets. Context tokens reduced from ~6,000 to ~2,000-3,500 per session. 6 tool groups: core, memory, channel, web, comms, agentic.
- `planner.ts`: `PlanOutput` with `toolGroups` field, Haiku prompt with group selection examples
- `tools.ts`: `getAgentTools(groups?)` with Set-based filtering, core always included
- `engine.ts`: wiring, logging, KV-safe late plan handling, backward-compatible fallback

**Phase 2 (Planned — trigger: quality complaints on complex queries)**: Complexity routing. Haiku determines `executionMode: 'single' | 'specialist' | 'orchestrator'`. Sub-agent candidates: Research, Communication, Business Operations, Automation. Spawned on demand, not always running.

**Phase 3 (Planned — trigger: tool count > 100)**: Multiple orchestrators with top-level intent classifier. Google-MIT multi-orchestrator pattern for 150+ tool tier.

**Key metrics**: $0.017/session (P2 only) → $0.032 blended (hybrid). 90-95% KV cache hit rate. 94-96% accuracy target.
**Decision record**: `.claude/docs/research/tool-architecture-decision.md`
**Research**: `.claude/docs/research/multi-agent-tool-orchestration-research.md`

### T034 — RAG Infrastructure & Launch Readiness (Council Sprint) ✅
Comprehensive 9-sprint, 77-task execution covering RAG infrastructure (Pinecone + Voyage-3.5 + knowledge graph), production polish, marketing landing page, advanced features (GDPR, analytics, dunning, team management), testing (200+ new tests), performance (embedding queue, dedup, caching), and launch prep (E2E suite, beta gate, DR runbook, launch materials). 38 commits, 73/77 tasks complete. Full spec: `conductor/tracks/T034/spec.md`. Research: `.claude/docs/research/council/`. Remaining: WhatsApp token (manual) + 4 post-launch operational tasks.

### T036 — Post-v1.3 Engine Rewrite & UX Polish ✅
Batch of engine, UX, and stability work spanning 2026-03-19 to 2026-03-25. 30 commits.
- [x] TAOR loop engine — clean harness replacing 1,100-line engine.ts with unbounded Think-Act-Observe-Reflect pattern. Old engine becomes thin re-export shim. Pre-flight and tool-executor extracted to standalone modules
- [x] Sub-agent decomposition — `spawn_agent` tool for isolated sub-agent tasks, freeform swarm decomposition, sub-agent events in UI
- [x] Deferred tool loading — eager core tools + on-demand growth tools to reduce initial context
- [x] SOTA chat UX upgrade (10 features) — syntax-highlighted code blocks (shiki), regenerate response, thumbs feedback, follow-up chips, artifact/canvas panel, voice input (Web Speech API), slash command palette, message editing with forking, conversation search + history API, export (markdown/JSON)
- [x] Monochrome login page with force field background + branded Supabase auth emails
- [x] Collective voice refactor — 'we/us' language across dashboard UI
- [x] Critical security fix: org_id isolation enforced on 8 API routes (multi-tenancy data leak)
- [x] Memory system fix: write/read table mismatch unified on memory_palace_entries
- [x] Stabilization migrations: create missing tables, fix organisations view
- [x] Triage notification loop fix, automated email classification
- [x] Message routing fix: ingested messages routed to correct org via sender→contact identity resolution

### T038 — Monochrome Glassmorphic Design System Overhaul ✅
Complete UI/UX redesign from orange-accent to pure monochrome glassmorphic system. 150+ files modified across 10+ parallel agent sprints on 2026-03-26.

**Design System Foundation:**
- [x] Created `src/lib/styles/design-tokens.ts` — `S` (style objects) + `C` (color constants), fully monochrome with CSS vars for theme awareness
- [x] Created `GlassToggle` — unified segmented toggle component with sliding indicator + spring animation
- [x] Created `GlassDropdown` — unified dropdown component with fixed-width grid trick, 40px blur menu
- [x] Rewrote `StatusPill` — monochrome glass badge, status meaning via dot color only, minimal mode
- [x] Created `EmptyState` — BitBit logo watermark, theme-aware filter, centered layout
- [x] Created `bb-glass-input` CSS class — standalone glass inputs that override theme `!important` borders
- [x] 10 micro-animation keyframes (`bb-fade-up`, `bb-scale-in`, `bb-modal-in`, `bb-expand`, etc.) + `.bb-stagger`, `.bb-lift`, `.bb-modal-enter` utility classes
- [x] Updated STYLE_GUIDE.md with 9 rules including glass hierarchy principle

**Color Purge:**
- [x] Stripped #FF5A1F orange from 63+ component files → monochrome white accent
- [x] Stripped #1A1A1B dark buttons from 8+ files → `var(--btn-primary-bg)` theme-aware
- [x] All 3 theme files (midnight/aurora/light) neutralized — orange vars → monochrome
- [x] CSS design system v4.0 — monochrome vars, theme-aware tokens, no decorative colors
- [x] Text selection, focus rings, notification icons all monochrome

**Glass Hierarchy Rule:**
- [x] Glass = top-level surfaces only (backdrop blur + inset shadow, no border)
- [x] Children inside glass = flat with subtle stroke + dim fill
- [x] Sidebar/rail = minimal, not glassmorphic
- [x] Documented in STYLE_GUIDE.md rule #4

**Light Mode:**
- [x] 127 files: hardcoded `rgba()` → CSS variables that flip per theme
- [x] Page bg darkened to #F5F5F4 for card contrast
- [x] Cards differentiated by shadow not border (stronger shadows)
- [x] Toggle/pill active states use drop shadow for 3D effect in light mode
- [x] `--toggle-active-shadow`, `--pill-active-bg` CSS vars for theme-aware components

**Dark Mode:**
- [x] Stronger card shadows (`--card-shadow` multi-layer: `0 2px 8px` + `0 8px 32px`)
- [x] All midnight theme `!important` borders → `none !important`
- [x] 28+ component files updated with combined drop+inset shadows
- [x] `--toggle-active-shadow` includes glass inset highlight

**Component Overhauls:**
- [x] Kanban cards: full redesign — minimal 3-row layout, no visual noise, shadow clipping fixed
- [x] Lead detail: right drawer → center modal with spring animation
- [x] Lead list view: flat inbox-style rows, micro-animated detail expand
- [x] Kanban DnD: removed tilt/offset, clean cursor tracking
- [x] Email Campaigns: consolidated stat bar, EmptyState integration, design tokens
- [x] Invoice template: A4 preview with ResizeObserver scaling, color picker 40x40, GST iOS toggle
- [x] Notification badge: smaller text (10/11/12px), pill shape, no stroke
- [x] Toast notifications: glassmorphic with `bb-fade-up` animation
- [x] All 27 EmptyState instances → BitBit logo watermark

**Performance:**
- [x] Smart view filtering: instant client-side (no API re-fetch)
- [x] Score/Source dropdowns: client-side filtering
- [x] Search debounced at 300ms
- [x] Leads rate limiting: skip for authenticated GET reads
- [x] Inbox channel/priority filtering: client-side (no re-fetch)

**Feature Fixes:**
- [x] Invoice creation: fallback to direct creation when no agent config
- [x] Inbox reply: created API route, wired to channel adapters
- [x] Inbox archive/snooze/done/spam: fixed JSONB metadata overwrite bugs
- [x] Inbox delete: moved from client-side to proper API
- [x] Contacts: auto-retry on error (3s), shimmer skeleton
- [x] PCC → Lead Swarm renamed across 10+ files
- [x] Automations → Plugins renamed across 5 files
- [x] Contacts scroll bug fixed
- [x] Global custom scrollbar (WebKit + Firefox)
- [x] AI search info card dismissible with localStorage
- [x] Reports padding root-caused (double 24px) and fixed

**Code Simplification:**
- [x] 3 inline dropdown implementations → shared GlassDropdown
- [x] 2 unused Radix components deleted (select.tsx, dropdown-menu.tsx)
- [x] Design tokens adopted across leads-toolbar, lead-detail-drawer, outreach-dashboard, tenders-tab
- [x] 42 hardcoded rgba backgrounds replaced across swarm/memory/meetings/portal

### T037 — Lead Discovery & Outreach Campaigns (in progress)
Native lead discovery and email outreach integration into the BitBit dashboard. Branch: `feat/lead-discovery-outreach`.
- [x] Supabase migration for email_templates, email_campaigns, campaign_leads tables
- [x] API routes: campaign CRUD (`/api/agent/leads/campaigns`), template management (`/api/agent/leads/templates`), prospect discovery (`/api/agent/leads/discover`), email sending via Resend
- [x] Plan-limit enforcement on campaign send route (plan-tier gating)
- [x] Campaign sender with Resend SDK integration
- [x] React hooks: `use-campaigns`, `use-templates`, `use-prospect-discovery`
- [x] Outreach dashboard component with campaign metrics
- [x] Prospect discovery panel with search and ProspectCard display
- [x] Outreach intelligence panel (opportunity notes, outreach angles, priority services by category)
- [x] Website signals panel, score breakdown panel, next action panel
- [ ] Uncommitted: UI polish across ~55 files (leads components, dashboard tabs, data-viz, chat components, sidebar, splash screen)
- [ ] Campaign analytics and reporting
- [ ] Template A/B testing

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

### T031 — Total Recall: Conversational Memory & Cross-Channel Continuity ✅
Persistent conversation threads with cross-channel identity resolution, tiered compression, action execution, and a unified pipeline. 33 files changed, +9,138/-366 lines. Committed `2c8e081b`, pushed to origin/main 2026-03-13.

**New tables** (migration 067): `conversation_threads`, `conversation_messages`, `thread_summaries`, `channel_identities`. Plus execution columns on `approval_queue` (execution_started_at, execution_completed_at, execution_result, execution_error, retry_count) and `approve_action` tool.

**New modules**:
- `src/lib/conversation/identity-resolver.ts` — Cross-channel identity resolution: web auth, WhatsApp/SMS channel_identities → contacts fallback, email → contact_emails, Slack/iMessage channel_identities
- `src/lib/conversation/thread-resolver.ts` — One active thread per user per org, inherits compiled_summary from archived threads
- `src/lib/conversation/unified-pipeline.ts` — 7-step async generator: identity → thread → store inbound → load history → engine → store response → post-processing
- `src/lib/context-assembly/context-assembler.ts` — 4-tier context assembly with parallel fetch, Anthropic message format conversion, pending actions formatting
- `src/lib/context-assembly/token-budget-manager.ts` — Priority-based token allocation across 6 tiers within 8K budget
- `src/lib/memory/conversation-compressor.ts` — 3-tier compression: verbatim (last 10), compressed (11-30), key facts (31+) via Haiku
- `src/lib/memory/memory-consolidator.ts` — Per-turn pipeline with high-value signal gating, contradiction detection against semantic_memories
- `src/lib/memory/thread-archiver.ts` — Compiled summary generation, stale thread archival via RPC
- `src/lib/agent/action-executor.ts` — TRANSPORT_MAP dispatcher (7 action types), idempotency guard, retry with exponential backoff

**Modified files**: engine.ts (history + ContextAssembler integration), prompt-builder.ts (pending approvals section), tools.ts (approve_action tool), approval-queue.ts (fire-and-forget execution), approvals/route.ts (belt-and-suspenders execution), chat/route.ts (threadId support), chat-interface.tsx (history loading, threadId persistence)

**New cron**: `/api/cron/archive-threads` (*/15, stale thread archival)

**Architecture docs**: `.planning/total-recall/` (5 architecture docs + unified synthesis in 06-synthesis.md)

**Remaining**:
- [ ] Apply migration 067 to Supabase remote (`supabase db push`)
- [ ] Phase 5: Channel adapter migration (WhatsApp/SMS/email through unified pipeline — currently only web chat routes through it)
- [ ] Phase 7: Deprecate ConversationRouter string-packing, message cleanup cron, identity backfill
- [ ] Channel badges and Realtime subscription in chat-interface.tsx (nice-to-have)

### T039 — Composio Integration: Unified Connections Layer
Replace ~15 hand-coded channel adapters (~5,200 LOC) with Composio's managed integration platform. Full spec: `conductor/tracks/T039/spec.md`
- **Phase 1 (P0)**: Foundation — `@composio/core` SDK, Gmail proof-of-concept migration, Composio OAuth flow in dashboard, callback route
- **Phase 2 (P1)**: Bulk migration of 15 adapters (Gmail, Outlook, Google Calendar, Asana, Calendly, Stripe, Slack, Xero, Instagram, Facebook, Telegram, ClickUp, WordPress, GA4, GSC) + real-time triggers replacing poll crons
- **Phase 3 (P2)**: Agent tool expansion (Composio actions in TAOR engine), cleanup old adapters
- **Keeps custom**: iMessage (BlueBubbles), WhatsApp (Baileys), Android Messages (Beeper), SMS (Telnyx), macOS Calendar/Reminders
- **Unlocks**: HubSpot, Notion, Linear, Jira, Salesforce, Shopify, Zendesk, Discord, and 900+ more apps with zero custom code
- **Cost**: Free tier (20K calls/mo) covers beta; $29/mo at 20 users; $229/mo at production scale
- Reference: Composio SDK (`@composio/core`), Vercel AI provider (`@composio/vercel`), Claude Agent SDK provider (`@composio/claude-agent-sdk`)
