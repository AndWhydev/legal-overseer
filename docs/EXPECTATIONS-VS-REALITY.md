# BitBit: Expectations vs. Reality — Pressure Test & Gap Validation

**Generated**: 2026-03-01
**Sources**: 3 Cluely meetings (Feb 19, 22, 25), PRD, comprehensive roadmap, pricing docs, demo requirements, full codebase audit, git history (211 commits across 9 active days)
**Purpose**: Ground the shared vision against development reality, identify what needs pressure testing to validate preconceptions, and surface gaps requiring attention

---

## Part 1: The Shared Vision (Synthesised from All 3 Meetings)

### Core Thesis

> "Send a voice note. The problem disappears."

BitBit is a **conversational business operations agent** — a modular orchestrator/PA that small business owners talk to naturally (voice notes, WhatsApp, text) and it **autonomously handles operational tasks** with confidence-routed human oversight.

### Architecture (Agreed, Feb 19)

- **BitBit = The PA** — single orchestrator persona the user interacts with
- **Agents = Modular "lego bricks"** underneath, selected per deployment/niche
- **Confidence routing** — >=80% auto-act / 50-80% ask / <50% escalate
- **Policy engine** — each deployment has its own rules (CLIENT-PACK)
- **Multi-channel input** — WhatsApp, iMessage, voice, email, dashboard
- **Industry configurations** — same platform, different agent bundles per niche

### The 10 Agents (Agreed Roster + Pricing Direction)

| # | Agent | Est. Cost | Meeting Status | Codebase Status |
|---|-------|-----------|---------------|-----------------|
| 1 | Sentry | ~$10/mo | Confirmed | Built — watches, alerts, escalation, dashboard, scheduler wiring |
| 2 | Channel Triage | ~$20/mo | Confirmed | Built — unified inbox, daily digest, command center |
| 3 | Invoice Flow | ~$10/mo | "Working" (Feb 22) | Built — NL creation, entity resolution, PDF gen, approval-gated send, lifecycle tracking, duplicate detection |
| 4 | Lead Swarm | ~$50/mo | Confirmed | Built — intake classification, qualification scoring, approval-gated ack, pipeline APIs, dashboard kanban |
| 5 | Client Comms / PA | ~$20-40/mo | Core of product | Built — agent engine, 12 tools, model routing, cost guard |
| 6 | Proposal Generator | ~$30-40/mo | Confirmed | Partial — Schema + route exist, generation logic needs implementation |
| 7 | Ad Script Generator | ~$30/mo | Confirmed | Not yet built |
| 8 | Client Onboarding | ~$30-40/mo | Confirmed | Partial — Onboarding UI exists (beta flow), agent automation not built |
| 9 | Tender Hunter | ~$1-2k/mo | Andy's enterprise play | Built — multi-source scrapers, compliance checking, fit scoring, API routes, dashboard tab |
| 10 | Voice Agent | TBD | Future (Eleven Labs) | Partial — Whisper transcription endpoint exists, Eleven Labs outbound not started |

**7 of 10 agents are built or substantially built.** 3 remain (Proposal, Ad Script, Client Onboarding as agent).

### Target Niches (Andy's Priority)

1. **Marketing Agencies** — Andy's primary channel, AWU as testbed
2. **Trades / Electricians** — Andy's strongest conviction, voice-first interaction
3. **Enterprise / Tender** — $1-2k/month, "I know people that will pay for that if it's working"
4. **Dentists / Healthcare** — Patient comms, appointments, reviews
5. **General SMBs** — Catch-all

### Business Structure (Agreed, Feb 25)

- 50/50 partnership, Tor = CTO, Andy = Sales/Commercial
- Entity: Delaware or Australia (accountant involved)
- R&D tax rebate target: April 2026
- Shareholder agreement with clear responsibilities
- Pricing: $149 base, packages $199-$999+, Enterprise custom

---

## Part 2: Development Reality

### Velocity Evidence

| Metric | Value |
|--------|-------|
| Total commits (Jan 15 - Mar 1) | 211 |
| Active development days | 9 |
| Peak day (Feb 22) | 69 commits |
| v1.0 MVP shipped | Feb 21 (20 plans, 6 phases) |
| v1.1 Agent Runtime shipped | Feb 22 (15 plans, 6 phases) |
| Post-v1.1 hardening wave | Feb 23-Mar 1 (100+ commits) |
| Test coverage | 719 tests across 51 files |
| Plans completed | 35/35 (100%) |

