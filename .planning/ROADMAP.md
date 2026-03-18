# Roadmap: BitBit AWU

## Milestones

- v1.0 MVP -- Phases 1-6 (shipped 2026-02-21)
- v1.1 Agent Runtime + First Agents -- Phases 7-12 (shipped 2026-02-22)
- v1.2 Battle-Testing & Sellability -- Phases 13-19 (shipped 2026-03-02)
- v1.4 Media, Billing & Growth Roles -- Phases 20-24 (in progress)

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
**Success Criteria** (what must be TRUE):
  1. User can connect Gmail, Outlook, WhatsApp, Asana, Calendly, and Stripe from channel settings via OAuth/pairing flows
  2. Channel settings page shows live connection status, last sync time, and working disconnect for each channel
  3. Gmail and Outlook pull live messages in deployed environment and route them through classification
  4. Message deduplication holds under burst conditions (50 messages across 3 channels in 5 minutes)
  5. OAuth tokens refresh automatically without requiring user re-authentication
**Plans**: 5 plans

Plans:
- [x] 14-01-PLAN.md -- OAuth provider registration, DB schema expansion, relay daemon multi-channel, callback redirect fix
- [x] 14-02-PLAN.md -- Channel connect/disconnect APIs, config API, and token auto-refresh service with cron
- [x] 14-03-PLAN.md -- Channel settings UI (cards grid, connect flows, config drawer)
- [x] 14-04-PLAN.md -- Cross-channel dedup, burst handling, latency instrumentation, WhatsApp monitoring
- [x] 14-05-PLAN.md -- Environment provisioning, integration verification, and visual checkpoint

### Phase 15: WhatsApp Pipeline
**Goal**: Andy can interact with BitBit via WhatsApp including voice notes, multi-turn conversations, and approvals
**Depends on**: Phase 14
**Requirements**: WHATS-01, WHATS-02, WHATS-03, WHATS-04, WHATS-05, CHAN-03
**Success Criteria** (what must be TRUE):
  1. A WhatsApp voice note is transcribed and processed by the agent pipeline end-to-end
  2. Multi-turn conversation context is maintained (e.g., "invoice him" resolves from prior messages)
  3. Approval Y/N replies via WhatsApp reliably execute the queued action
  4. End-to-end latency from WhatsApp message to action/approval is under 10 seconds
  5. WhatsApp Baileys bridge maintains stable connection over 7-day continuous run
**Plans**: 2 plans

Plans:
- [x] 15-01-PLAN.md -- Baileys bridge worker, voice note transcription, webhook audio handling
- [x] 15-02-PLAN.md -- Multi-turn context resolution, approval hardening, latency instrumentation

### Phase 16: Confidence Routing Validation
**Goal**: Confidence routing produces reliable auto-act/approve/escalate decisions across all agents
**Depends on**: Phase 13
**Requirements**: CONF-01, CONF-02, CONF-03, CONF-04, CONF-05
**Success Criteria** (what must be TRUE):
  1. 50 real AWU scenarios scored with confidence and compared to Andy's judgment
  2. Per-agent thresholds are tuned (invoice has higher auto-act bar than sentry)
  3. False positive rate on auto-actions is measured and below acceptable threshold
  4. Adversarial/ambiguous inputs consistently trigger escalation rather than incorrect auto-action
**Plans**: 2 plans

Plans:
- [x] 16-01-PLAN.md -- 50 AWU scenario dataset, per-agent threshold tuning, confidence scoring harness
- [x] 16-02-PLAN.md -- False positive measurement, model-tier validation, adversarial test suite

### Phase 17: Invoice & Lead Validation
**Goal**: Invoice and lead agent flows work end-to-end with production-quality output
**Depends on**: Phase 13, Phase 16
**Requirements**: INVC-06, INVC-07, INVC-08, INVC-09, INVC-10, LEAD-01, LEAD-02, LEAD-03
**Success Criteria** (what must be TRUE):
  1. Ambiguous NL invoice commands resolve correctly or ask clarifying questions
  2. Duplicate invoices for same contact+project+period are caught before sending
  3. Generated PDF is branded, professional, with correct ABN/GST and arrives in inbox (not spam)
  4. High-confidence leads (>85%) get auto-approved response in under 2 minutes
  5. Lead classification accuracy matches Andy's manual assessment across 20 sample messages
**Plans**: 3 plans

Plans:
- [x] 17-01-PLAN.md -- Ambiguous entity resolution and fuzzy duplicate detection (TDD)
- [x] 17-02-PLAN.md -- Invoice PDF branding (ABN/GST), email delivery, lifecycle validation
- [x] 17-03-PLAN.md -- Lead auto-approve path, 20-message classification suite, qualification scoring

