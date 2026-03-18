# Requirements: BitBit AWU

**Defined:** 2026-03-01
**Core Value:** BitBit understands the business better than the business owner -- when Andy says "Invoice Sezer for the White House RE work", BitBit knows who Sezer is, what the work was, the rate, and whether it's already been invoiced.

## v1.2 Requirements

Requirements for battle-testing and sellability. Each maps to roadmap phases.

### Deployment Stability

- [x] **DEPLOY-01**: Vercel production build passes with zero errors
- [x] **DEPLOY-02**: All 9 cron endpoints trigger and execute correctly on Vercel's cron system
- [x] **DEPLOY-03**: Agent engine cold start responds in under 3 seconds for classification
- [x] **DEPLOY-04**: Supabase connection pooling handles 10 concurrent agent requests without exhaustion
- [x] **DEPLOY-05**: Fly.io worker fleet is deployed and operational (not just config committed)
- [x] **DEPLOY-06**: Cloudflare edge cron poller is deployed and operational

### Channel Relay

- [x] **CHAN-01**: Live Gmail pull works in deployed environment (not just local dev)
- [x] **CHAN-02**: Outlook Graph API adapter works against production Microsoft tenant
- [x] **CHAN-03**: WhatsApp Baileys bridge maintains stable connection over 7-day continuous run
- [x] **CHAN-04**: Message deduplication holds under burst conditions (50 messages across 3 channels in 5 minutes)
- [x] **CHAN-05**: Poll-to-classification latency measured and documented under normal and burst conditions

### WhatsApp Pipeline

- [x] **WHATS-01**: Voice note received via WhatsApp is transcribed by Whisper and processed by agent pipeline end-to-end
- [x] **WHATS-02**: Multi-turn conversation state maintained (e.g., "invoice him" after discussing a job two messages prior)
- [x] **WHATS-03**: Approval flow via WhatsApp Y/N replies executes actions reliably
- [x] **WHATS-04**: End-to-end latency from WhatsApp message to action/approval measured and under 10 seconds
- [x] **WHATS-05**: Baileys vs WhatsApp Cloud API trade-offs evaluated with documented recommendation

### Confidence Routing

- [x] **CONF-01**: 50 real AWU scenarios run through engine with confidence scores tracked vs human judgment
- [x] **CONF-02**: Per-agent threshold tuning implemented (e.g., invoice higher auto-act threshold than sentry)
- [x] **CONF-03**: False positive rate on auto-actions measured and documented
- [x] **CONF-04**: Model routing (Haiku/Sonnet/Opus) produces reliable confidence scores across tiers
- [x] **CONF-05**: Adversarial/ambiguous inputs tested to verify escalation reliability

### Invoice Flow Validation

- [x] **INVC-06**: Entity resolution handles ambiguous NL commands (varying specificity levels) with ask-or-resolve behavior
- [x] **INVC-07**: Duplicate detection triggers on slightly varied wording/amounts for same contact+project+period
- [x] **INVC-08**: Generated PDF is branded, professional, with correct ABN/GST details and layout
- [x] **INVC-09**: Invoice email arrives in recipient inbox (not spam) via working email transport
- [x] **INVC-10**: Full lifecycle validated: draft to approved to sent to viewed to paid

### Lead Response

- [x] **LEAD-01**: Auto-approve path for high-confidence leads (>85%) achieving sub-2-minute response time
- [x] **LEAD-02**: Classification accuracy validated across 20 sample messages (lead/client/spam/personal)
- [x] **LEAD-03**: Qualification scoring (hot/warm/cold) aligns with Andy's manual assessment on real leads

### Channel Settings & OAuth

- [x] **OAUTH-01**: User can connect Gmail via Google OAuth flow from settings page
- [x] **OAUTH-02**: User can connect Outlook via Microsoft OAuth flow from settings page
- [x] **OAUTH-03**: User can link WhatsApp via QR code / phone number pairing flow from settings page
- [x] **OAUTH-04**: User can connect Asana via OAuth flow from settings page
- [x] **OAUTH-05**: User can connect Calendly via OAuth flow from settings page
- [x] **OAUTH-06**: User can connect Stripe via OAuth/API key flow from settings page
- [x] **OAUTH-07**: Channel settings page shows connection status, last sync time, and disconnect option for each channel
- [x] **OAUTH-08**: OAuth token refresh handles expiry automatically without user re-auth

