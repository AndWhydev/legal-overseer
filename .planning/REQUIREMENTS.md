# Requirements: BitBit AWU

**Defined:** 2026-02-22
**Core Value:** BitBit understands the business better than the business owner -- when Andy says "Invoice Sezer for the White House RE work", BitBit knows who Sezer is, what the work was, the rate, and whether it's already been invoiced.

## v1.1 Requirements

Requirements for milestone v1.1: Agent Runtime + First Agents.

### Runtime

- [x] **RNTM-01**: Channel relay daemon polls Gmail on configurable intervals, buffers and processes messages
- [x] **RNTM-02**: LLM classification assigns significance (1-10), time sensitivity, and recommended actions to each message
- [x] **RNTM-03**: Action router dispatches messages as immediate/queue/batch/skip based on significance + urgency
- [x] **RNTM-04**: Agent scheduler triggers agents on cron schedules (configurable per agent per org)

### Approval

- [x] **APPR-01**: Confidence routing decides act (>0.85) / ask (0.55-0.85) / escalate (<0.55) per agent action
- [x] **APPR-02**: Dashboard approval queue shows pending agent actions with approve/reject buttons
- [x] **APPR-03**: WhatsApp notification sends approval requests to Andy with action summary
- [x] **APPR-04**: Andy can approve/reject via WhatsApp reply (Y/N or tap)
- [x] **APPR-05**: Low-priority approvals batch into a daily digest instead of individual pings

### Sentry Agent

- [x] **SNTR-01**: Sentry monitors configured watches (error keywords, uptime, negative sentiment)
- [x] **SNTR-02**: Sentry detects issues and suggests remediation actions
- [x] **SNTR-03**: Sentry escalates via notification chain if no acknowledgement within N minutes
- [x] **SNTR-04**: Dashboard shows watches management UI (create, pause, delete)

### Lead Swarm Agent

- [x] **LEAD-01**: Lead Swarm classifies inbound messages as lead/client/spam/personal
- [x] **LEAD-02**: Lead Swarm qualifies leads (budget, service match, timeline) and scores hot/warm/cold
- [ ] **LEAD-03**: Lead Swarm auto-acknowledges qualified leads within 2 minutes (draft -> approval flow)
- [ ] **LEAD-04**: Lead Swarm escalates high-value leads (>$5k) directly to Andy
- [ ] **LEAD-05**: Dashboard shows leads pipeline (kanban: New->Qualified->Booked->Won/Lost)

### Invoice Flow Agent

- [ ] **INVC-01**: Invoice Flow creates invoices from natural language ("Invoice Sezer for White House RE")
- [ ] **INVC-02**: Invoice Flow generates branded PDF invoices with configurable payment terms
- [ ] **INVC-03**: Invoice Flow sends invoices via email with PDF attachment (with approval)
- [ ] **INVC-04**: Invoice Flow tracks status (draft->sent->viewed->overdue->paid)
- [ ] **INVC-05**: Invoice Flow detects and prevents duplicate invoicing (never send same invoice twice)

### Infrastructure

- [x] **INFR-01**: Supabase DI refactor -- all tools receive client from context, not module-level import
- [x] **INFR-02**: Agent run logging captures tokens, cost, actions, and confidence per execution
- [x] **INFR-03**: AGNT-12 (confidence routing) and AGNT-13 (shared CRUD tools) verified in production flow

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Communication Agents

- **COMM-01**: Channel Triage agent classifies and prioritizes all inbound messages
- **COMM-02**: Client Comms agent drafts replies in correct voice profile
- **COMM-03**: Daily digest "what needs attention today" via WhatsApp

### Revenue Agents

- **REVN-01**: Proposal Bot generates scope documents and pricing from brief inputs
- **REVN-02**: Client Onboarding agent auto-creates Asana projects and sends welcome packages

### Full WhatsApp Bot

- **WHAP-01**: Natural language command parser for WhatsApp
- **WHAP-02**: Multi-turn conversation manager
- **WHAP-03**: Voice note transcription pipeline
- **WHAP-04**: Proactive morning briefing via WhatsApp

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full WhatsApp conversational bot | Approval-only channel for v1.1; full bot deferred |
| Outlook adapter rebuild | Not needed for v1.1 (Gmail-only); rebuild when adding Outlook |
| Asana/Calendly/ClickUp integrations | Agent runtime + first agents first; channel integrations later |
| Growth agents (Ad Script, AI Search, Tender Hunter) | Milestone 4 |
| Marketing website / public launch | Milestone 5 |
| Mobile app | Not planned |
| Multi-tenant self-serve signup | Single-tenant AWU for now |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFR-01 | Phase 7 | Complete |
| INFR-02 | Phase 7 | Complete |
| INFR-03 | Phase 7 | Complete |
| RNTM-01 | Phase 8 | Complete |
| RNTM-02 | Phase 8 | Pending |
| RNTM-03 | Phase 8 | Pending |
| RNTM-04 | Phase 8 | Complete |
| APPR-01 | Phase 9 | Complete |
| APPR-02 | Phase 9 | Complete |
| APPR-03 | Phase 9 | Complete |
| APPR-04 | Phase 9 | Complete |
| APPR-05 | Phase 9 | Complete |
| SNTR-01 | Phase 10 | Complete |
| SNTR-02 | Phase 10 | Complete |
| SNTR-03 | Phase 10 | Complete |
| SNTR-04 | Phase 10 | Complete |
| LEAD-01 | Phase 11 | Complete |
| LEAD-02 | Phase 11 | Complete |
| LEAD-03 | Phase 11 | Pending |
| LEAD-04 | Phase 11 | Pending |
| LEAD-05 | Phase 11 | Pending |
| INVC-01 | Phase 12 | Pending |
| INVC-02 | Phase 12 | Pending |
| INVC-03 | Phase 12 | Pending |
| INVC-04 | Phase 12 | Pending |
| INVC-05 | Phase 12 | Pending |

**Coverage:**
- v1.1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-22 after roadmap creation*