### Phase 18: Integration Fixes & Tech Debt
**Goal**: All broken integrations and tech debt from completed phases are fixed -- no dead code, no bypassed pipelines, no stub implementations
**Depends on**: Phase 15
**Requirements**: CHAN-04, CHAN-05 (integration), OAUTH-03, CHAN-03 (flow), DEPLOY-05, DEPLOY-06 (flow)
**Gap Closure**: Closes 3 broken integrations, 3 broken E2E flows, 8 tech debt items from audit
**Success Criteria** (what must be TRUE):
  1. channel-sync cron routes messages through relay daemon (dedup, latency, burst detection, retry)
  2. WhatsApp QR modal calls bridge API to start Baileys and surfaces real QR code
  3. Fly.io worker executes actual agent logic (not a TODO stub)
  4. connect-modal.tsx and channel-grid.tsx check correct response fields from APIs
  5. classifyWithRetry in relay-daemon.ts has reachable retry/backoff logic
  6. RELAY_SECRET env var is documented in setup requirements
  7. ignoreBuildErrors removed from next.config.ts and build still passes
**Plans**: 3 plans

Plans:
- [x] 18-01-PLAN.md -- Rewire channel-sync cron to relay daemon, fix classifyWithRetry, WhatsApp QR bridge integration, UI response field fixes
- [x] 18-02-PLAN.md -- Fly.io worker agent execution (replace TODO stub)
- [x] 18-03-PLAN.md -- Remove ignoreBuildErrors by fixing all TS errors (dual SupabaseClient + 13 real errors)

### Phase 19: Credential Provisioning & Live Verification
**Goal**: All OAuth channels work end-to-end in production with real credentials -- live message pulls verified, WhatsApp bridge stable
**Depends on**: Phase 18
**Requirements**: CHAN-01, CHAN-02, CHAN-03, OAUTH-01, OAUTH-02, OAUTH-04, OAUTH-05
**Gap Closure**: Closes all NEEDS HUMAN items from audit
**Success Criteria** (what must be TRUE):
  1. Google Cloud OAuth credentials provisioned and Gmail live pull works in deployed env
  2. Azure AD app registered and Outlook Graph API works against production tenant
  3. Asana developer app credentials provisioned and OAuth flow completes
  4. Calendly developer app credentials provisioned and OAuth flow completes
  5. WhatsApp Baileys bridge deployed to persistent host (Fly.io) and maintains 7-day stable connection
  6. Credential provisioning runbook documents all steps for each provider
**Plans**: 3 plans

Plans:
- [x] 19-01-PLAN.md -- WhatsApp bridge Fly.io deployment + credential provisioning runbook
- [x] 19-02-PLAN.md -- OAuth credential verification script + channel smoke test script
- [x] 19-03-PLAN.md -- Credential provisioning checkpoints + live channel verification

</details>

### v1.4 Media, Billing & Growth Roles

**Milestone Goal:** Close the media gap (file attachments in chat), add Stripe billing infrastructure for public launch readiness, and ship Growth Roles that extend the agent engine into marketing/content/sales domains.

- [ ] **Phase 20: File Attachments & Multimedia** - Users can upload, preview, and have BitBit analyse files in chat
- [ ] **Phase 21: Billing Infrastructure** - Stripe subscription lifecycle, plan gating, usage metering, and pricing page
- [ ] **Phase 22: Cost Controls & Ad Script Generator** - Per-execution budgets protect against token spirals; first growth role proves the pattern
- [ ] **Phase 23: SEO Monitor & Tender Hunter** - Wrap existing 700+ LOC implementations as plan-gated agent tools with scheduled ticks
- [ ] **Phase 24: Content Creator** - Social media post drafting and blog generation via chat with platform-specific formatting

## Phase Details

### Phase 20: File Attachments & Multimedia
**Goal**: Users can share files with BitBit in chat and receive intelligent analysis -- images render inline, PDFs show thumbnails, and BitBit reads/understands all uploaded content
**Depends on**: Phase 19 (v1.2 complete)
**Requirements**: MEDIA-01, MEDIA-02, MEDIA-03, MEDIA-04, MEDIA-05, MEDIA-06, MEDIA-07, MEDIA-08, MEDIA-09, MEDIA-10, MEDIA-11
**Success Criteria** (what must be TRUE):
  1. User can click the Paperclip button or drag-and-drop a file onto chat and see it upload with a progress indicator
  2. Uploaded images render as inline previews in the chat message; PDFs show a first-page thumbnail with download link
  3. User can say "summarize this document" after uploading a PDF and BitBit returns an accurate summary
  4. Uploading a 15MB file or an .exe is rejected with a clear error message explaining the limit
  5. Files are isolated per org -- one org cannot access another org's uploads
**Plans**: 3 plans (2 waves)

Plans:
- [ ] 20-01-PLAN.md -- Storage infrastructure (attachments table, Supabase Storage bucket, RLS policies, signed upload URL API, plan-gates fix)
- [ ] 20-02-PLAN.md -- Chat integration (Paperclip button, drag-and-drop, upload progress, multimodal content blocks to engine)
- [ ] 20-03-PLAN.md -- Preview rendering and visual verification (inline image/PDF previews, chat message integration, end-to-end checkpoint)

