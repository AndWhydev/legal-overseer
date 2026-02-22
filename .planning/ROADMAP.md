# Roadmap: BitBit AWU

## Milestones

- ✅ **v1.0 MVP** -- Phases 1-6 (shipped 2026-02-21)
- ✅ **v1.1 Agent Runtime + First Agents** -- Phases 7-12 (shipped 2026-02-22)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-6) -- SHIPPED 2026-02-21</summary>

- [x] Phase 1: Platform Deploy (4/4 plans) -- completed 2026-02-21
- [x] Phase 2: Schema Expansion (4/4 plans) -- completed 2026-02-21
- [x] Phase 3: Semantic Context Engine (3/3 plans) -- completed 2026-02-21
- [x] Phase 4: Agent Infrastructure (4/4 plans) -- completed 2026-02-21
- [x] Phase 5: Wire Integration Points (2/2 plans) -- completed 2026-02-21
- [x] Phase 6: Verification Artifacts (2/2 plans) -- completed 2026-02-21

</details>

<details>
<summary>✅ v1.1 Agent Runtime + First Agents (Phases 7-12) -- SHIPPED 2026-02-22</summary>

- [x] Phase 7: Infrastructure Foundation (2/2 plans) -- completed 2026-02-22
- [x] Phase 8: Agent Runtime (3/3 plans) -- completed 2026-02-22
- [x] Phase 9: Approval Flow (3/3 plans) -- completed 2026-02-22
- [x] Phase 10: Sentry Agent (4/4 plans) -- completed 2026-02-22
- [x] Phase 11: Lead Swarm Agent (4/4 plans) -- completed 2026-02-22
- [x] Phase 12: Invoice Flow Agent (3/3 plans) -- completed 2026-02-22

</details>

## Phase Details

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
- [x] 07-01-PLAN.md — Supabase DI refactor (all agent/context/channel modules accept SupabaseClient parameter)
- [x] 07-02-PLAN.md — Agent run logging and v1.0 infra verification (run-logger, confidence routing tests, shared CRUD tests)

### Phase 8: Agent Runtime
**Goal**: Messages flow automatically from Gmail into BitBit, get classified with full context awareness, and route to the correct processing path
**Depends on**: Phase 7
**Requirements**: RNTM-01, RNTM-02, RNTM-03, RNTM-04
**Success Criteria** (what must be TRUE):
  1. Gmail messages appear in BitBit within the configured poll interval without manual intervention
  2. Each incoming message receives a significance score (1-10), time sensitivity, and recommended actions via LLM classification
  3. High-significance urgent messages route to immediate processing while low-significance messages batch or skip
  4. Agents trigger on their configured cron schedules (e.g., Sentry every 5 min, Lead Swarm on new email)
**Plans**: 3 plans

Plans:
- [x] 08-01-PLAN.md — Channel relay daemon (Gmail polling, buffering, dedup persistence)
- [x] 08-02-PLAN.md — LLM classification and action routing (significance scoring, dispatch)
- [x] 08-03-PLAN.md — Agent scheduler (cron/interval triggers, scheduler tick API)

### Phase 9: Approval Flow
**Goal**: Andy controls agent autonomy -- low-confidence actions require his approval via dashboard or WhatsApp before executing
**Depends on**: Phase 8
**Requirements**: APPR-01, APPR-02, APPR-03, APPR-04, APPR-05
**Success Criteria** (what must be TRUE):
  1. Agent actions with confidence >0.85 execute automatically; actions between 0.55-0.85 queue for approval; actions <0.55 escalate to Andy directly
  2. Dashboard shows a queue of pending agent actions with enough context to approve or reject each one
  3. Andy receives WhatsApp messages summarizing agent actions that need approval
  4. Andy can approve or reject actions by replying to WhatsApp messages (Y/N)
  5. Low-priority approval requests batch into a single daily digest instead of individual notifications
**Plans**: 3 plans

