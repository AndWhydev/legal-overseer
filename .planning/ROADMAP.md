# Roadmap: BitBit AWU

## Milestones

- v1.0 MVP -- Phases 1-6 (shipped 2026-02-21)
- v1.1 Agent Runtime + First Agents -- Phases 7-12 (shipped 2026-02-22)
- v1.2 Battle-Testing & Sellability -- Phases 13-19 (shipped 2026-03-02)
- v1.4 Media, Billing & Growth Roles -- Phases 20-29 (in progress, gap closure phases 27-29 pending)
- v1.5 Beta Launch & First Revenue -- Phases 30-36 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-6) -- SHIPPED 2026-02-21</summary>

- [x] Phase 1: Platform Deploy (4/4 plans) -- completed 2026-02-21
- [x] Phase 2: Schema Expansion (4/4 plans) -- completed 2026-02-21
- [x] Phase 3: Semantic Context Engine (3/3 plans) -- completed 2026-02-21
- [x] Phase 4: Agent Infrastructure (4/4 plans) -- completed 2026-02-21
- [x] Phase 5: Wire Integration Points (2/2 plans) -- completed 2026-02-21
- [x] Phase 6: Verification Artifacts (2/2 plans) -- completed 2026-02-21

</details>

<details>
<summary>v1.1 Agent Runtime + First Agents (Phases 7-12) -- SHIPPED 2026-02-22</summary>

### Phase 7: Infrastructure Foundation
**Goal**: Agent infrastructure is production-ready -- DI pattern eliminates module-level Supabase coupling, agent runs are logged with cost tracking, and v1.0 agent infra (confidence routing, shared CRUD tools) is verified working
**Depends on**: Phase 6 (v1.0 complete)
**Requirements**: INFR-01, INFR-02, INFR-03
**Success Criteria** (what must be TRUE):
  1. All tools receive Supabase client from execution context, not module-level import
  2. Every agent execution logs token count, cost, actions taken, and confidence score to the database
  3. Confidence routing (act/ask/escalate) produces correct decisions when given test inputs in production
  4. Shared CRUD tools (contact, task, invoice operations) execute successfully against production Supabase
**Plans**: 2 plans

Plans:
- [x] 07-01-PLAN.md -- Supabase DI refactor
- [x] 07-02-PLAN.md -- Agent run logging and v1.0 infra verification

### Phase 8: Agent Runtime
**Goal**: Messages flow automatically from Gmail into BitBit, get classified with full context awareness, and route to the correct processing path
**Depends on**: Phase 7
**Requirements**: RNTM-01, RNTM-02, RNTM-03, RNTM-04
**Success Criteria** (what must be TRUE):
  1. Gmail messages appear in BitBit within the configured poll interval without manual intervention
  2. Each incoming message receives a significance score (1-10), time sensitivity, and recommended actions via LLM classification
  3. High-significance urgent messages route to immediate processing while low-significance messages batch or skip
  4. Agents trigger on their configured cron schedules
**Plans**: 3 plans

Plans:
- [x] 08-01-PLAN.md -- Channel relay daemon
- [x] 08-02-PLAN.md -- LLM classification and action routing
- [x] 08-03-PLAN.md -- Agent scheduler

### Phase 9: Approval Flow
**Goal**: Andy controls agent autonomy -- low-confidence actions require his approval via dashboard or WhatsApp before executing
**Depends on**: Phase 8
**Requirements**: APPR-01, APPR-02, APPR-03, APPR-04, APPR-05
**Success Criteria** (what must be TRUE):
  1. Agent actions with confidence >0.85 execute automatically; 0.55-0.85 queue for approval; <0.55 escalate
  2. Dashboard shows pending agent actions with context to approve/reject
  3. Andy receives WhatsApp messages for actions needing approval
  4. Y/N WhatsApp replies execute queued actions
  5. Low-priority approvals batch into daily digest
**Plans**: 3 plans

Plans:
- [x] 09-01-PLAN.md -- Approval queue DB, service, and API
- [x] 09-02-PLAN.md -- Dashboard approval queue UI
- [x] 09-03-PLAN.md -- WhatsApp approval notifications and digest

