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

## v1.4 Requirements

Requirements for Media, Billing & Growth Roles. Closes the media gap, adds billing for public launch, and ships growth agent tools.

### File Attachments & Multimedia

- [ ] **MEDIA-01**: User can upload files via Paperclip button in chat composer (images, PDFs, DOCX, CSV, TXT)
- [ ] **MEDIA-02**: User can drag-and-drop files onto the chat area to upload
- [x] **MEDIA-03**: Upload uses Supabase Storage signed URLs (bypasses Vercel 4.5MB body limit)
- [ ] **MEDIA-04**: Upload progress indicator shown during file transfer
- [ ] **MEDIA-05**: Uploaded images render inline in chat messages as previews
- [ ] **MEDIA-06**: Uploaded PDFs render with file icon, filename, size, and download link
- [x] **MEDIA-07**: File size limit enforced (10MB per file) with clear error message
- [x] **MEDIA-08**: Accepted file types filtered (block executables, allow business formats)
- [ ] **MEDIA-09**: BitBit can read and analyse uploaded files (images via Claude Vision, documents via text extraction)
- [x] **MEDIA-10**: Attachments table created with org-scoped storage paths and RLS policies
- [x] **MEDIA-11**: Storage paths scoped to org/thread for multi-tenant isolation ({org_id}/{thread_id}/{filename})

### Stripe Billing & Trial

- [ ] **BILL-01**: Stripe webhook routes consolidated into single handler with event routing and idempotency
- [ ] **BILL-02**: Stripe Products and Prices pre-created (replace ad-hoc price creation per checkout)
- [ ] **BILL-03**: Subscription lifecycle works end-to-end (create, upgrade, downgrade, cancel)
- [ ] **BILL-04**: Plan gating enforced at tool execution layer (growth tools gated to growth/scale plans)
- [ ] **BILL-05**: Usage metering wired into agent run logger (tokens, agent runs, storage tracked per org)
- [ ] **BILL-06**: 30-day free trial with feature access matching growth plan (fix 14-day mismatch)
- [ ] **BILL-07**: Trial conversion and expiry notifications via email
- [ ] **BILL-08**: Pricing page with plan comparison and live Stripe Checkout integration
- [ ] **BILL-09**: Stripe Customer Portal for self-service plan management
- [ ] **BILL-10**: Dunning sequence handles failed payments with escalating notifications

### Growth Role: Ad Script Generator

- [ ] **ADS-01**: Ad Script Generator registered as agent tool group (wraps existing ad-script-gen.ts)
- [ ] **ADS-02**: User can request ad scripts via chat with hook variations, tone control, and platform targeting
- [ ] **ADS-03**: Generated scripts include video structure (hook, body, CTA) with timing guidance
- [ ] **ADS-04**: Ad scripts are plan-gated (growth and scale tiers only)

### Growth Role: SEO Monitor

- [ ] **SEO-01**: SEO tools registered as agent tool group (wraps existing ai-search-optimizer.ts)
- [ ] **SEO-02**: User can check keyword rankings via chat command
- [ ] **SEO-03**: SEO monitor runs on scheduled tick to detect ranking changes
- [ ] **SEO-04**: Ranking drops trigger alert with diagnosis and suggested fixes
- [ ] **SEO-05**: SEO tools are plan-gated (growth and scale tiers only)

### Growth Role: Tender Hunter

- [ ] **TNDR-01**: Tender Hunter registered as agent tool group (wraps existing tender-hunter.ts)
- [ ] **TNDR-02**: User can search government tenders by keyword, category, and location via chat
- [ ] **TNDR-03**: Tender Hunter runs on scheduled tick to find new matching opportunities
- [ ] **TNDR-04**: New tender matches trigger notification with qualification assessment
- [ ] **TNDR-05**: Tender tools are plan-gated (scale tier only)

### Growth Role: Content Creator

- [ ] **CONT-01**: Content Creator tool group for social media post drafting via chat
- [ ] **CONT-02**: User can request blog post drafts with SEO optimization and brand voice
- [ ] **CONT-03**: User can request social media posts with platform-specific formatting (LinkedIn, Instagram, X)
- [ ] **CONT-04**: Content tools are plan-gated (growth and scale tiers only)

### Cost Controls

- [ ] **COST-01**: Per-execution token budget cap prevents runaway growth role costs
- [ ] **COST-02**: Per-role daily budget limit with alert when approaching threshold
- [ ] **COST-03**: Circuit breaker halts role execution if daily budget exceeded

## Future Requirements

### Builder Role (deferred from v1.4)

- **BUILD-01**: Builder Role for website/app construction via agentic coding
- **BUILD-02**: Preview sandbox for generated code
- **BUILD-03**: One-click deployment of generated sites

### Remaining Agents

- **AGENT-01**: Proposal Generator -- auto-generate tiered proposals from briefs
- **AGENT-03**: Client Onboarding Agent -- auto-create Asana project, request credentials, book kick-off
- **AGENT-04**: Voice Agent (Eleven Labs outbound) -- phone-based hands-free interaction

## Out of Scope