## v1.3 Requirements

Requirements for Agent Roles & Autonomy Engine. Transform BitBit from task-executing agents into domain-owning autonomous roles with user-controlled autonomy.

### Role Engine

- [x] **ROLE-01**: Role definition schema — each role has identity, domain, responsibilities, tools, memory schema, and default autonomy level stored in `role_configs`
- [ ] **ROLE-02**: Role state persistence — each role maintains working memory (JSONB) that survives restarts and is loadable per tick
- [ ] **ROLE-03**: Role activation via events (new message, invoice paid, lead submitted) and scheduled ticks (configurable per role)
- [ ] **ROLE-04**: Concurrency control — simultaneous activations of the same role are serialized via Postgres advisory locks
- [ ] **ROLE-05**: Multi-step workflow execution — roles execute durable workflows that checkpoint progress and resume after interruption
- [ ] **ROLE-06**: Role cost guards — per-role daily budget caps, Haiku pre-screen before Sonnet/Opus evaluation, budget alerts
- [ ] **ROLE-07**: Role audit log — every action logs reasoning chain, confidence, autonomy mode, and reversibility metadata

### Autonomy Spectrum

- [ ] **AUTO-01**: Three autonomy levels per role — Observer (insights only), Co-pilot (draft + approve), Autopilot (act autonomously, escalate on low confidence)
- [ ] **AUTO-02**: Per-role autonomy configuration — user can set each role to a different autonomy level from dashboard
- [ ] **AUTO-03**: Observer mode produces insights and recommendations on dashboard without taking any action
- [ ] **AUTO-04**: Co-pilot mode drafts actions with full context, queues in approval flow, enables one-tap approve/edit/reject
- [ ] **AUTO-05**: Autopilot mode executes high-confidence actions autonomously, routes low-confidence to approval queue (uses existing confidence routing)
- [ ] **AUTO-06**: Autonomy level changes take effect immediately without role restart or data loss

### Finance Role

- [ ] **FIN-01**: Finance role subsumes existing invoice agent — all current invoice capabilities preserved (NL commands, PDF, email, lifecycle)
- [ ] **FIN-02**: Proactive invoicing — Finance identifies billable work and generates invoices on schedule without being asked
- [ ] **FIN-03**: Collections — Finance detects overdue invoices, drafts and sends payment reminders on escalating schedule
- [ ] **FIN-04**: Cash flow monitoring — Finance tracks incoming/outgoing/pending and alerts on projected shortfalls
- [ ] **FIN-05**: Payment pattern learning — Finance learns per-client payment behavior (average days, preferred method) and adapts timing
- [ ] **FIN-06**: Financial summary — Finance produces weekly financial digest (invoiced, received, overdue, projected)

### Comms Role

- [ ] **COMM-01**: Comms role subsumes existing channel triage — all current classification and routing preserved
- [ ] **COMM-02**: Response drafting — Comms drafts contextual replies to client messages using conversation history and entity context
- [ ] **COMM-03**: Follow-up tracking — Comms identifies unanswered threads older than configurable threshold and surfaces them
- [ ] **COMM-04**: Relationship maintenance — Comms monitors communication frequency per client and flags engagement drops
- [ ] **COMM-05**: Tone adaptation — Comms learns communication style per client (formal/casual, channel preference, response patterns)
- [ ] **COMM-06**: Overdue response escalation — threads unanswered beyond SLA threshold get escalated with drafted response

### Sales Role

- [ ] **SALE-01**: Sales role subsumes existing lead swarm agent — all current lead intake, classification, and qualification preserved
- [ ] **SALE-02**: Proposal generation — Sales creates branded proposals from verbal briefs, using past project data for pricing and scope
- [ ] **SALE-03**: Lead nurture — Sales follows up on stale proposals and cold leads on configurable cadence
- [ ] **SALE-04**: Client onboarding — when a lead converts, Sales creates project structure, sends welcome email, sets up initial tasks
- [ ] **SALE-05**: Win/loss learning — Sales tracks proposal outcomes and adapts pricing, timing, and approach based on what converts
- [ ] **SALE-06**: Pipeline visibility — Sales maintains a live pipeline view (leads → proposals → active → closed) with conversion metrics

### Intelligence Layer