### Phase 21: Billing Infrastructure
**Goal**: BitBit has a working Stripe subscription system -- users can subscribe, manage plans, and growth tools are gated by plan tier
**Depends on**: Phase 20
**Requirements**: BILL-01, BILL-02, BILL-03, BILL-04, BILL-05, BILL-06, BILL-07, BILL-08, BILL-09, BILL-10
**Success Criteria** (what must be TRUE):
  1. Stripe webhook handler processes all subscription lifecycle events (create, update, cancel, trial_will_end, payment_failed) idempotently through a single consolidated route
  2. User can select a plan on the pricing page, complete Stripe Checkout, and see their plan reflected in the dashboard within 10 seconds
  3. Growth tools return an upgrade prompt when invoked by a user on a plan that doesn't include them
  4. Usage dashboard shows token consumption, agent runs, and storage usage for the current billing period
  5. Trial users receive email notification 3 days before trial expires, and expired trials downgrade gracefully
**Plans**: TBD

Plans:
- [ ] 21-01: Webhook consolidation and subscription lifecycle (single handler, event routing, idempotency, pre-created Products/Prices)
- [ ] 21-02: Plan gating and usage metering (tool execution gate, run logger wiring, storage tracking, trial fix to 30 days)
- [ ] 21-03: Pricing page, billing settings, and Customer Portal (plan comparison UI, Stripe Checkout, self-service management, dunning notifications)

### Phase 22: Cost Controls & Ad Script Generator
**Goal**: Per-execution token budgets prevent runaway costs, and the Ad Script Generator validates the growth role tool pattern end-to-end
**Depends on**: Phase 21
**Requirements**: COST-01, COST-02, COST-03, ADS-01, ADS-02, ADS-03, ADS-04
**Success Criteria** (what must be TRUE):
  1. A growth role execution that exceeds its token budget cap is halted mid-execution with a clear message to the user
  2. When a role's daily budget is 80% consumed, the user sees a warning; at 100%, further executions are blocked until the next day
  3. User can request ad scripts via chat and receive structured output with hook variations, body, CTA, and platform-specific timing guidance
  4. Ad Script Generator is plan-gated -- free/starter users get an upgrade prompt, growth/scale users get results
**Plans**: TBD

Plans:
- [ ] 22-01: Cost control infrastructure (per-execution token cap, per-role daily budget, circuit breaker, budget alerts)
- [ ] 22-02: Ad Script Generator tool group (wrap ad-script-gen.ts as agent tools, register in tool system, plan gate, autonomy mapping)

### Phase 23: SEO Monitor & Tender Hunter
**Goal**: Users can monitor SEO rankings and discover government tenders via chat commands and scheduled monitoring ticks
**Depends on**: Phase 22
**Requirements**: SEO-01, SEO-02, SEO-03, SEO-04, SEO-05, TNDR-01, TNDR-02, TNDR-03, TNDR-04, TNDR-05
**Success Criteria** (what must be TRUE):
  1. User can say "check my keyword rankings" and receive a structured SEO visibility report
  2. SEO monitor runs on a scheduled tick and alerts the user when rankings drop with diagnosis and suggested fixes
  3. User can say "find web design tenders in Brisbane" and receive matching government tender results with qualification scores
  4. Tender Hunter runs on a scheduled tick and notifies the user of new matching opportunities
  5. SEO tools are gated to growth/scale plans; Tender tools are gated to scale plan only
**Plans**: TBD

Plans:
- [ ] 23-01: SEO Monitor tool group (wrap ai-search-optimizer.ts, register tools, scheduled tick wiring, plan gate)
- [ ] 23-02: Tender Hunter tool group (wrap tender-hunter.ts, register tools, scheduled tick wiring, plan gate)

### Phase 24: Content Creator
**Goal**: Users can generate social media posts and blog drafts via chat with platform-specific formatting and brand voice
**Depends on**: Phase 22
**Requirements**: CONT-01, CONT-02, CONT-03, CONT-04
**Success Criteria** (what must be TRUE):
  1. User can say "write a LinkedIn post about our new project" and receive a post formatted for LinkedIn's conventions
  2. User can request blog post drafts with SEO keywords and brand voice applied
  3. Content tools produce platform-specific output for LinkedIn, Instagram, and X (different formatting, hashtag usage, character limits)
  4. Content tools are plan-gated to growth/scale tiers only
**Plans**: TBD

Plans:
- [ ] 24-01: Content Creator tool group (tool definitions, blog generation handler, social post handler, plan gate, autonomy mapping)

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
| 20. File Attachments & Multimedia | v1.4 | 0/3 | Planned | - |
| 21. Billing Infrastructure | v1.4 | 0/3 | Not started | - |
| 22. Cost Controls & Ad Script Generator | v1.4 | 0/2 | Not started | - |
| 23. SEO Monitor & Tender Hunter | v1.4 | 0/2 | Not started | - |
| 24. Content Creator | v1.4 | 0/1 | Not started | - |

**Overall:** 57/57 plans complete for v1.0+v1.1+v1.2 (100%). v1.4: 0/11 plans (Phases 20-24).