| Feature | Reason |
|---------|--------|
| Builder Role | Highest risk, lowest validated demand -- defer to v1.5 per research |
| Video file processing | Huge storage costs, slow processing, low ROI for agency use |
| Real-time collaborative editing | Not a Google Docs competitor |
| File versioning | Premature for launch -- store latest only |
| Custom file type plugins | Over-engineering -- support standard formats |
| CUA (computer-using agent) | Future -- browser/desktop automation layer |
| Mobile app | Web-first |
| Voice Agent (Eleven Labs) | Deferred -- needs validated demand |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DEPLOY-01 | Phase 13 | Complete |
| DEPLOY-02 | Phase 13 | Complete |
| DEPLOY-03 | Phase 13 | Complete |
| DEPLOY-04 | Phase 13 | Complete |
| DEPLOY-05 | Phase 13 -> Phase 18 | Complete |
| DEPLOY-06 | Phase 13 -> Phase 18 | Complete |
| CHAN-01 | Phase 14 -> Phase 19 | Complete |
| CHAN-02 | Phase 14 -> Phase 19 | Complete |
| CHAN-03 | Phase 15 -> Phase 19 | Complete |
| CHAN-04 | Phase 14 | Complete |
| CHAN-05 | Phase 14 | Complete |
| WHATS-01 | Phase 15 | Complete |
| WHATS-02 | Phase 15 | Complete |
| WHATS-03 | Phase 15 | Complete |
| WHATS-04 | Phase 15 | Complete |
| WHATS-05 | Phase 15 | Complete |
| CONF-01 | Phase 16 | Complete |
| CONF-02 | Phase 16 | Complete |
| CONF-03 | Phase 16 | Complete |
| CONF-04 | Phase 16 | Complete |
| CONF-05 | Phase 16 | Complete |
| INVC-06 | Phase 17 | Complete |
| INVC-07 | Phase 17 | Complete |
| INVC-08 | Phase 17 | Complete |
| INVC-09 | Phase 17 | Complete |
| INVC-10 | Phase 17 | Complete |
| LEAD-01 | Phase 17 | Complete |
| LEAD-02 | Phase 17 | Complete |
| LEAD-03 | Phase 17 | Complete |
| OAUTH-01 | Phase 14 -> Phase 19 | Complete |
| OAUTH-02 | Phase 14 -> Phase 19 | Complete |
| OAUTH-03 | Phase 14 | Complete |
| OAUTH-04 | Phase 14 -> Phase 19 | Complete |
| OAUTH-05 | Phase 14 -> Phase 19 | Complete |
| OAUTH-06 | Phase 14 | Complete |
| OAUTH-07 | Phase 14 | Complete |
| OAUTH-08 | Phase 14 | Complete |
| MEDIA-01 | Phase 20 | Pending |
| MEDIA-02 | Phase 20 | Pending |
| MEDIA-03 | Phase 20 | Complete |
| MEDIA-04 | Phase 20 | Pending |
| MEDIA-05 | Phase 20 | Pending |
| MEDIA-06 | Phase 20 | Pending |
| MEDIA-07 | Phase 20 | Complete |
| MEDIA-08 | Phase 20 | Complete |
| MEDIA-09 | Phase 20 | Pending |
| MEDIA-10 | Phase 20 | Complete |
| MEDIA-11 | Phase 20 | Complete |
| BILL-01 | Phase 21 | Pending |
| BILL-02 | Phase 21 | Pending |
| BILL-03 | Phase 21 | Pending |
| BILL-04 | Phase 21 | Pending |
| BILL-05 | Phase 21 | Pending |
| BILL-06 | Phase 21 | Pending |
| BILL-07 | Phase 21 | Pending |
| BILL-08 | Phase 21 | Pending |
| BILL-09 | Phase 21 | Pending |
| BILL-10 | Phase 21 | Pending |
| COST-01 | Phase 22 | Pending |
| COST-02 | Phase 22 | Pending |
| COST-03 | Phase 22 | Pending |
| ADS-01 | Phase 22 | Pending |
| ADS-02 | Phase 22 | Pending |
| ADS-03 | Phase 22 | Pending |
| ADS-04 | Phase 22 | Pending |
| SEO-01 | Phase 23 | Pending |
| SEO-02 | Phase 23 | Pending |
| SEO-03 | Phase 23 | Pending |
| SEO-04 | Phase 23 | Pending |
| SEO-05 | Phase 23 | Pending |
| TNDR-01 | Phase 23 | Pending |
| TNDR-02 | Phase 23 | Pending |
| TNDR-03 | Phase 23 | Pending |
| TNDR-04 | Phase 23 | Pending |
| TNDR-05 | Phase 23 | Pending |
| CONT-01 | Phase 24 | Pending |
| CONT-02 | Phase 24 | Pending |
| CONT-03 | Phase 24 | Pending |
| CONT-04 | Phase 24 | Pending |

**Coverage:**
- v1.2 requirements: 37 satisfied
- v1.4 requirements: 42 total, 0 satisfied
- Mapped to phases: 42/42 (100%)

---
*Requirements defined: 2026-03-01*
*v1.4 requirements added: 2026-03-18*
*v1.4 phase mappings added: 2026-03-18*
