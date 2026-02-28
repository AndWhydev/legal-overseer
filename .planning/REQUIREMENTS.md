# Requirements: BitBit AWU

**Defined:** 2026-03-01
**Core Value:** BitBit understands the business better than the business owner — when Andy says "Invoice Sezer for the White House RE work", BitBit knows who Sezer is, what the work was, the rate, and whether it's already been invoiced.

## v1.2 Requirements

Requirements for battle-testing and sellability. Each maps to roadmap phases.

### Deployment Stability

- [ ] **DEPLOY-01**: Vercel production build passes with zero errors
- [ ] **DEPLOY-02**: All 9 cron endpoints trigger and execute correctly on Vercel's cron system
- [ ] **DEPLOY-03**: Agent engine cold start responds in under 3 seconds for classification
- [ ] **DEPLOY-04**: Supabase connection pooling handles 10 concurrent agent requests without exhaustion
- [ ] **DEPLOY-05**: Fly.io worker fleet is deployed and operational (not just config committed)
- [ ] **DEPLOY-06**: Cloudflare edge cron poller is deployed and operational

### Channel Relay

- [ ] **CHAN-01**: Live Gmail pull works in deployed environment (not just local dev)
- [ ] **CHAN-02**: Outlook Graph API adapter works against production Microsoft tenant
- [ ] **CHAN-03**: WhatsApp Baileys bridge maintains stable connection over 7-day continuous run
- [ ] **CHAN-04**: Message deduplication holds under burst conditions (50 messages across 3 channels in 5 minutes)
- [ ] **CHAN-05**: Poll-to-classification latency measured and documented under normal and burst conditions

### WhatsApp Pipeline

- [ ] **WHATS-01**: Voice note received via WhatsApp is transcribed by Whisper and processed by agent pipeline end-to-end
- [ ] **WHATS-02**: Multi-turn conversation state maintained (e.g., "invoice him" after discussing a job two messages prior)
- [ ] **WHATS-03**: Approval flow via WhatsApp Y/N replies executes actions reliably
- [ ] **WHATS-04**: End-to-end latency from WhatsApp message to action/approval measured and under 10 seconds
- [ ] **WHATS-05**: Baileys vs WhatsApp Cloud API trade-offs evaluated with documented recommendation

### Confidence Routing

- [ ] **CONF-01**: 50 real AWU scenarios run through engine with confidence scores tracked vs human judgment
- [ ] **CONF-02**: Per-agent threshold tuning implemented (e.g., invoice higher auto-act threshold than sentry)
- [ ] **CONF-03**: False positive rate on auto-actions measured and documented
- [ ] **CONF-04**: Model routing (Haiku/Sonnet/Opus) produces reliable confidence scores across tiers
- [ ] **CONF-05**: Adversarial/ambiguous inputs tested to verify escalation reliability

### Invoice Flow Validation

- [ ] **INVC-06**: Entity resolution handles ambiguous NL commands (varying specificity levels) with ask-or-resolve behavior
- [ ] **INVC-07**: Duplicate detection triggers on slightly varied wording/amounts for same contact+project+period
- [ ] **INVC-08**: Generated PDF is branded, professional, with correct ABN/GST details and layout
- [ ] **INVC-09**: Invoice email arrives in recipient inbox (not spam) via working email transport
- [ ] **INVC-10**: Full lifecycle validated: draft to approved to sent to viewed to paid

### Lead Response

- [ ] **LEAD-01**: Auto-approve path for high-confidence leads (>85%) achieving sub-2-minute response time
- [ ] **LEAD-02**: Classification accuracy validated across 20 sample messages (lead/client/spam/personal)
- [ ] **LEAD-03**: Qualification scoring (hot/warm/cold) aligns with Andy's manual assessment on real leads

### Channel Settings & OAuth

- [ ] **OAUTH-01**: User can connect Gmail via Google OAuth flow from settings page
- [ ] **OAUTH-02**: User can connect Outlook via Microsoft OAuth flow from settings page
- [ ] **OAUTH-03**: User can link WhatsApp via QR code / phone number pairing flow from settings page
- [ ] **OAUTH-04**: User can connect Asana via OAuth flow from settings page
- [ ] **OAUTH-05**: User can connect Calendly via OAuth flow from settings page
- [ ] **OAUTH-06**: User can connect Stripe via OAuth/API key flow from settings page
- [ ] **OAUTH-07**: Channel settings page shows connection status, last sync time, and disconnect option for each channel
- [ ] **OAUTH-08**: OAuth token refresh handles expiry automatically without user re-auth

## Future Requirements

### Billing & Trial (deferred from v1.2 scoping)

- **BILL-01**: Stripe subscription lifecycle (create, upgrade, downgrade, cancel)
- **BILL-02**: Usage metering per agent per org
- **BILL-03**: Plan gating (feature access by subscription tier)
- **BILL-04**: 30-day free trial with feature gating by tier
- **BILL-05**: Trial conversion/expiry notifications
- **BILL-06**: Pricing page connected to live Stripe checkout

### Remaining Agents

- **AGENT-01**: Proposal Generator — auto-generate tiered proposals from briefs
- **AGENT-02**: Ad Script Generator — video/social ad scripts with hook variations
- **AGENT-03**: Client Onboarding Agent — auto-create Asana project, request credentials, book kick-off
- **AGENT-04**: Voice Agent (Eleven Labs outbound) — phone-based hands-free interaction

## Out of Scope

| Feature | Reason |
|---------|--------|
| Tender Hunter validation (PT-6) | High-revenue but needs real tender data from Andy first — deferred to v1.3 |
| Model routing cost optimization (PT-8) | P2 priority — cost efficiency, not launch blocker |
| Demo video production (G7) | Requires stable deployment first — produce after v1.2 ships |
| CUA (computer-using agent) | Future phase — browser/desktop automation layer |
| Mobile app | Web-first, mobile later |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEPLOY-01 | — | Pending |
| DEPLOY-02 | — | Pending |
| DEPLOY-03 | — | Pending |
| DEPLOY-04 | — | Pending |
| DEPLOY-05 | — | Pending |
| DEPLOY-06 | — | Pending |
| CHAN-01 | — | Pending |
| CHAN-02 | — | Pending |
| CHAN-03 | — | Pending |
| CHAN-04 | — | Pending |
| CHAN-05 | — | Pending |
| WHATS-01 | — | Pending |
| WHATS-02 | — | Pending |
| WHATS-03 | — | Pending |
| WHATS-04 | — | Pending |
| WHATS-05 | — | Pending |
| CONF-01 | — | Pending |
| CONF-02 | — | Pending |
| CONF-03 | — | Pending |
| CONF-04 | — | Pending |
| CONF-05 | — | Pending |
| INVC-06 | — | Pending |
| INVC-07 | — | Pending |
| INVC-08 | — | Pending |
| INVC-09 | — | Pending |
| INVC-10 | — | Pending |
| LEAD-01 | — | Pending |
| LEAD-02 | — | Pending |
| LEAD-03 | — | Pending |
| OAUTH-01 | — | Pending |
| OAUTH-02 | — | Pending |
| OAUTH-03 | — | Pending |
| OAUTH-04 | — | Pending |
| OAUTH-05 | — | Pending |
| OAUTH-06 | — | Pending |
| OAUTH-07 | — | Pending |
| OAUTH-08 | — | Pending |

**Coverage:**
- v1.2 requirements: 31 total
- Mapped to phases: 0
- Unmapped: 31 (pending roadmap creation)

---
*Requirements defined: 2026-03-01*
*Last updated: 2026-03-01 after initial definition*