### What's Actually Built (Post-Hardening)

**Core Platform:**
- Next.js 16 dashboard with 12+ SPA routes
- Supabase multi-tenant schema (20+ tables, RLS policies, org isolation)
- Agent engine with model routing (Haiku/Sonnet/Opus), agentic loop, SSE streaming
- Confidence routing (act/ask/escalate) with tests
- Orchestrator with dependency resolution
- 12 agent tools (8 CRUD + 4 channel)
- Cost guard per-org daily limits
- Circuit breaker for LLM calls
- Dead letter queue for failed actions
- Retry with exponential backoff
- Agent run logger with token/cost tracking

**Agents (7/10):**
- Sentry — watch runtime, escalation, dashboard management
- Channel Triage — unified inbox, classification, digest, command center
- Invoice Flow — NL intent to entity resolution to PDF to approval-gated send to lifecycle
- Lead Swarm — intake classification, qualification, approval-gated ack, kanban pipeline
- Client Comms / PA — full agent engine
- Tender Hunter — multi-source scraping, compliance, fit scoring, full API + dashboard
- Voice (partial) — Whisper transcription endpoint

**Infrastructure:**
- Channel relay daemon with bearer auth
- Agent scheduler with cron/interval matching
- Message classification and action routing
- Approval flow — queue, dashboard cards, WhatsApp notifications, digest
- Realtime — Supabase subscriptions, SSE streaming, live badges, agent status indicator
- Audit logging — typed events, paginated API, filters, infinite scroll
- Multi-tenant — org switcher, team members, invitations, role management
- Knowledge graph — entity explorer, graph traversal, cross-entity search, detail drawer
- Cmd+K command palette with global search
- WhatsApp NL parser, multi-turn sessions, proactive alerts
- WhatsApp Baileys bridge
- Module gating per deployment

**DevOps & Quality:**
- 719 tests across 51 files
- CI/CD workflows (PR checks, preview deploys, DB migrations)
- VPS Docker infrastructure for agent workers
- Fly.io worker fleet + Cloudflare edge cron poller
- Monitoring (Sentry, cost tracking, health endpoint)
- Security (secret management, RLS audit, session auth guards)
- Performance indexes on high-frequency queries
- Production hardening (29 blockers resolved)
- A11y audit (hit targets, ARIA, toast dedup, focus management)
- Error boundaries, skeletons, empty states, dark mode

**GTM:**
- Marketing homepage
- Pricing page
- Beta onboarding flow
- Stripe checkout + webhooks
- Analytics dashboard (MRR, usage, churn detection)
- Demo page

---

## Part 3: Pressure Test Matrix

These are the areas where the **preconceptions and intentions** need validation against reality. Not "is it built?" but "does it actually work the way we expect it to under real conditions?"

### PT-1: Confidence Routing Accuracy

**Preconception**: >=80% confidence = safe to auto-execute. 50-80% = needs approval. <50% = escalate.

**What needs pressure testing**:
- Are the thresholds right for AWU's real operational context? An invoice auto-sent at 81% confidence that's wrong costs trust immediately.
- How does confidence scoring perform on ambiguous inputs? E.g., "Invoice Sezer for the usual" — does it confidently resolve the right contact, project, and rate?
- What's the false positive rate on auto-actions? One wrong auto-send email could damage client relationships.
- Does model routing (Haiku for classification, Opus for complex reasoning) actually produce reliable confidence scores across tiers?
- Per-agent threshold tuning: Invoice probably needs a higher auto-act threshold than Sentry monitoring.

**Validation approach**:
- Run 50 real AWU scenarios through the engine with Andy's actual messages/voice notes
- Track confidence scores vs. human judgment (would Andy have approved this?)
- Identify threshold tuning needed per agent type
- Test edge cases: ambiguous contacts, incomplete context, conflicting information
- Deliberately feed adversarial inputs to test escalation reliability

### PT-2: Channel Relay to Agent Pipeline (End-to-End Flow)