- [ ] **INTEL-01**: Revenue Radar — identifies upsell opportunities from client history, flags stale clients, compares current vs historical pricing
- [ ] **INTEL-02**: Client Health Score — per-client 0-100 score computed from response times, payment timeliness, project progress, communication frequency
- [ ] **INTEL-03**: Cash Flow Prophet — forward-looking projection from invoices, proposals, and recurring patterns with shortfall alerts
- [ ] **INTEL-04**: Capacity Oracle — workload model from active projects/tasks, warns on overcommitment, suggests optimal start dates
- [ ] **INTEL-05**: Minimum data thresholds — each intelligence metric requires minimum data volume before showing predictions (facts first, trends after 1 month, predictions after 3 months)

### Role Dashboard

- [ ] **DASH-01**: Unified role activity feed — all role activity in single priority-sorted stream, not per-role silos
- [ ] **DASH-02**: Per-role status cards — each role shows current state, active workflows, key metrics, and autonomy level
- [ ] **DASH-03**: Inline autonomy controls — toggle Observer/Co-pilot/Autopilot per role directly from dashboard
- [ ] **DASH-04**: "What needs my attention" view — single screen showing all items across all roles that require human input
- [ ] **DASH-05**: Role activity detail — drill into any role to see full activity history, reasoning chains, and outcomes

## Future Requirements

### Billing & Trial (deferred from v1.2)

- **BILL-01**: Stripe subscription lifecycle (create, upgrade, downgrade, cancel)
- **BILL-02**: Usage metering per role per org
- **BILL-03**: Plan gating (feature access by subscription tier)
- **BILL-04**: 30-day free trial with feature gating by tier
- **BILL-05**: Trial conversion/expiry notifications
- **BILL-06**: Pricing page connected to live Stripe checkout

### Growth Roles (v1.4)

- **GROWTH-01**: SEO Role — monitor rankings, diagnose drops, implement fixes
- **GROWTH-02**: Content Role — social media scheduling, blog writing, email campaigns
- **GROWTH-03**: Builder Role — website/app construction via agentic coding
- **GROWTH-04**: Ad Script Generator — video/social ad scripts with hook variations
- **GROWTH-05**: Tender Hunter — find and qualify government/enterprise tender opportunities

## Out of Scope

| Feature | Reason |
|---------|--------|
| Growth roles (SEO, Content, Builder) | v1.4 — need role engine proven first |
| Stripe billing & trial | v1.4 — deferred from v1.2 |
| Custom role builder | Premature — ship 3 built-in roles first |
| Role-to-role visible chat | Demo-ware — roles coordinate via shared state |
| Granular permission matrix | Over-engineering — 3-level autonomy spectrum sufficient |
| AI model selection per role | Users don't care — BitBit picks optimal model per task |
| CUA (computer-using agent) | Future — browser/desktop automation layer |
| Mobile app | Web-first |

## Traceability

### v1.2 (Complete)

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEPLOY-01 through DEPLOY-06 | Phases 13, 18 | Complete |
| CHAN-01 through CHAN-05 | Phases 14, 15, 19 | Complete |
| WHATS-01 through WHATS-05 | Phase 15 | Complete |
| CONF-01 through CONF-05 | Phase 16 | Complete |
| INVC-06 through INVC-10 | Phase 17 | Complete |
| LEAD-01 through LEAD-03 | Phase 17 | Complete |
| OAUTH-01 through OAUTH-08 | Phases 14, 19 | Complete |

### v1.3 (In Progress)

| Requirement | Phase | Status |
|-------------|-------|--------|
| ROLE-01 through ROLE-07 | Phase 20 | Pending |
| AUTO-01 through AUTO-06 | Phase 20 | Pending |
| FIN-01 through FIN-06 | Phase 21 | Pending |
| COMM-01 through COMM-06 | Phase 22 | Pending |
| SALE-01 through SALE-06 | Phase 23 | Pending |
| INTEL-01 through INTEL-05 | Phase 24 | Pending |
| DASH-01 through DASH-05 | Phase 25 | Pending |

**Coverage:**
- v1.2 requirements: 37 satisfied
- v1.3 requirements: 41 total, 0 satisfied
- Mapped to phases: 41/41

---
*Requirements defined: 2026-03-01*
*v1.3 requirements added: 2026-03-18*
