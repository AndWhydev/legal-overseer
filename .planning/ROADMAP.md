# Roadmap: BitBit AWU

## Milestones

- v1.0 MVP -- Phases 1-6 (shipped 2026-02-21)
- v1.1 Agent Runtime + First Agents -- Phases 7-12 (shipped 2026-02-22)
- v1.2 Battle-Testing & Sellability -- Phases 13-17 (in progress)

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

- [x] Phase 7: Infrastructure Foundation (2/2 plans) -- completed 2026-02-22
- [x] Phase 8: Agent Runtime (3/3 plans) -- completed 2026-02-22
- [x] Phase 9: Approval Flow (3/3 plans) -- completed 2026-02-22
- [x] Phase 10: Sentry Agent (4/4 plans) -- completed 2026-02-22
- [x] Phase 11: Lead Swarm Agent (4/4 plans) -- completed 2026-02-22
- [x] Phase 12: Invoice Flow Agent (3/3 plans) -- completed 2026-02-22

</details>

### v1.2 Battle-Testing & Sellability

- [x] **Phase 13: Deployment Stability** - Vercel prod, cron, cold starts, connection pooling, Fly.io and Cloudflare workers operational (completed 2026-03-01)
- [x] **Phase 14: Channel Relay & OAuth** - Live channel connections via OAuth, dedup, classification pipeline validated (completed 2026-03-02)
- [ ] **Phase 15: WhatsApp Pipeline** - Voice-to-agent, multi-turn, approval flow, latency validation, Baileys bridge stability
- [ ] **Phase 16: Confidence Routing Validation** - Threshold tuning, false positive measurement, adversarial testing
- [ ] **Phase 17: Invoice & Lead Validation** - Entity resolution, PDF quality, email delivery, lead auto-response

## Phase Details

<details>
<summary>v1.0 Phase Details (Phases 1-6)</summary>

*See MILESTONES.md for v1.0 details.*

</details>

<details>
<summary>v1.1 Phase Details (Phases 7-12)</summary>

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
**Plans**: TBD

### Phase 16: Confidence Routing Validation
**Goal**: Confidence routing produces reliable auto-act/approve/escalate decisions across all agents
**Depends on**: Phase 13
**Requirements**: CONF-01, CONF-02, CONF-03, CONF-04, CONF-05
**Success Criteria** (what must be TRUE):
  1. 50 real AWU scenarios scored with confidence and compared to Andy's judgment
  2. Per-agent thresholds are tuned (invoice has higher auto-act bar than sentry)
  3. False positive rate on auto-actions is measured and below acceptable threshold
  4. Adversarial/ambiguous inputs consistently trigger escalation rather than incorrect auto-action
**Plans**: TBD

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
**Plans**: TBD

## Progress

**Execution Order:**
Phases 13 first (foundation), then 14 -> 15 (channel chain) and 16 (can parallel), then 17 (needs 13+16).

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
| 15. WhatsApp Pipeline | v1.2 | 0/? | Not started | - |
| 16. Confidence Routing Validation | v1.2 | 0/? | Not started | - |
| 17. Invoice & Lead Validation | v1.2 | 0/? | Not started | - |

**Overall:** 35/35 plans complete for v1.0+v1.1 (100%). v1.2: 9/? plans complete (Phases 13+14 done).