### Phase 10: Sentry Agent
**Goal**: BitBit monitors for problems and alerts Andy with suggested fixes
**Depends on**: Phase 8, Phase 9
**Requirements**: SNTR-01, SNTR-02, SNTR-03, SNTR-04
**Plans**: 4 plans

Plans:
- [x] 10-01 through 10-04 -- Sentry core, escalation, dashboard

### Phase 11: Lead Swarm Agent
**Goal**: Inbound leads are automatically classified, qualified, and fast-tracked
**Depends on**: Phase 8, Phase 9
**Requirements**: LEAD-01, LEAD-02, LEAD-03, LEAD-04, LEAD-05
**Plans**: 4 plans

Plans:
- [x] 11-01 through 11-04 -- Lead intake, approval, pipeline, gap closure

### Phase 12: Invoice Flow Agent
**Goal**: Andy says "Invoice Sezer for the White House RE work" and BitBit handles it end-to-end
**Depends on**: Phase 8, Phase 9
**Requirements**: INVC-01, INVC-02, INVC-03, INVC-04, INVC-05
**Plans**: 3 plans

Plans:
- [x] 12-01 through 12-03 -- NL resolution, PDF/send, APIs/dashboard

</details>

<details>
<summary>v1.2 Battle-Testing & Sellability (Phases 13-19) -- SHIPPED 2026-03-02</summary>

### Phase 13: Deployment Stability
**Goal**: Platform runs reliably in production with all infrastructure components operational
**Depends on**: Phase 12 (v1.1 complete)
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-05, DEPLOY-06
**Success Criteria** (what must be TRUE):
  1. Vercel production build deploys cleanly and all pages load without errors
  2. All 9 cron jobs fire on schedule and complete successfully over a 24-hour observation window
  3. Agent classification requests return in under 3 seconds from cold start
  4. 10 concurrent agent requests execute without connection pool exhaustion
  5. Fly.io workers and Cloudflare edge cron are deployed and responding to health checks
**Plans**: 4 plans

Plans:
- [x] 13-01-PLAN.md -- Vercel build hardening + cron route guard
- [x] 13-02-PLAN.md -- Connection pooling + cold start optimization
- [x] 13-03-PLAN.md -- Fly.io worker + Cloudflare edge cron deployment readiness
- [x] 13-04-PLAN.md -- CI/CD multi-runtime pipeline + verification checkpoint

### Phase 14: Channel Relay & OAuth
**Goal**: Users can connect all channels from settings and messages flow through classification pipeline reliably
**Depends on**: Phase 13
**Requirements**: CHAN-01, CHAN-02, CHAN-04, CHAN-05, OAUTH-01, OAUTH-02, OAUTH-03, OAUTH-04, OAUTH-05, OAUTH-06, OAUTH-07, OAUTH-08
**Plans**: 5 plans

Plans:
- [x] 14-01 through 14-05 -- OAuth provider registration, channel APIs, settings UI, dedup, environment provisioning

### Phase 15: WhatsApp Pipeline
**Goal**: Andy can interact with BitBit via WhatsApp including voice notes, multi-turn conversations, and approvals
**Depends on**: Phase 14
**Requirements**: WHATS-01, WHATS-02, WHATS-03, WHATS-04, WHATS-05, CHAN-03
**Plans**: 2 plans

Plans:
- [x] 15-01-PLAN.md -- Baileys bridge worker, voice note transcription, webhook audio handling
- [x] 15-02-PLAN.md -- Multi-turn context resolution, approval hardening, latency instrumentation

### Phase 16: Confidence Routing Validation
**Goal**: Confidence routing produces reliable auto-act/approve/escalate decisions across all agents
**Depends on**: Phase 13
**Requirements**: CONF-01, CONF-02, CONF-03, CONF-04, CONF-05
**Plans**: 2 plans