**Preconception**: Messages flow automatically from channels into BitBit, get classified, and route to the correct agent.

**What needs pressure testing**:
- Does the relay daemon actually pull from **live** Gmail/Outlook in a deployed (Vercel/Fly) environment, or only in local dev?
- The comprehensive roadmap (Feb 19) flagged Outlook adapter as reading a local JSON cache file — has the Graph API rewrite resolved this?
- IMAP via imapflow has a 30s serverless timeout risk on Vercel — is there a mitigation (Fly worker, Vercel Pro 300s limit, or API-based approach)?
- iMessage/Calendar/Reminders are macOS-only (osascript) — do they have cloud alternatives wired, or are they explicitly local-only?
- WhatsApp Baileys bridge — is this stable enough for production? Baileys is an unofficial library with ban risk on Meta's platform.
- Deduplication under load: what happens when the same message arrives via both Gmail forwarding and Outlook direct?

**Validation approach**:
- Deploy to staging, send a real email to the AWU inbox, verify it appears in BitBit within poll interval
- Same test for WhatsApp message via Baileys
- Verify Outlook Graph API adapter works against tor@allwebbedup.com.au
- Stress test: 50 messages across 3 channels in 5 minutes — does dedup hold? Does classification keep up?
- Measure poll-to-classification latency under normal and burst conditions
- Document which adapters are cloud-deployable vs. local-only (and whether that's acceptable)

### PT-3: WhatsApp as Primary Interface

**Preconception (Andy, Feb 19)**: Tradies message BitBit from job sites via WhatsApp. Voice notes, text, quick commands. This is THE killer feature.

**What needs pressure testing**:
- WhatsApp Business API vs. Baileys (unofficial) — what's the production path? Baileys risks account bans under Meta TOS.
- Voice note to Whisper transcription to agent pipeline: does this chain work end-to-end with acceptable latency?
- Multi-turn conversation state: if a tradie says "invoice him" after discussing a job two messages ago, does BitBit maintain context?
- Approval flow via WhatsApp Y/N replies: is this reliable? What about accidental "Y" responses or garbled voice-to-text?
- Latency: how fast is the round-trip after a WhatsApp message? Andy says "speed is so important in business."
- WhatsApp production setup requires Andy's Meta Business access — is this dependency tracked?

**Validation approach**:
- Send WhatsApp voice note, verify transcription accuracy, verify agent processes intent correctly
- Test multi-turn: "I just finished the bathroom reno at John's" then "invoice him for $850", verify entity resolution
- Measure end-to-end latency (message sent to action completed or approval queued)
- Test approval flow: send approval request, reply Y, verify action executes
- Evaluate Baileys stability over 7-day continuous run (connection drops, reconnection, message reliability)
- Compare Baileys vs. WhatsApp Cloud API trade-offs for production readiness

### PT-4: Invoice Flow Reliability

**Preconception (Feb 19)**: "Invoice Sezer for the White House RE work" leads to BitBit creating, generating, and sending branded invoice with duplicate protection.

**What needs pressure testing**:
- Entity resolution under ambiguity: "Invoice the client for the website work" — which client? Which project? Which rate? Does it ask or guess?
- Duplicate detection: same contact + project + amount + period = blocked. Does this work with slightly different wording or amounts?
- PDF generation quality: is the output branded, professional, and correct? Layout, fonts, alignment, ABN/GST details.
- Email delivery: does the invoice actually arrive in the recipient's inbox (not spam)? Which email transport is used?
- Stripe payment link integration: is this live, or does it need Stripe identity verification first (flagged as blocked in billing cleanup)?
- Approval gate: when invoice is queued for approval, does Andy get enough context to approve confidently?

**Validation approach**:
- 10 NL invoice commands with varying specificity levels, verify entity resolution accuracy
- Attempt duplicate invoice with slightly varied wording, verify block triggers
- Generate PDF, visually inspect branding and data correctness
- Send test invoice to real email, verify delivery and payment link functionality
- Test the full lifecycle: draft to approved to sent to viewed to paid
- Test the failure path: what happens when entity resolution fails? Does it ask or error?

### PT-5: Lead Swarm Response Time

**Preconception (PRD)**: Lead response time < 2 minutes. Hot leads get instant acknowledgment.

**What needs pressure testing**:
- The lead ack is approval-gated — this inherently adds latency. If Andy's not watching approvals, a hot lead could wait hours. Is there an auto-approve path for high-confidence leads?
- Classification accuracy: does it correctly distinguish lead/client/spam/personal across AWU's real inbound?
- Qualification scoring: does hot/warm/cold align with Andy's actual judgment on real leads?
- The "abuse cap" mentioned in meetings — is it implemented? What prevents a competitor from flooding the intake?
- Outbound prospecting (BlitzSwarm.io concept) — is any of this built, or is Lead Swarm purely intake/qualification?

**Validation approach**:
- Simulate inbound lead email, measure time from receipt to ack draft creation
- Test with auto-approve on high-confidence leads (>85%) — does sub-2-minute response work?
- 20 sample messages: verify classification accuracy (lead vs. client vs. spam vs. personal)
- Compare qualification scoring with Andy's manual assessment on 10 real leads
- Identify if approval gate needs a bypass for lead ack (time-critical vs. invoice which is not)

### PT-6: Tender Hunter at Enterprise Scale

**Preconception (Andy, Feb 19)**: "$1-2k/month. I know people that will pay for that if it's working."

**What needs pressure testing**:
- Multi-source scrapers — which tender sources are actually connected and returning results? Government tender portals, industry feeds, etc.
- Compliance checking — does it accurately match business capabilities (ABN, insurance, certifications) against tender requirements?
- Fit scoring — is it calibrated against real tenders Andy or AWU would actually pursue?
- Response drafting — is the quality sufficient for government/enterprise submissions, or just a rough outline?
- This is the highest-revenue agent ($1-2k/mo). It needs the most thorough validation before being sold, because the clients paying that much will have high expectations.

**Validation approach**:
- Run against 5 real tender listings from Andy's target industries, evaluate scraper reliability
- Feed AWU's capabilities profile, verify fit scoring aligns with human assessment
- Generate a complete tender response draft, have Andy evaluate quality against a real submission he's done
- Compare against a tender Andy has actually won — would BitBit have surfaced it and scored it correctly?
- Estimate actual API cost per tender evaluation cycle (this agent uses Opus, could be expensive)

### PT-7: Deployment Stability

**Preconception**: Product is accessible on the internet. Andy can log in and use it.

**What needs pressure testing**:
- The 12+ failed Vercel deploys were addressed (PR #1 fix for bb-components, cron day-of-week fix, inline core types) — is production deployment now stable?
- 9 cron endpoints configured — do they all actually trigger and execute correctly on Vercel's cron system?
- Serverless cold start times — does the agent engine respond fast enough for the "speed is everything" expectation?
- Supabase connection pooling under concurrent requests — any connection limit issues?
- Edge cron poller (Cloudflare) + Fly.io workers — are these deployed infrastructure or just committed code?
- The last 5 commits are all deploy fixes — suggests active work on stability. What's the current deploy status?

**Validation approach**:
- Deploy fresh to Vercel production, verify all 12+ dashboard routes load without error
- Trigger each of the 9 cron endpoints manually, verify handlers execute and produce expected results
- Measure cold start to first agent response latency (target: <3s for classification, <10s for complex action)
- Load test: 10 concurrent agent requests, verify no connection pool exhaustion or timeout cascade
- Verify Fly.io/Cloudflare infrastructure is actually deployed and operational (not just config committed)
- Run the Vercel build locally first: npm run build in personal-assistant, verify zero errors

### PT-8: Model Routing Cost Efficiency

**Preconception (PRD)**: Haiku 70% / Sonnet 25% / Opus 5% of calls. Average cost per action < $0.05.

**What needs pressure testing**:
- Does the model router actually achieve the 70/25/5 distribution in practice with real AWU messages?
- Are there tasks being routed to Opus that Sonnet could handle (cost leak)?
- Are there tasks on Haiku that need Sonnet (quality leak)?
- The cost guard caps daily spend per org — at what threshold? Is it calibrated for the $200/mo founder deal (~$6.67/day)?
- Agent cost breakdown doc says meeting estimates were 5-10x higher than calculated — is the calculated number validated against actual usage?
- Circuit breaker trigger conditions — do they fire appropriately or too aggressively?

**Validation approach**:
- Run 100 diverse agent interactions, log model selection distribution
- Compare actual token costs against agent-cost-breakdown.md projections
- Verify cost guard daily threshold aligns with package pricing ($200/mo = ~$6.67/day limit)
- Identify any Opus calls that could be downgraded without quality loss
- Identify any Haiku calls that produce poor results and need upgrading
- Simulate hitting the cost guard — does it degrade gracefully or hard-block?

---

## Part 4: Structural Gaps (Build, Not Pressure Test)

These are clear gaps between expectations and code — not ambiguous, just unfinished work in the roadmap.

### G1: Proposal Generator Agent
**Expected**: Auto-generate tiered proposals from briefs/meeting transcripts. PDF output. "Super valuable — easily $400/month" (Andy).
**Reality**: Schema exists, dashboard route exists, no generation logic implemented.
**Action**: Build. Sonnet/Opus task with template system. Within current architecture patterns.

### G2: Ad Script Generator Agent
**Expected**: Video/social ad scripts, hook variations, platform-adapted formatting, storyboards.
**Reality**: Not built.
**Action**: Build. Template-driven with LLM generation. Fits existing agent infrastructure.

### G3: Client Onboarding Agent
**Expected**: Auto-create Asana project on deal acceptance, request credentials, book kick-off call.
**Reality**: Beta onboarding UI exists (for BitBit itself). Agent-driven client onboarding for AWU's clients not built.
**Action**: Build. Integration with Asana API + Calendly. Leverages existing channel adapters.

### G4: Voice Agent (Eleven Labs Outbound)
**Expected**: Phone-based interaction. Tradies call BitBit hands-free from job sites.
**Reality**: Whisper transcription endpoint exists (inbound voice notes). Eleven Labs outbound voice not started.
**Action**: Build when ready. Differentiator but not a launch blocker for the first niche (agencies).

### G5: Billing/Subscription Completion
**Expected**: Stripe subscriptions, package selection, metered billing per agent, upgrade/downgrade flow.
**Reality**: Stripe checkout + webhooks exist. Full subscription lifecycle (plan management, usage metering, per-agent gating) needs completion.
**Action**: Complete Stripe Billing integration. Foundation exists, needs the lifecycle wiring.

### G6: Free Trial Infrastructure
**Expected (Andy, Feb 25)**: 30-day free trial, unified inbox + invoice flow as the free tier. 15-day check-in call to upsell.
**Reality**: Beta onboarding flow exists. Trial period logic, feature gating by plan tier, conversion/expiry flow not implemented.
**Action**: Build on top of existing onboarding + module gating system. The module gating per deployment is already built — this is mostly time-based gating + notifications.

### G7: Demo Video
**Expected**: 30-second demo video for Andy's content marketing and Saturday shoot.
**Reality**: Not produced.
**Action**: Requires stable deployment (PT-7) and at least one real end-to-end flow working (PT-2). Then screen-record real usage.

---

## Part 5: Preconception Validation Summary

| # | Preconception | Confidence It Holds | Key Risk | Priority |
|---|--------------|--------------------:|----------|----------|
| 1 | Confidence routing thresholds are right | Medium | Wrong auto-action destroys trust | P0 — validate before any client touches it |
| 2 | Channels flow automatically into BitBit | Medium | Serverless timeouts, adapter state, Baileys stability | P0 — core value prop depends on this |
| 3 | WhatsApp is the killer interface for tradies | High (concept) / Medium (execution) | Baileys ban risk, voice note latency, multi-turn state | P0 — Andy's primary selling scenario |
| 4 | Invoice flow works end-to-end | High (logic) / Medium (delivery) | Entity resolution ambiguity, email deliverability, Stripe | P1 — demo-critical |
| 5 | Sub-2-minute lead response | Medium | Approval gate adds inherent latency | P1 — core PRD metric, may need auto-approve path |
| 6 | Tender Hunter is worth $1-2k/mo | Low (unvalidated against real data) | Scraper reliability, response quality, compliance accuracy | P1 — highest revenue agent, needs proof |
| 7 | Vercel deployment is stable | Medium-High (recent fixes) | Cron reliability, cold starts, connection pooling | P0 — nothing else works without this |
| 8 | Model routing achieves 70/25/5 cost split | Medium | Routing heuristics may not match real task distribution | P2 — cost efficiency, not launch blocker |

---

## Part 6: What's Genuinely Impressive (Grounding the Positive)

This isn't "code exists as scaffolding." The architecture has production-grade depth:

**Confidence routing + approval flow** is a genuine product innovation for SMB AI tools. Most competitors either auto-act everything (dangerous) or require human review of everything (slow). The act/ask/escalate model is the right answer and it's implemented with real infrastructure (queue, dashboard cards, WhatsApp notifications, digest batching).

**Multi-agent orchestrator with dependency resolution** means agents can coordinate complex workflows. The task graph execution with circular dependency detection is not trivial engineering.

**Circuit breaker + dead letter queue + retry with exponential backoff + cost guard** is production-grade reliability engineering. This is what separates a prototype from a system you can trust with a client's business operations.

**Entity resolution with fuzzy matching** across contacts solves the "which Sezer?" problem that kills most NL business tools. The 5-step resolution pipeline with ranked results is well-considered.

**Knowledge graph with cross-entity search** is the foundation of the "omniscient" vision — connecting conversations, contacts, tasks, and history into a queryable intelligence layer. This is what makes "invoice Sezer for the usual" resolvable.

**719 tests across 51 files** is more comprehensive than most funded startups at this stage. Combined with CI/CD workflows, this is a codebase that can iterate fast without regression fear.

**Module gating per deployment** means the multi-niche strategy is architecturally supported — not just talked about.

The gap isn't "is it built." It's "is it battle-tested against real operational chaos." The pressure tests above are the path to validating that.

---

## Part 7: Toward Omniscient AGI — What the Meetings Described

### The Three Pillars (from BitBit Memoir + Tor's Wispr transcripts)

1. **Business Agent** — Enterprise operations via unified semantic layer
2. **Personal Assistant** — Proactive 24/7 cross-channel life management
3. **Operator Agent** — Computer-using agent (CUA) that clicks/types/scrolls, removing API dependency

### What's Built Toward This Vision

| Capability | Status | Gap to "Omniscient" |
|-----------|--------|---------------------|
| Semantic context engine | Built (Phase 3) | Needs real data volume to prove cross-entity reasoning |
| Multi-channel synthesis | Built | Needs live channel connections under production load |
| Entity resolution (fuzzy, 5-step) | Built | Needs tuning against AWU's real contact graph |
| Knowledge graph | Built | Needs population from actual conversations and history |
| Model routing (cost optimization) | Built | Needs validation of distribution against real usage |
| Proactive behavior (cron agents, alerts, briefings) | Built | Needs real-world trigger calibration |
| Learning loop (memory system) | Schema exists | Needs feedback loop from approval decisions to threshold adjustment |
| Voice interface | Whisper inbound | Needs Eleven Labs outbound for full voice agent |
| CUA (computer-using agent) | Not started | Future phase — browser/desktop automation layer |

### The Path from "Sophisticated Agent" to "Omniscient AGI"

Tor's Wispr transcript captures the target state precisely:

> "Because of its ambiguous, omniscient, contextual intelligence, it doesn't matter where you are. It knows everything and it will execute commands and workflows through natural language exceptionally well, because of its contextualised understanding for its deployed use case and business application."

The architecture supports this. The semantic context engine, knowledge graph, entity resolution, and multi-channel synthesis are the building blocks. What turns "sophisticated agent platform" into "omniscient AGI" is:

1. **Data density** — The knowledge graph needs to be populated with real operational data (conversations, decisions, outcomes, patterns) over weeks/months of active use. The semantic layer exists; it needs feeding.

2. **Feedback loop** — Every approval/rejection decision is implicit training data. When Andy rejects an auto-action, the system should learn and adjust thresholds. When he approves, confidence in that pattern should increase. The approval infrastructure exists; the learning mechanism needs wiring.

3. **Cross-domain inference** — When Andy says "invoice Sezer for the usual," BitBit needs to chain: Sezer's contact profile to recent project history to standard rate to last invoice date to duplicate check to resolved intent. Each piece exists independently (entity resolution, knowledge graph, invoice duplicate detection). The inference chain connecting them needs validation under real ambiguity.

4. **Proactive intelligence** — Not just responding to commands but anticipating needs: "You haven't invoiced for the White House RE work in 3 weeks — should I draft one?" The cron agents, scheduled briefings, and sentry watches are the mechanism. The intelligence layer that identifies these opportunities needs to be trained on real operational patterns.

5. **Contextual voice** — The voice/communication profiles exist per deployment (Andy's style, Tor's style). The client comms agent needs to not just reply but reply in the right voice, with the right context, matching the relationship history. This is where the semantic layer + entity profiles + communication patterns converge.

The path is: **deploy, connect real channels, let real data flow, validate pressure test scenarios, tune thresholds, build feedback loop, iterate toward omniscience.** The architecture and code are there. The proof comes from operational fire.

---

## Part 8: Andy's Specific Expectations (Implicit + Explicit)

### Explicit (From Meetings)

1. **"It has to actually work."** Not a demo, not a mock — real channels, real emails, real invoices. AWU is the testbed.
2. **"Speed is so important in business."** Tradies need instant response. The value prop dies if BitBit is slow.
3. **Voice-first interaction.** WhatsApp voice notes, phone agent — the killer differentiator for trades.
4. **Pricing must be defensible.** Andy pushed hard on cost basis per agent. Needs to explain margin to clients.
5. **"Charge people for this shit bro."** Revenue now, not just building.
6. **"I need to do it in order to sell it."** Andy's own agency must run on BitBit. That's the sales proof.

### Implicit (Reading Between the Lines)

- **Tor handles all technical execution.** "I'll leave that with you bro I can't even have the capacity at the moment."
- **Fast iteration.** Andy sends ideas frequently and expects responsiveness.
- **The product sells itself once demoed.** Content-first marketing — shoot demos, post content, funnel leads.
- **Modular upsell path.** Start cheap, prove value, add agents, grow revenue per client.
- **Enterprise is the gold mine.** Tender Hunter at $1-2k/month is where the real revenue ceiling is.

### Where Andy's Expectations Meet Pressure Tests

| Andy Expects | Maps To Pressure Test |
|-------------|----------------------|
| "It works for real" | PT-2 (channel relay), PT-7 (deployment) |
| "Speed" | PT-3 (WhatsApp latency), PT-5 (lead response) |
| Voice-first | PT-3 (voice note pipeline) |
| Defensible pricing | PT-8 (cost efficiency) |
| Sellable product | PT-7 (deployment) + G5 (billing) + G6 (free trial) |
| Tender Hunter revenue | PT-6 (tender validation) |

---

## Appendix: Key Quotes from Cluely Sessions

**Andy on core value (Feb 19)**:
> "Hey remind me to do this or hey bit prepare an email for this guy for a quote or for an invoice... that'll be so fucking killer dude because speed is so important in business."

**Andy on pricing confidence (Feb 19)**:
> "I know people that will pay for that if it's working." (re: Tender Hunter at $1-2k/mo)

**Andy on proof (Feb 22)**:
> "I need to do it in order to sell it because people are going to be like show us and I'm going to say I fucking use it."

**Andy on modularity (Feb 19)**:
> "Anytime a certain client comes along that needs solution ABC but not DEF we just apply ABC."

**Andy on retention (Feb 25)**:
> "If we make them so reliant on our service because it does literally everything... it's going to be so difficult for them to leave."

**Andy on revenue urgency (Feb 22)**:
> "Charge people for this shit bro because if it's costing you that much."

**Tor on vision (Wispr, Feb 21)**:
> "I really can't stress how much I want BitBit to be insanely performance-optimised. I want BitBit to live in the ambiguous nature of the application, where it's always there with you, no matter where you are."

**Tor on ambition (Feb 22)**:
> "I'm actually super confident we can get funding... the shit I'm running for myself, it's like fucking nuts to people."

**Andy on partnership clarity (Feb 25)**:
> "The last thing I want happen is we've got fifty fifty of a company and you're doing all the work or vice versa."

**Andy on free trial conversion (Feb 25)**:
> "I guarantee you half of them are going to say yes. Of the half that say yes a good percentage are going to want more shit."