Plans:
- [x] 09-01-PLAN.md — Approval queue DB table, service module, and REST API endpoints
- [x] 09-02-PLAN.md — Dashboard approval queue UI with approve/reject cards
- [x] 09-03-PLAN.md — WhatsApp approval notifications, Y/N reply handling, and daily digest

### Phase 10: Sentry Agent
**Goal**: BitBit continuously monitors for problems (errors, downtime, negative sentiment) and alerts Andy with suggested fixes
**Depends on**: Phase 8, Phase 9
**Requirements**: SNTR-01, SNTR-02, SNTR-03, SNTR-04
**Success Criteria** (what must be TRUE):
  1. Sentry monitors configured watches (error keywords, uptime endpoints, negative sentiment patterns) on its scheduled interval
  2. When an issue is detected, Sentry suggests a specific remediation action (not just "something broke")
  3. If Andy does not acknowledge an alert within N minutes, the notification escalates (e.g., repeat ping, louder channel)
  4. Andy can create, pause, and delete watches from the dashboard
**Plans**: 4 plans

Plans:
- [x] 10-01-PLAN.md — Sentry agent core (watch evaluation, issue detection, remediation suggestions, scheduler wiring)
- [x] 10-02-PLAN.md — Escalation chain and dashboard watches UI
- [x] 10-03-PLAN.md — Escalation runtime, API wiring, and scheduler dedupe behavior
- [x] 10-04-PLAN.md — Dashboard sentry watch manager UI and route composition

### Phase 11: Lead Swarm Agent
**Goal**: Inbound leads are automatically classified, qualified, and fast-tracked -- Andy never misses a hot lead
**Depends on**: Phase 8, Phase 9
**Requirements**: LEAD-01, LEAD-02, LEAD-03, LEAD-04, LEAD-05
**Success Criteria** (what must be TRUE):
  1. Inbound messages are classified as lead/client/spam/personal with high accuracy
  2. Qualified leads have a score (hot/warm/cold) based on budget, service match, and timeline
  3. Qualified leads receive an auto-acknowledgement draft within 2 minutes, sent after approval
  4. Leads over $5k value escalate directly to Andy via notification
  5. Dashboard shows a leads pipeline kanban (New, Qualified, Booked, Won/Lost)
**Plans**: 4 plans

Plans:
- [x] 11-01-PLAN.md — Lead intake classification/qualification runtime and scheduler wiring
- [x] 11-02-PLAN.md — Approval-gated auto-acknowledgment and high-value escalation flows
- [x] 11-03-PLAN.md — Leads pipeline APIs and dashboard kanban integration
- [x] 11-04-PLAN.md — Gap closure: approved ack outbound delivery + provider result persistence

### Phase 12: Invoice Flow Agent
**Goal**: Andy says "Invoice Sezer for the White House RE work" and BitBit creates, generates, and sends a branded invoice -- with duplicate protection
**Depends on**: Phase 8, Phase 9
**Requirements**: INVC-01, INVC-02, INVC-03, INVC-04, INVC-05
**Success Criteria** (what must be TRUE):
  1. Andy can create an invoice from natural language (BitBit resolves contact, project, rate, and terms from context)
  2. Generated PDF invoices are branded and include configurable payment terms
  3. Invoices send via email with PDF attachment (after approval)
  4. Invoice status tracks through draft, sent, viewed, overdue, and paid
  5. BitBit detects and prevents duplicate invoicing (same contact + project + amount + period = blocked)
**Plans**: 3 plans

Plans:
- [x] 12-01-PLAN.md — Natural language invoice creation, entity resolution, and duplicate detection
- [x] 12-02-PLAN.md — PDF generation, sending workflow, and status lifecycle handling
- [x] 12-03-PLAN.md — Invoice APIs, dashboard integration, and scheduler/runtime wiring

## Progress

**Execution Order:**
Phases execute in numeric order: 7 -> 8 -> 9 -> 10/11/12 (parallel after 9).

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

**Overall:** 35/35 plans complete (100%).