Plans:
- [x] 16-01-PLAN.md -- 50 AWU scenario dataset, per-agent threshold tuning, confidence scoring harness
- [x] 16-02-PLAN.md -- False positive measurement, model-tier validation, adversarial test suite

### Phase 17: Invoice & Lead Validation
**Goal**: Invoice and lead agent flows work end-to-end with production-quality output
**Depends on**: Phase 13, Phase 16
**Requirements**: INVC-06, INVC-07, INVC-08, INVC-09, INVC-10, LEAD-01, LEAD-02, LEAD-03
**Plans**: 3 plans

Plans:
- [x] 17-01 through 17-03 -- Entity resolution, PDF branding, lead classification

### Phase 18: Integration Fixes & Tech Debt
**Goal**: All broken integrations and tech debt from completed phases are fixed
**Depends on**: Phase 15
**Plans**: 3 plans

Plans:
- [x] 18-01 through 18-03 -- Relay daemon rewire, Fly.io worker, TS error fixes

### Phase 19: Credential Provisioning & Live Verification
**Goal**: All OAuth channels work end-to-end in production with real credentials
**Depends on**: Phase 18
**Plans**: 3 plans

Plans:
- [x] 19-01 through 19-03 -- WhatsApp bridge deployment, OAuth verification, credential provisioning

</details>

### v1.4 Media, Billing & Growth Roles

**Milestone Goal:** Close the media gap (file attachments in chat), add Stripe billing infrastructure for public launch readiness, and ship Growth Roles that extend the agent engine into marketing/content/sales domains.

- [x] **Phase 20: File Attachments & Multimedia** - Users can upload, preview, and have BitBit analyse files in chat (completed 2026-03-18)
- [x] **Phase 21: Billing Infrastructure** - Stripe subscription lifecycle, plan gating, usage metering, and pricing page (completed 2026-03-18)
- [x] **Phase 22: Cost Controls & Ad Script Generator** - Per-execution budgets protect against token spirals; first growth role proves the pattern (completed 2026-03-18)
- [x] **Phase 23: SEO Monitor & Tender Hunter** - Wrap existing 700+ LOC implementations as plan-gated agent tools with scheduled ticks (completed 2026-03-18)
- [x] **Phase 24: Content Creator** - Social media post drafting and blog generation via chat with platform-specific formatting (completed 2026-03-18)
- [x] **Phase 22b: Comms Role** - Wraps channel triage as a role with follow-up tracking, relationship monitoring, tone adaptation, and escalation workflows (completed 2026-03-26)
- [x] **Phase 23b: Sales Role** - Wraps lead swarm as a role with proposal generation, lead nurture, client onboarding, win/loss learning, and pipeline analytics (completed 2026-03-26)
- [x] **Phase 24b: Intelligence Layer** - Revenue radar, client health scoring, cash flow projections, capacity oracle, cron recomputation, and API routes (completed 2026-03-26)
- [x] **Phase 25: Role Dashboard** - Unified role activity feed, status cards, autonomy controls, attention view, intelligence widgets, and dashboard integration (completed 2026-03-26)
- [x] **Phase 26: SOTA Response Drafter** - Wire ContextAssembler + RAG + Memory Palace + entity briefings into the response drafter for contextually rich, business-aware reply generation (completed 2026-03-26)
- [x] **Phase 27: Role Runtime Import Fix** - Fix critical role domain module imports so cron-triggered role execution actually fires (gap closure, completed 2026-03-27)
- [x] **Phase 28: Intelligence Dashboard Wiring** - Wire IntelligenceWidgets to correct API endpoints so dashboard displays live data (gap closure) (completed 2026-03-27)
- [x] **Phase 29: SEO/Tender Scheduled Monitoring** - Add scheduled ticks and alert pathways for SEO and Tender tools (gap closure) (completed 2026-03-27)

## Phase Details

(v1.4 phase details omitted for brevity -- see git history for full phase detail entries)

### Phase 27: Role Runtime Import Fix
**Goal**: Role domain modules are imported in the cron runtime path so scheduled role execution actually fires -- finance, comms, and sales roles execute on their 5-minute tick
**Depends on**: Phase 26 (current codebase)
**Gap Closure**: Closes critical integration gap + "Role scheduled execution" broken flow from audit
**Requirements**: ROLE-RUNTIME-01, ROLE-RUNTIME-02
**Plans**: 1 plan

