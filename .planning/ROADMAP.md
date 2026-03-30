# Roadmap: BitBit AWU

## Milestones

- v1.0 MVP -- Phases 1-6 (shipped 2026-02-21)
- v1.1 Agent Runtime + First Agents -- Phases 7-12 (shipped 2026-02-22)
- v1.2 Battle-Testing & Sellability -- Phases 13-19 (shipped 2026-03-02)
- ✅ v1.4 Media, Billing & Growth Roles — Phases 20-28 (shipped 2026-03-27)
- ✅ v1.5 Beta Launch & First Revenue — Phases 29-36 (shipped 2026-03-28)

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

<details>
<summary>v1.4 Media, Billing & Growth Roles (Phases 20-28) -- SHIPPED 2026-03-27</summary>

- [x] Phase 20: File Attachments & Multimedia (3/3 plans) -- completed 2026-03-18
- [x] Phase 20b: Role Engine Foundation (4/4 plans) -- completed 2026-03-26
- [x] Phase 21: Billing Infrastructure (3/3 plans) -- completed 2026-03-18
- [x] Phase 21b: Finance Role (3/3 plans) -- completed 2026-03-26
- [x] Phase 22: Cost Controls & Ad Script Generator (2/2 plans) -- completed 2026-03-18
- [x] Phase 22b: Comms Role (3/3 plans) -- completed 2026-03-26
- [x] Phase 23: SEO Monitor & Tender Hunter (2/2 plans) -- completed 2026-03-18
- [x] Phase 23b: Sales Role (3/3 plans) -- completed 2026-03-26
- [x] Phase 24: Content Creator (1/1 plan) -- completed 2026-03-18
- [x] Phase 24b: Intelligence Layer (3/3 plans) -- completed 2026-03-26
- [x] Phase 25: Role Dashboard (3/3 plans) -- completed 2026-03-26
- [x] Phase 26: SOTA Response Drafter (2/2 plans) -- completed 2026-03-26
- [x] Phase 27: Role Runtime Import Fix (1/1 plan) -- completed 2026-03-27
- [x] Phase 28: Intelligence Dashboard Wiring (1/1 plan) -- completed 2026-03-27

Full details: milestones/v1.4-ROADMAP.md

</details>

<details>
<summary>v1.5 Beta Launch & First Revenue (Phases 29-36) -- SHIPPED 2026-03-28</summary>

**Milestone Goal:** Close every gap between feature-complete dogfood and real paying users. Ship onboarding, verify production channels, build the marketing funnel, launch beta, add premium features.

- [x] **Phase 29: SEO/Tender Scheduled Monitoring** — Proactive SEO/Tender monitoring via growth role on scheduled ticks (completed 2026-03-27)
- [x] **Phase 30: Onboarding E2E & First-Run Experience** — Verify all onboarding FRs, first-run channel discovery, empty state guidance, welcome conversation (completed 2026-03-27)
- [x] **Phase 31: Channel Smoke Tests & Production Hardening** — Live credential tests, concurrent load, cron resilience, monitoring dashboard (completed 2026-03-27)
- [x] **Phase 32: Marketing Site & Checkout Flow** — Product landing page, industry pages, AWU case study, pricing with Stripe Checkout, SEO (completed 2026-03-27)
- [x] **Phase 33: Beta Program Infrastructure** — Invite flow, guided onboarding, feedback collection, usage monitoring, beta user admin (completed 2026-03-27)
- [x] **Phase 34: Builder Role (Premium Differentiator)** — Website generation via chat, template library, WordPress/Elementor integration, staging preview (completed 2026-03-27)
- [x] **Phase 35: Proactive Workflows & Standing Orders** — NL workflow rules, multi-step sequences, cross-role orchestration, workflow dashboard (completed 2026-03-27)
- [x] **Phase 36: Mobile-First Experience** — React Native/Expo app, push notifications, voice input, offline queue, quick actions (completed 2026-03-28)

**Dependency Graph:** Phases 29-32 parallel --> Phase 33 --> Phase 34 --> Phases 35-36

</details>

## Progress

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
| 20b. Role Engine Foundation | v1.4 | 4/4 | Complete | 2026-03-26 |
| 21. Billing Infrastructure | v1.4 | 3/3 | Complete | 2026-03-18 |
| 21b. Finance Role | v1.4 | 3/3 | Complete | 2026-03-26 |
| 22. Cost Controls & Ad Script Generator | v1.4 | 2/2 | Complete | 2026-03-18 |
| 22b. Comms Role | v1.4 | 3/3 | Complete | 2026-03-26 |
| 23. SEO Monitor & Tender Hunter | v1.4 | 2/2 | Complete | 2026-03-18 |
| 23b. Sales Role | v1.4 | 3/3 | Complete | 2026-03-26 |
| 24. Content Creator | v1.4 | 1/1 | Complete | 2026-03-18 |
| 24b. Intelligence Layer | v1.4 | 3/3 | Complete | 2026-03-26 |
| 25. Role Dashboard | v1.4 | 3/3 | Complete | 2026-03-26 |
| 26. SOTA Response Drafter | v1.4 | 2/2 | Complete | 2026-03-26 |
| 27. Role Runtime Import Fix | v1.4 | 1/1 | Complete | 2026-03-27 |
| 28. Intelligence Dashboard Wiring | v1.4 | 1/1 | Complete | 2026-03-27 |
| 29. SEO/Tender Scheduled Monitoring | v1.5 | 1/1 | Complete | 2026-03-27 |
| 30. Onboarding E2E & First-Run Experience | v1.5 | 3/3 | Complete | 2026-03-27 |
| 31. Channel Smoke Tests & Production Hardening | v1.5 | 3/3 | Complete | 2026-03-27 |
| 32. Marketing Site & Checkout Flow | v1.5 | 3/3 | Complete | 2026-03-27 |
| 33. Beta Program Infrastructure | v1.5 | 1/1 | Complete | 2026-03-27 |
| 34. Builder Role | v1.5 | 4/4 | Complete | 2026-03-27 |
| 35. Proactive Workflows | v1.5 | 3/3 | Complete | 2026-03-27 |
| 36. Mobile-First Experience | v1.5 | 4/4 | Complete | 2026-03-28 |

**Overall:** 57/57 plans complete for v1.0+v1.1+v1.2 (100%). v1.4: 34/34 plans complete (100%). v1.5: 22/22 plans complete (100%).
