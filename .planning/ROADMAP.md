# Roadmap: BitBit AWU

## Milestones

- v1.0 MVP -- Phases 1-6 (shipped 2026-02-21)
- v1.1 Agent Runtime + First Agents -- Phases 7-12 (shipped 2026-02-22)
- v1.2 Battle-Testing & Sellability -- Phases 13-19 (shipped 2026-03-14)
- v1.3 Agent Roles & Autonomy Engine -- Phases 20-25 (in progress)

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

### Phase 20: Role Engine Foundation
**Goal**: The infrastructure that makes autonomous roles possible — role definitions, persistent state, autonomy gating, workflow execution, cost guards, concurrency control, and audit logging
**Depends on**: Phase 19 (v1.2 complete)
**Requirements**: ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05, ROLE-06, ROLE-07, AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05, AUTO-06
**Success Criteria** (what must be TRUE):
  1. Roles can be defined, enabled/disabled, and configured with autonomy levels in `role_configs`
  2. Role state persists across ticks/restarts via `role_states` JSONB
  3. Roles activate from both scheduled ticks and database events (new message, invoice paid, etc.)
  4. Concurrent activation of the same role is serialized (advisory locks prevent double-execution)
  5. Multi-step workflows checkpoint progress in `role_workflows` and resume after interruption
  6. Per-role daily budget caps prevent cost explosion; Haiku pre-screens before Sonnet/Opus calls
  7. Every role action writes to `role_activity` with reasoning chain, confidence, autonomy mode, reversibility
  8. Autonomy gate correctly routes: Observer → insight only, Co-pilot → approval queue, Autopilot → execute or queue based on confidence
**Plans**: 4 plans
- [x] 20-01-PLAN.md -- Role schema & type system (5 tables, RLS, 9 TS types)
- [x] 20-02-PLAN.md -- Role runtime: state, ticks, events, concurrency
- [ ] 20-03-PLAN.md
- [ ] 20-04-PLAN.md

### Phase 21: Finance Role
**Goal**: Finance role owns all money operations — subsumes invoice agent, adds proactive invoicing, collections, cash flow monitoring, payment pattern learning, and weekly financial digest
**Depends on**: Phase 20
**Requirements**: FIN-01, FIN-02, FIN-03, FIN-04, FIN-05, FIN-06
**Success Criteria** (what must be TRUE):
  1. All existing invoice agent capabilities work through Finance role (NL commands, PDF, email, lifecycle)
  2. Finance proactively identifies billable work and generates draft invoices without being asked
  3. Overdue invoices trigger escalating reminder sequence (gentle → firm → escalation)
  4. Cash flow tracking shows incoming/outgoing/pending with shortfall alerts
  5. Per-client payment patterns are learned and stored (avg days, preferred method)
  6. Weekly financial digest is generated and delivered (invoiced, received, overdue, projected)
**Plans**: 3 plans

### Phase 22: Comms Role
**Goal**: Comms role owns all communication — subsumes channel triage, adds response drafting, follow-up tracking, relationship monitoring, tone adaptation, and overdue escalation
**Depends on**: Phase 20
**Requirements**: COMM-01, COMM-02, COMM-03, COMM-04, COMM-05, COMM-06
**Success Criteria** (what must be TRUE):
  1. All existing channel triage capabilities work through Comms role (classification, routing)
  2. Comms drafts contextual replies using conversation history and entity context
  3. Unanswered threads older than configurable threshold are surfaced with urgency scoring
  4. Per-client communication frequency is monitored; engagement drops flagged
  5. Tone/style adapts per client based on historical communication patterns
  6. Threads exceeding SLA threshold auto-escalate with pre-drafted response
**Plans**: 3 plans

### Phase 23: Sales Role
**Goal**: Sales role owns revenue growth — subsumes lead swarm, adds proposal generation from briefs, lead nurture sequences, client onboarding automation, win/loss learning, and pipeline visibility
**Depends on**: Phase 20
**Requirements**: SALE-01, SALE-02, SALE-03, SALE-04, SALE-05, SALE-06
**Success Criteria** (what must be TRUE):
  1. All existing lead swarm capabilities work through Sales role (intake, classification, qualification)
  2. Sales generates branded proposals from verbal briefs using past project data for pricing
  3. Stale proposals and cold leads receive automated follow-up on configurable cadence
  4. Lead conversion triggers automated onboarding (project creation, welcome email, task setup)
  5. Proposal outcomes tracked; pricing and approach adapt based on win/loss patterns
  6. Pipeline view shows leads → proposals → active → closed with conversion metrics
**Plans**: 3 plans

### Phase 24: Intelligence Layer
**Goal**: Business intelligence that sees what the user misses — Revenue Radar identifies upsell opportunities, Client Health scores relationships, Cash Flow Prophet projects finances, Capacity Oracle manages workload
**Depends on**: Phase 21, Phase 22, Phase 23 (needs role data)
**Requirements**: INTEL-01, INTEL-02, INTEL-03, INTEL-04, INTEL-05
**Success Criteria** (what must be TRUE):
  1. Revenue Radar identifies upsell opportunities from client history and flags stale clients
  2. Client Health Score (0-100) computed from response times, payments, project progress, communication
  3. Cash Flow Prophet projects forward from invoices, proposals, and recurring patterns with shortfall alerts
  4. Capacity Oracle models workload from active projects/tasks and warns on overcommitment
  5. Each metric shows "gathering data" below minimum data thresholds instead of unreliable predictions
**Plans**: 3 plans

### Phase 25: Role Dashboard & Integration Polish
**Goal**: Unified dashboard experience for all roles — activity feed, status cards, autonomy controls, attention view, and end-to-end integration testing across all roles
**Depends on**: Phase 24
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05
**Success Criteria** (what must be TRUE):
  1. All role activity appears in single priority-sorted feed (not per-role silos)
  2. Each role has status card showing state, active workflows, key metrics, and autonomy level
  3. Autonomy level (Observer/Co-pilot/Autopilot) toggleable per role directly from dashboard
  4. "What needs my attention" view shows all items requiring human input across all roles
  5. Drill-down into any role shows full activity history with reasoning chains and outcomes
**Plans**: 3 plans

## Progress

**Execution Order:**
Phase 20 first (foundation), then 21/22/23 can partially parallel (all depend on 20), then 24 (needs role data from 21-23), then 25 (dashboard, needs everything).

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-6 | v1.0 | 19/19 | Complete | 2026-02-21 |
| 7-12 | v1.1 | 16/16 | Complete | 2026-02-22 |
| 13-19 | v1.2 | 24/24 | Complete | 2026-03-14 |
| 20. Role Engine Foundation | v1.3 | 2/4 | In Progress | — |
| 21. Finance Role | 1/3 | In Progress|  | — |
| 22. Comms Role | v1.3 | 0/3 | Pending | — |
| 23. Sales Role | v1.3 | 0/3 | Pending | — |
| 24. Intelligence Layer | v1.3 | 0/3 | Pending | — |
| 25. Role Dashboard & Integration Polish | v1.3 | 0/3 | Pending | — |

**Overall:** 59/59 plans complete for v1.0-v1.2 (100%). v1.3: 2/19 plans (Phase 20 in progress).