Plans:
- [x] 27-01-PLAN.md -- Side-effect imports for domain role registration + revenue-intelligence cron entry

### Phase 28: Intelligence Dashboard Wiring
**Goal**: IntelligenceWidgets fetches from the correct /api/intelligence/[metric] endpoints and displays live business intelligence data instead of permanent "Gathering data..." state
**Depends on**: Phase 27 (role runtime must work to produce intelligence data)
**Gap Closure**: Closes major integration gap + "Intelligence dashboard display" broken flow from audit
**Requirements**: INT-WIRE-01, INT-WIRE-02, INT-WIRE-03, INT-WIRE-04
**Plans**: 1 plan

Plans:
- [ ] 28-01-PLAN.md -- Rewire widget fetch to /api/intelligence/[metric] endpoints with response shape mapping

### Phase 29: SEO/Tender Scheduled Monitoring
**Goal**: SEO and Tender tools run on scheduled ticks and proactively alert users of ranking drops and new tender matches without requiring chat invocation
**Depends on**: Phase 27 (role runtime must work for role-based scheduling)
**Requirements**: SEO-03, SEO-04, TNDR-03, TNDR-04
**Plans**: 1 plan

Plans:
- [ ] 29-01-PLAN.md -- Growth role implementation (DB migration, type extension, SEO/Tender monitor wrappers, cron wiring, tests)

### v1.5 Beta Launch & First Revenue

**Milestone Goal:** Close every gap between feature-complete dogfood and real paying users. Ship onboarding, verify production channels, build the marketing funnel, launch beta, add premium features.

- [ ] **Phase 30: Onboarding E2E & First-Run Experience** — Verify all onboarding FRs, first-run channel discovery, empty state guidance, welcome conversation
- [ ] **Phase 31: Channel Smoke Tests & Production Hardening** — Live credential tests, concurrent load, cron resilience, monitoring dashboard
- [ ] **Phase 32: Marketing Site & Checkout Flow** — Product landing page, industry pages, AWU case study, pricing with Stripe Checkout, SEO
- [x] **Phase 33: Beta Program Infrastructure** — Invite flow, guided onboarding, feedback collection, usage monitoring, beta user admin (completed 2026-03-27)
- [ ] **Phase 34: Builder Role (Premium Differentiator)** — Website generation via chat, template library, WordPress/Elementor integration, staging preview
- [ ] **Phase 35: Proactive Workflows & Standing Orders** — NL workflow rules, multi-step sequences, cross-role orchestration, workflow dashboard
- [ ] **Phase 36: Mobile-First Experience** — React Native/Expo app, push notifications, voice input, offline queue, quick actions

**Dependency Graph:** Phases 30-32 parallel --> Phase 33 --> Phase 34 --> Phases 35-36


### Phase 30: Onboarding E2E & First-Run Experience
**Goal**: New users can sign up, connect Gmail, and have BitBit working within 5 minutes. Every dashboard page has contextual empty states. First-run channel discovery auto-builds user context.
**Depends on**: Phase 26 (current codebase)
**Requirements**: ONBD-01, ONBD-02, ONBD-03, ONBD-04, ONBD-05
**Success Criteria** (what must be TRUE):
  1. All 12 T010 functional requirements pass end-to-end
  2. First-run channel discovery scans last 30 days, builds identity + contacts + threads in 60 seconds
  3. Every dashboard page shows contextual empty state guidance, not blank screens
  4. Connection wizard persists progress across browser refresh
  5. Welcome conversation uses real user data from discovery scan
**Plans**: 3 plans (2 waves)

Plans:
- [ ] 30-01-PLAN.md -- T010 FR verification, onboarding wizard hardening, E2E test update
- [ ] 30-02-PLAN.md -- Contextual empty states for all dashboard pages
- [ ] 30-03-PLAN.md -- First-run channel discovery pipeline and welcome conversation

### Phase 31: Channel Smoke Tests & Production Hardening
**Goal**: All production channels verified working with real credentials. System handles concurrent load and cron failures gracefully. Monitoring dashboard shows production health.
**Depends on**: Phase 30 (parallel, no hard dependency)
**Requirements**: CHAN-SMOKE-01, CHAN-SMOKE-02, CHAN-SMOKE-03, CHAN-SMOKE-04, CHAN-SMOKE-05, CHAN-SMOKE-06, CHAN-SMOKE-07
**Success Criteria** (what must be TRUE):
  1. Gmail adapter connects with real OAuth credentials and pulls test messages within poll interval
  2. Outlook adapter connects via Graph API and verifies message pull against production tenant
  3. WhatsApp bridge at bitbit-wa-bridge.fly.dev maintains stable connection for 24+ hours
  4. Telnyx SMS sends a test message and receives delivery confirmation webhook
  5. 10 concurrent agent executions complete without connection pool exhaustion or timeout
  6. All 22 cron routes handle DB failure (retry+DLQ), LLM timeout (circuit breaker), rate limit (backoff), and partial batch failure gracefully
  7. Production monitoring dashboard shows cron success rate, agent latency, channel health, error rates, and token spend
**Plans**: 3 plans (2 waves)

Plans:
- [ ] 31-01-PLAN.md -- Channel adapter smoke tests (Gmail, Outlook, WhatsApp, SMS live connectivity verification)
- [ ] 31-02-PLAN.md -- Load testing (10 concurrent agents) + cron resilience utilities (retry, backoff, batch processing)
- [ ] 31-03-PLAN.md -- Production monitoring dashboard (API + MonitoringTab UI + smoke test trigger)

### Phase 32: Marketing Site & Checkout Flow
**Goal**: A stranger can land on bitbit.chat, understand what BitBit does, pick a plan, and pay -- product landing page, industry pages, case study, and pricing with live Stripe Checkout
**Depends on**: None (parallel with Phases 30, 31)
**Requirements**: MKTG-01, MKTG-02, MKTG-03, MKTG-04, MKTG-05
**Success Criteria** (what must be TRUE):
  1. bitbit.chat shows professional product landing page with hero, features, roles, social proof, pricing CTA
  2. Three industry pages exist: Marketing Agencies, Trades & Services, Professional Services
  3. AWU case study page with problem, solution, results (real metrics), and Andy quote
  4. Pricing page with feature comparison matrix and working Stripe Checkout for all tiers
  5. SEO foundation: structured data, meta tags, Open Graph, sitemap, robots
**Plans**: 3 plans (2 waves)

Plans:
- [ ] 32-01-PLAN.md -- Product landing page (hero, features, roles, social proof, CTA) + 3 industry pages + NavBar/Footer updates
- [ ] 32-02-PLAN.md -- Pricing page enhancement (comparison matrix, Free tier, FAQ) + AWU case study page
- [ ] 32-03-PLAN.md -- SEO foundation (sitemap, robots, Open Graph, JSON-LD structured data)

### Phase 33: Beta Program Infrastructure
**Goal**: Admin can invite waitlist users to beta, beta users get guided onboarding with daily tips and feedback collection, admin can monitor per-org usage metrics
**Depends on**: Phases 30-32 (parallel)
**Requirements**: BETA-01, BETA-02, BETA-03, BETA-04, BETA-05
**Success Criteria** (what must be TRUE):
  1. Admin can select waitlist entries and send invite emails with unique setup links
  2. Beta users receive daily tips based on account age
  3. In-app feedback widget captures category, free text, and optional screenshot
  4. Admin dashboard shows per-org metrics (active days, messages, agent runs, tokens, errors)
  5. System supports 10 concurrent beta orgs without degradation
**Plans**: 1 plan

Plans:
- [x] 33-01-PLAN.md -- Beta invite flow, feedback widget, admin metrics dashboard, daily tips

## Progress

**Execution Order:**
Phase 20 first (no dependencies), then 21 (billing before growth roles), then 22 (cost controls + first growth role), then 23 and 24 can run in parallel (both depend on 22).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Platform Deploy | v1.0 | 4/4 | Complete | 2026-02-21 |
| 2. Schema Expansion | v1.0 | 4/4 | Complete | 2026-02-21 |
| 3. Semantic Context Engine | v1.0 | 3/3 | Complete | 2026-02-21 |
| 4. Agent Infrastructure | v1.0 | 4/4 | Complete | 2026-02-21 |
| 5. Wire Integration Points | v1.0 | 2/2 | Complete | 2026-02-21 |
| 6. Verification Artifacts | v1.0 | 2/2 | Complete | 2026-02-21 |
| 7. Infrastructure Foundation | v1.1 | 2/2 | Complete | 2026-02-22 |
| 8. Agent Runtime | v1.1 | 3/3 | Complete | 2026-02-22 |
| 9. Approval Flow | v1.1 | 3/3 | Complete | 2026-02-22 |
| 10. Sentry Agent | v1.1 | 4/4 | Complete | 2026-02-22 |
| 11. Lead Swarm Agent | v1.1 | 4/4 | Complete | 2026-02-22 |
| 12. Invoice Flow Agent | v1.1 | 3/3 | Complete | 2026-02-22 |
| 13. Deployment Stability | v1.2 | 4/4 | Complete | 2026-03-01 |
| 14. Channel Relay & OAuth | v1.2 | 5/5 | Complete | 2026-03-02 |
| 15. WhatsApp Pipeline | v1.2 | 2/2 | Complete | 2026-03-02 |
| 16. Confidence Routing Validation | v1.2 | 2/2 | Complete | 2026-03-02 |
| 17. Invoice & Lead Validation | v1.2 | 3/3 | Complete | 2026-03-02 |
| 18. Integration Fixes & Tech Debt | v1.2 | 3/3 | Complete | 2026-03-02 |
| 19. Credential Provisioning & Live Verification | v1.2 | 3/3 | Complete | 2026-03-02 |
| 20. File Attachments & Multimedia | v1.4 | 3/3 | Complete | 2026-03-18 |
| 21. Billing Infrastructure | v1.4 | 3/3 | Complete | 2026-03-18 |
| 22. Cost Controls & Ad Script Generator | v1.4 | 2/2 | Complete | 2026-03-18 |
| 23. SEO Monitor & Tender Hunter | v1.4 | 2/2 | Complete | 2026-03-18 |
| 24. Content Creator | v1.4 | 1/1 | Complete | 2026-03-18 |
| 22b. Comms Role | v1.4 | 3/3 | Complete | 2026-03-26 |
| 23b. Sales Role | v1.4 | 3/3 | Complete | 2026-03-26 |
| 24b. Intelligence Layer | v1.4 | 3/3 | Complete | 2026-03-26 |
| 25. Role Dashboard | v1.4 | 3/3 | Complete | 2026-03-26 |
| 26. SOTA Response Drafter | v1.4 | 2/2 | Complete | 2026-03-26 |
| 27. Role Runtime Import Fix | v1.4 | Complete    | 2026-03-27 | 2026-03-27 |
| 28. Intelligence Dashboard Wiring | 1/1 | Complete    | 2026-03-27 | - |
| 29. SEO/Tender Scheduled Monitoring | 1/1 | Complete   | 2026-03-27 | - |
| 30. Onboarding E2E & First-Run Experience | 2/3 | In Progress|  | - |
| 31. Channel Smoke Tests & Production Hardening | v1.5 | 0/3 | Planned | - |
| 32. Marketing Site & Checkout Flow | 1/3 | In Progress|  | - |
| 33. Beta Program Infrastructure | v1.5 | 1/1 | Complete | 2026-03-27 |

**Overall:** 57/57 plans complete for v1.0+v1.1+v1.2 (100%). v1.4: 24/28 plans (Phases 20-27 complete, 28-29 pending). v1.5: Phase 33 complete (1/1), Phases 30-32 planned (9 plans).
