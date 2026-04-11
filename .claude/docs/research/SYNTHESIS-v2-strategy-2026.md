# BitBit v2.0 Strategic Technology Roadmap

**Date:** 2026-03-12
**Status:** Strategic synthesis for Tor + Andy review
**Sources:** 12 deep research documents, 2 strategic analyses, current codebase audit
**Audience:** Andy (business decisions), Tor (technical execution)

---

## 1. Executive Summary

### The Thesis

BitBit v1.2 is a capable assistant that does what it is told. v2.0 must become an operations partner that knows what needs doing before anyone asks. The competitive moat is not features -- it is accumulated context. Every email, invoice, voice note, and calendar event BitBit processes makes it harder to replace. After six months of operation, switching to a competitor means losing six months of learned patterns, relationship intelligence, and calibrated autonomy. No feature list can replicate that.

### What Makes BitBit Unbeatable

BitBit occupies a position no competitor holds: the intersection of **business context awareness** (it understands Andy's clients, rates, projects, and history), **conversational channels** (it lives where the owner already works -- WhatsApp, voice notes, email), and **financial operations** (it generates invoices, tracks payments, predicts cash flow). Lindy automates tasks but understands nothing about the business. Attio stores CRM records but takes no action. Clay enriches lead data but cannot send an invoice. n8n connects tools but has no judgment. BitBit is the only platform that can hear "invoice Dave for the kitchen job" as a voice note from a job site and execute it end-to-end because it knows who Dave is, what the kitchen job was, the rate, and whether it has already been invoiced.

### The Three Strategic Bets

**Bet 1: Context That Compounds.** Build a memory and intelligence layer that gets measurably smarter every week. Relationship strength tracking, sentiment drift detection, behavioral pattern learning, and outcome-based self-improvement. The goal is not "AI that helps" but "AI that cannot be replaced because it knows too much."

**Bet 2: Voice-First Operations.** Make BitBit the first business platform usable without a screen. WhatsApp voice commands, drive-time audio briefings, and eventually real-time voice calls via ElevenLabs. This is not a nice-to-have -- it unlocks the entire tradie, field service, and mobile operator market that literally cannot use screen-first products during their working day.

**Bet 3: Proactive Revenue Intelligence.** Shift from reactive (do what Andy asks) to anticipatory (do what Andy needs before he asks). Cash flow prediction, revenue leak detection, client churn early warning, and optimal pricing suggestions. BitBit becomes the operations manager Andy cannot afford to hire -- one that works 24/7, never forgets, and pays for itself in found revenue.

---

## 2. Technology Decisions Matrix

### Memory Architecture

**Decision: Extend the existing Context Baseplate with a hybrid approach -- Supabase-native knowledge graph + Anthropic Claude's native memory capabilities. Do NOT adopt Zep Graphiti, mem0, or LangGraph's memory stores.**

| Option | Verdict | Rationale |
|--------|---------|-----------|
| **Current Context Baseplate (extend)** | **WINNER** | Already built. Entity profiles, cross-references, pattern extractor, semantic memories all exist. Extending with time-series metrics, sentiment trajectories, and behavioral patterns is 2-4 weeks, not a rewrite. |
| Zep Graphiti (knowledge graph) | Pass | Beautiful architecture but adds a new dependency, new failure mode, and new cost. The graph features (temporal edges, episode decomposition) can be replicated in Supabase JSONB + materialized views at BitBit's scale (<1000 entities per org). |
| mem0 (hosted memory) | Pass | Currently used for Claude Code sessions but wrong fit for production. Adds latency, vendor dependency, and limited to semantic search. BitBit needs structured relationship data, not just "memories." |
| Gemini 2M context window | Pass for now | Tempting for "just stuff everything in context" but cost-prohibitive at scale ($7/1M tokens), unreliable beyond 500K tokens in practice (research shows degradation), and creates vendor lock-in away from Anthropic. Revisit in 12 months when costs drop 5-10x. |

**Implementation:** Add `business_metrics` (time-series), `behavioral_patterns` (trigger-action pairs), `action_outcomes` (feedback loop) tables. Extend `entity_profiles` with `sentiment_trajectory`, `communication_style`, `optimal_contact_windows`, `predicted_ltv`, `churn_risk_score`. Total schema additions: ~5 tables, 3-4 weeks work. The research on tiered memory (episodic/semantic/procedural) maps directly to what already exists: entity_timeline = episodic, semantic_memories = semantic, behavioral_patterns (new) = procedural.

### Voice Platform

**Decision: ElevenLabs Conversational AI for voice agent features. Whisper (existing) for WhatsApp voice note transcription. Do NOT build a real-time phone agent in Phase 1.**

| Option | Verdict | Rationale |
|--------|---------|-----------|
| **ElevenLabs Conversational AI** | **WINNER for voice agent** | Best voice quality (NISQA MOS 4.5+), 75ms TTFB, native Telnyx integration (BitBit already uses Telnyx), WhatsApp support coming, MCP tool integration, $0.07/min on Scale tier. Startup grant program available. |
| OpenAI Realtime API | Pass | Lower voice quality, no phone integration without middleware, $0.06/min but locked to GPT-4o (cannot use Claude for reasoning). Biggest problem: BitBit's intelligence is in Claude-powered agents -- OpenAI Realtime cannot call them. |
| LiveKit + Deepgram + custom TTS | Pass | Maximum control but 3-4 months of infrastructure work to reach what ElevenLabs provides out of the box. Wrong trade-off for a bootstrapped product. |
| Hume AI (emotional intelligence) | Defer | Fascinating technology but $0.04-0.07/min and solves a problem (emotional tone matching) that is not the current bottleneck. Revisit when voice is mature and response quality, not tone, is solved. |

**Phased approach:**
- Phase 1 (v2.0): Improve WhatsApp voice commands using existing Whisper transcription + add TTS replies via ElevenLabs TTS API ($0.024/1K chars). Cost: ~$0.01-0.02 per voice interaction.
- Phase 2 (v2.1): Add ElevenLabs Conversational AI for phone-based drive-time debrief. Uses Telnyx SIP trunk already provisioned. Cost: ~$0.07/min.
- Phase 3 (v2.3): Full voice agent with custom voice clone for brand consistency.

### Web Scraping / Content Extraction

**Decision: Firecrawl as primary, Jina Reader as free fallback. Do NOT invest in Browserbase or self-hosted Playwright.**

| Option | Verdict | Rationale |
|--------|---------|-----------|
| **Firecrawl** | **WINNER** | Purpose-built for LLM consumption. Markdown output, JavaScript rendering, 500 pages/month free, $19/mo for 3K credits. Auto-handles anti-bot, retries, and rate limiting. Best for: client website analysis during onboarding, competitive monitoring, lead research. |
| Jina Reader | Free fallback | `r.jina.ai/{url}` -- zero config, free tier generous, great for simple pages. Use as fallback when Firecrawl credits exhausted or for quick single-page reads. |
| Browserbase | Overkill | $49/mo base, needed only for complex JS-heavy sites. BitBit's use cases (business websites, pricing pages, about pages) are mostly static content. |
| Tavily / Exa | For search, not scraping | Use Tavily ($5/1K searches) for web search within agent tools (T027 already implements this). Not a replacement for targeted page extraction. |

### Inference Optimization

**Decision: Implement a simple 3-tier model router using Claude's own model family. Do NOT adopt RouteLLM, self-hosted models, or fine-tuning in 2026.**

| Option | Verdict | Rationale |
|--------|---------|-----------|
| **Claude 3-tier routing (Haiku/Sonnet/Opus)** | **WINNER** | Already partially implemented. Haiku for classification ($0.25/1M), Sonnet for standard agent work ($3/1M), Opus for complex reasoning ($15/1M). The existing `model-router.ts` needs threshold tuning, not replacement. Extended thinking for high-stakes decisions (invoice amounts, client communications) adds 2-4x cost but 30-50% accuracy gain where it matters. |
| RouteLLM (Berkeley) | Pass | Designed for routing between open-source and commercial models. BitBit is all-Anthropic -- the routing decision is simpler (Haiku vs Sonnet vs Opus) and can be done with heuristics, not a trained router. |
| Self-hosted (vLLM + Llama) | Pass | Requires GPU infrastructure ($400-800/mo for A100), DevOps overhead, and model quality is still below Claude for business reasoning. Wrong trade-off for a bootstrapped product. Revisit if inference costs become >$2K/month. |
| Fine-tuning (LoRA) | Defer to v2.3 | Requires 5K-20K domain-specific trajectories that do not exist yet. Build the outcome tracking infrastructure in v2.0-v2.1, collect trajectories, consider fine-tuning in v2.3 when data is sufficient. |

**Quick win:** Add extended thinking for invoice amount calculations and client communications (the two highest-consequence agent actions). Cost increase: ~$50-100/month. Accuracy improvement: measurable via outcome tracking.

### Testing and Evaluation

**Decision: Promptfoo for prompt regression testing + custom evaluation harness for business-specific metrics. Do NOT adopt Langfuse, DeepEval, or LangSmith.**

| Option | Verdict | Rationale |
|--------|---------|-----------|
| **Promptfoo** | **WINNER for prompt testing** | Open source, YAML-based, CI/CD friendly, free. Define test cases as YAML, run against prompt changes, catch regressions. Already proven for exactly this use case. 2-3 hours to set up. |
| Custom eval harness | **WINNER for business metrics** | BitBit needs domain-specific evaluation (invoice accuracy, lead classification precision, confidence routing correctness). These cannot be captured by generic LLM evaluation tools. Build 50-100 hand-labeled test cases per agent, run after every prompt change. |
| Langfuse | Nice but unnecessary | Open-source observability platform. BitBit already logs agent runs with cost tracking. Adding Langfuse introduces another dependency for marginal benefit at current scale (<100 agent runs/day). |
| DeepEval | Pass | Good for generic LLM testing but BitBit's evaluation criteria are too domain-specific. Custom harness is better. |

**Implementation:** Promptfoo config with test suites per agent (invoice-flow: 30 cases, lead-swarm: 25 cases, sentry: 20 cases). Run in CI on prompt changes. Add A/B testing infrastructure (custom, DIY) when v2 features are shipping to production users.

### Orchestration Pattern

**Decision: Keep the current custom orchestrator. Do NOT migrate to LangGraph or CrewAI.**

| Option | Verdict | Rationale |
|--------|---------|-----------|
| **Current custom orchestrator** | **WINNER** | The relay daemon, confidence router, approval queue, and agent scheduler are built, tested, and deployed. They handle BitBit's specific patterns (WhatsApp approval flow, multi-turn context resolution, per-agent confidence thresholds) that no framework supports natively. |
| LangGraph | Pass | Excellent framework but migration cost is 4-6 weeks with zero user-visible benefit. LangGraph's strengths (state management, checkpointing, human-in-the-loop) are already implemented in BitBit's custom orchestrator. Adopt LangGraph patterns (like the supervisor pattern for multi-agent coordination) as design inspiration, not as a dependency. |
| CrewAI | Pass | Higher-level abstraction than needed. BitBit's agents are tightly integrated with business data -- the loose coupling CrewAI provides would require extensive custom tooling anyway. |
| MCP (Model Context Protocol) | Adopt selectively | MCP is a protocol, not a framework. Expose BitBit's tools as MCP servers so external AI tools (Claude Desktop, Cursor) can interact with BitBit data. This is a distribution strategy, not an orchestration change. 1-2 weeks to implement. |

### Onboarding Strategy

**Decision: Email archaeology + progressive profiling + immediate first-value moment. Two-step onboarding, not five.**

The research is clear: completion drops 30% after 5 form fields, and showing value within 3-5 minutes increases 30-day activation by 35%. BitBit's onboarding should:

1. **Step 1 (2 min):** Connect Gmail. Background: scan last 3 months, extract top contacts, identify projects, find revenue signals.
2. **Step 2 (2 min):** Show "first value moment" -- top 5 relationships by interaction frequency, ask user to confirm client/vendor/other. This creates immediate validation and trains the model.
3. **Background (24 hours):** Full email archaeology, calendar intelligence, Stripe data ingestion. Progressive profiling via contextual micro-validations over the first week.
4. **Day 7:** Full context available. Agent activation: "Ready to automate your first workflow."

Calendar and Stripe connections should be encouraged but not required. Design for single-channel cold start (email only still provides 60-70% of needed context).

---

## 3. Feature Priority Stack (Top 15)

### Rank 1: Monday Morning Briefing
**One-line:** Start every week knowing what matters, without opening any app.
- **Impact:** 9/10 | **Effort:** 1-2 weeks | **Ratio:** 5.0
- **Research support:** BI research (daily briefing pattern), proactive agents (anticipatory delivery), competitive analysis (no competitor does this)
- **Leapfrogs:** Google Workspace morning summary (email-only, generic), all competitors (none synthesize financial + pipeline + project + calendar)
- **Dependencies:** None -- builds on existing daily_digest, channel data, and invoice records
- **Business outcome for Andy:** "I read one WhatsApp message Monday morning and know exactly where my business stands and what to do first."

### Rank 2: Optimal Contact Timing
**One-line:** Messages land when each client is most likely to respond.
- **Impact:** 7/10 | **Effort:** 1-2 weeks | **Ratio:** 5.0
- **Research support:** Feature manifesto (5.3), proactive agents (behavioral pattern matching)
- **Leapfrogs:** Mailchimp/HubSpot (marketing-only send optimization), all competitors (none do 1:1 business communication timing)
- **Dependencies:** None -- response latency data already tracked in pattern_extractor
- **Business outcome for Andy:** "Invoice follow-ups get same-day responses instead of being ignored for 3 days."

### Rank 3: Confidence Auto-Calibration
**One-line:** BitBit earns more autonomy as it proves itself, like training a new employee.
- **Impact:** 8/10 | **Effort:** 2-3 weeks | **Ratio:** 3.2
- **Research support:** Feature manifesto (7.2), multi-agent orchestration (trust frameworks), proactive agents (graduated autonomy)
- **Leapfrogs:** Every competitor (all use static rules or manual configuration)
- **Dependencies:** None -- confidence router and approval queue already track everything needed
- **Business outcome for Andy:** "BitBit started asking about everything. Now it handles 80% of routine work silently because it earned my trust."

### Rank 4: Relationship Graph with Strength Decay
**One-line:** BitBit warns you when important relationships are going cold.
- **Impact:** 8/10 | **Effort:** 2 weeks | **Ratio:** 3.2
- **Research support:** Feature manifesto (1.2), memory architectures (temporal relationship modeling), competitive analysis (no CRM tracks cross-channel relationships)
- **Leapfrogs:** HubSpot (last-activity only), Salesforce Einstein (deal scoring only), Attio (no decay model)
- **Dependencies:** None -- entity_profiles and relationship_linker already exist
- **Business outcome for Andy:** "BitBit told me I hadn't spoken to my best referral partner in 47 days. I called him and got a $15K project."

### Rank 5: Sentiment Drift Detection
**One-line:** BitBit notices when a client is getting frustrated before they complain.
- **Impact:** 8/10 | **Effort:** 2-3 weeks | **Ratio:** 3.2
- **Research support:** Feature manifesto (5.1), memory architectures (longitudinal analysis), BI research (anomaly detection patterns)
- **Leapfrogs:** Salesforce Einstein (deal sentiment only), Intercom (support contexts only), no tool does cross-channel relationship sentiment
- **Dependencies:** Relationship graph (rank 4) for entity context
- **Business outcome for Andy:** "BitBit caught that Coastal Plumbing was unhappy 2 weeks before they would have fired us. A 10-minute call saved a $40K/year client."

### Rank 6: Revenue Leak Detection
**One-line:** BitBit finds money you earned but forgot to invoice.
- **Impact:** 9/10 | **Effort:** 3-4 weeks | **Ratio:** 2.6
- **Research support:** Feature manifesto (4.2), BI research (cross-platform data synthesis), competitive analysis (no invoicing tool detects uninvoiced work)
- **Leapfrogs:** Xero, QuickBooks, FreshBooks (all only track invoices that exist)
- **Dependencies:** Business pulse engine (rank 9) for project completion signals
- **Business outcome for Andy:** "BitBit found $8,400 in work I completed but never invoiced. It paid for itself in the first month."

### Rank 7: WhatsApp Voice Command Interface
**One-line:** Run your business by talking to BitBit while your hands are dirty.
- **Impact:** 9/10 | **Effort:** 3-4 weeks | **Ratio:** 2.6
- **Research support:** Voice research (WhatsApp voice note processing), ElevenLabs research (TTS for replies), competitive analysis (no business tool has voice interface)
- **Leapfrogs:** Siri/Google Assistant (no business context), Lindy (no WhatsApp), every competitor (all screen-first)
- **Dependencies:** ElevenLabs TTS API integration for voice replies
- **Business outcome for Andy:** "My tradie clients send voice notes from job sites to create invoices. They love it."

### Rank 8: Business Pulse Engine
**One-line:** BitBit knows your business health better than you do, updated daily.
- **Impact:** 8/10 | **Effort:** 3-4 weeks | **Ratio:** 2.3
- **Research support:** Feature manifesto (1.1), BI research (proactive analytics), competitive analysis (no tool synthesizes across all data sources)
- **Leapfrogs:** QuickBooks AI (accounting only), HubSpot (CRM only), no tool combines email sentiment + project hours + payment behavior + pipeline
- **Dependencies:** Time-series metrics table (shared infrastructure)
- **Business outcome for Andy:** "I know which of my 15 clients is actually profitable without doing any tracking."

### Rank 9: Cash Flow Sentinel
**One-line:** BitBit predicts cash flow problems 2-4 weeks before they happen and acts.
- **Impact:** 9/10 | **Effort:** 3-4 weeks | **Ratio:** 2.3
- **Research support:** Feature manifesto (2.3), BI research (financial forecasting), proactive agents (graduated intervention)
- **Leapfrogs:** Xero/QuickBooks (accounting data only, no pipeline visibility), no tool takes action (sends follow-ups, prioritizes leads)
- **Dependencies:** Business pulse engine (rank 8), payment pattern data (existing)
- **Business outcome for Andy:** "BitBit warned me about a cash crunch 3 weeks early, auto-chased 2 overdue invoices, and suggested which quotes to prioritize."

### Rank 10: Anticipatory Actions
**One-line:** BitBit does the thing you were about to ask for, before you ask.
- **Impact:** 10/10 | **Effort:** 5-6 weeks | **Ratio:** 1.8
- **Research support:** Proactive agents (pattern-derived confidence), feature manifesto (2.1), memory architectures (procedural memory)
- **Leapfrogs:** Every competitor (Zapier automates rules, Lindy automates described workflows, neither learns implicit patterns)
- **Dependencies:** Behavioral pattern store, confidence auto-calibration (rank 3), outcome tracking
- **Business outcome for Andy:** "I mark a project complete in Asana and BitBit already has the invoice drafted because it learned I always invoice within 48 hours."

### Rank 11: Outcome Learning Loop
**One-line:** Every action BitBit takes becomes training data to make the next action better.
- **Impact:** 10/10 | **Effort:** 5-6 weeks | **Ratio:** 1.8
- **Research support:** Feature manifesto (7.1), agent testing research (continuous evaluation), inference research (feedback-driven optimization)
- **Leapfrogs:** Every competitor (none track action outcomes or self-improve)
- **Dependencies:** Action outcomes table, confidence auto-calibration (rank 3)
- **Business outcome for Andy:** "BitBit's lead responses convert 40% better than 6 months ago because it learned what works for my business."

### Rank 12: Client Onboarding Autopilot
**One-line:** New client signs the proposal, everything else happens automatically.
- **Impact:** 8/10 | **Effort:** 3-4 weeks | **Ratio:** 2.3
- **Research support:** Feature manifesto (6.1), onboarding research (workflow orchestration), competitive analysis (Dubsado/HoneyBook are templates, not intelligence)
- **Leapfrogs:** Dubsado, HoneyBook (forms and templates, no AI decision-making or calendar negotiation)
- **Dependencies:** Business pulse engine (rank 8) for project template selection
- **Business outcome for Andy:** "New client = zero admin. Asana project created, kickoff call scheduled, first invoice queued. I just show up."

### Rank 13: Drive-Time Debrief
**One-line:** Turn your commute into the most productive 20 minutes of your day.
- **Impact:** 9/10 | **Effort:** 5-7 weeks | **Ratio:** 1.5
- **Research support:** Voice research (real-time conversation), ElevenLabs research (Conversational AI + Telnyx), feature manifesto (3.2)
- **Leapfrogs:** Nothing like this exists for small business. New category.
- **Dependencies:** Monday morning briefing (rank 1), ElevenLabs Conversational AI, Telnyx phone line
- **Business outcome for Andy:** "I drive to my first client meeting fully briefed. BitBit called me, read the agenda, and I approved 3 actions hands-free."

### Rank 14: Smart Document Generation
**One-line:** Full proposals from a single sentence, pre-filled with everything BitBit knows.
- **Impact:** 8/10 | **Effort:** 3-4 weeks | **Ratio:** 2.3
- **Research support:** Feature manifesto (6.3), BI research (LLM narrative generation), competitive analysis (PandaDoc/Proposify are template-based)
- **Leapfrogs:** PandaDoc, Proposify, Qwilr (all template-based, none extract scope from conversation history)
- **Dependencies:** Business pulse engine (rank 8), pricing intelligence (deferred)
- **Business outcome for Andy:** "'Bit, write a proposal for Coastal Plumbing's website redesign.' -- 90% done in 30 seconds."

### Rank 15: End-of-Month Autopilot
**One-line:** Month-end invoicing, reporting, and anomaly detection happens on the 28th without you.
- **Impact:** 8/10 | **Effort:** 3-4 weeks | **Ratio:** 2.3
- **Research support:** Feature manifesto (6.2), BI research (automated reporting), competitive analysis (no tool combines invoicing + reporting + anomaly detection)
- **Leapfrogs:** Xero/QuickBooks (recurring invoices only, no ad-hoc work detection, no anomaly alerts)
- **Dependencies:** Revenue leak detection (rank 6), business pulse engine (rank 8)
- **Business outcome for Andy:** "End of month used to take half a day. Now it takes 5 minutes to review what BitBit already did."

---

## 4. Implementation Phases

### v2.0 Quick Wins (Weeks 1-4): "Make BitBit Indispensable"

**Goal:** Ship 4 features that make BitBit feel like it understands the business better than the owner does. All leverage existing infrastructure.

| Week | Feature | Effort | What Ships |
|------|---------|--------|------------|
| 1-2 | Monday Morning Briefing | 1-2 wk | Enhanced daily_digest with financial context, proactive draft actions, forward-looking schedule. Delivered via WhatsApp + email. |
| 1-2 | Optimal Contact Timing | 1-2 wk | Time-bucketed response analysis per contact. Outbound messages auto-scheduled for recipient's optimal window. |
| 2-4 | Confidence Auto-Calibration | 2-3 wk | Dynamic thresholds per agent per action type. Trust dashboard showing accuracy and threshold evolution. |
| 2-4 | Relationship Graph with Decay | 2 wk | Strength scoring across all channels. Decay function. Proactive nudges for cold relationships. Dashboard widget. |

**Shared infrastructure built in v2.0:**
- `business_metrics` time-series table
- Enhanced `entity_profiles` with sentiment_trajectory, communication_style, optimal_contact_windows
- Promptfoo test suites for all existing agents (regression safety net)

**Milestone:** Andy receives his first Monday briefing via WhatsApp and says "I can't go back to opening 5 apps."

### v2.1 Intelligence Layer (Weeks 5-10): "BitBit Sees Things You Miss"

**Goal:** Ship the features that detect problems before they become crises and find money that would otherwise be lost.

| Week | Feature | Effort | What Ships |
|------|---------|--------|------------|
| 5-7 | Sentiment Drift Detection | 2-3 wk | Longitudinal sentiment tracking per client. Drift alerts with root-cause correlation. |
| 5-8 | Business Pulse Engine | 3-4 wk | Daily computation of effective hourly rate per client, pipeline velocity, cash position forecast, utilization rate. Foundation for cash flow and revenue features. |
| 6-9 | Revenue Leak Detection | 3-4 wk | Cross-references project activity against invoicing records. Flags completed work with no invoice. Draft invoice generation. |
| 7-10 | WhatsApp Voice Commands | 3-4 wk | Full voice command interface. Voice-optimized response formatting. ElevenLabs TTS for voice note replies. <5 second response target. |

**Shared infrastructure built in v2.1:**
- `behavioral_patterns` table (trigger-action pairs from observation)
- `action_outcomes` table (links agent actions to results)
- ElevenLabs TTS integration (thin wrapper, ~1 day)
- Onboarding email archaeology pipeline (3 months backfill)

**Milestone:** BitBit catches a revenue leak ($2K+ uninvoiced work) and Andy processes his first voice command from a job site.

### v2.2 Revenue Features (Weeks 11-16): "BitBit Makes Money"

**Goal:** Ship the features that directly generate or save revenue. These are the justification for BitBit's price tag.

| Week | Feature | Effort | What Ships |
|------|---------|--------|------------|
| 11-14 | Cash Flow Sentinel | 3-4 wk | 30-day rolling cash flow forecast. Graduated interventions (warn, chase invoices, suggest which quotes to prioritize). Dashboard timeline. |
| 11-14 | Client Onboarding Autopilot | 3-4 wk | Proposal accepted -> Asana project, kickoff call, welcome email, invoice schedule, contact record. All automated. |
| 13-16 | End-of-Month Autopilot | 3-4 wk | Monthly cycle: generate outstanding invoices, financial summary, anomaly detection, accountant-ready export. |
| 14-16 | Smart Document Generation | 3-4 wk | Context-aware proposals, contracts, and reports. Branded templates, scope extracted from conversation history, pricing from historical data. |

**Milestone:** Andy's month-end takes 5 minutes instead of half a day. Cash flow sentinel prevents a crunch by auto-chasing overdue invoices.

### v2.3 The Moat (Weeks 17-24): "BitBit Gets Better Every Week"

**Goal:** Ship the compounding features that create permanent competitive advantages. After this phase, switching costs are insurmountable.

| Week | Feature | Effort | What Ships |
|------|---------|--------|------------|
| 17-22 | Anticipatory Actions | 5-6 wk | Pattern learning from observation. Pre-execution of high-confidence patterns. "BitBit learned this" notifications. Override/correction UI. |
| 17-22 | Outcome Learning Loop | 5-6 wk | Tracks outcomes of every agent action. Feeds into decision-making. Templates evolve toward higher conversion/payment rates. |
| 19-24 | Drive-Time Debrief | 5-7 wk | Phone-based audio briefing via ElevenLabs Conversational AI + Telnyx. Multi-turn voice conversation with action execution. |
| 20-24 | Business Pattern Library | 3-4 wk | Structured operational patterns discovered from data. Weekly insight reports. Queryable knowledge base of how the business operates. |

**Shared infrastructure built in v2.3:**
- ElevenLabs Conversational AI integration (phone agent)
- Pattern discovery engine (LLM + statistical validation, weekly cron)
- Outcome tracking feedback loops for confidence threshold auto-adjustment

**Milestone:** BitBit has been running for 6 months. It auto-handles 80% of routine operations. Its lead response templates convert 30% better than month 1. An entire category of admin work -- invoicing, follow-ups, scheduling, reporting -- happens without Andy touching it.

---

## 5. Competitive Positioning

### vs. Lindy.ai (The Swiss Army Knife)
Lindy has 1,000+ templates and 4,000+ integrations, but every one of them is a generic task automation that knows nothing about Andy's business. When Lindy sends a follow-up email, it uses a template. When BitBit sends a follow-up, it knows the client prefers casual WhatsApp messages in the morning, that they are 3 days overdue, and that Andy is seeing them Thursday so the follow-up should reference the upcoming meeting. BitBit v2 makes this gap permanent: anticipatory actions that learn from patterns, sentiment drift that catches churn, and voice commands from job sites. Lindy cannot replicate six months of learned context.

### vs. Relevance AI (The Enterprise Workforce Builder)
Relevance AI sells visual agent canvases to mid-market sales teams. BitBit sells outcomes to a solo agency owner. Relevance's Workforce Canvas is powerful but requires an ops manager to configure and maintain. BitBit's v2 confidence auto-calibration eliminates configuration -- the system earns autonomy over time. Relevance has no financial operations (invoicing, payment tracking, cash flow), no WhatsApp presence, and no voice interface. For a 3-person agency, Relevance is a solution for a problem they do not have.

### vs. n8n (The Developer's Automation Engine)
n8n is the right tool if you are a developer who wants to build arbitrary automations. It is the wrong tool if you are a tradie on a job site who needs to invoice a client via voice note. BitBit v2's voice-first interface, business context awareness, and confidence routing create a fundamentally different product category. n8n connects tools. BitBit operates the business. The developer who might use n8n to build what BitBit does would spend 3-6 months and still lack the memory, learning, and voice capabilities.

### vs. Attio (The AI-Native CRM)
Attio is a beautiful CRM that stores relationship data. BitBit is an operations partner that acts on relationship data. Attio's "Ask Attio" lets you query your CRM. BitBit's Monday briefing proactively tells you what matters without being asked. Attio records that you had a meeting with Dave. BitBit notices that Dave's email tone shifted negative, his payments slowed, and his Asana tasks have more revision cycles -- and it alerts you to schedule a check-in. v2's sentiment drift detection and revenue leak detection make Attio's record-keeping feel passive.

### vs. Clay (The Data Enrichment Powerhouse)
Clay is the best tool for finding and enriching prospect data. It is useless after the prospect becomes a client. BitBit covers the full lifecycle: discover, qualify, respond, onboard, deliver, invoice, collect, retain. Clay's $134/month Starter plan barely covers 40-80 leads. BitBit's lead swarm + client onboarding autopilot + revenue intelligence handles the entire journey at a fraction of the per-lead cost.

### vs. Hume AI / Bland.ai (The Voice Specialists)
Hume and Bland are developer toolkits that provide voice infrastructure. They require engineers to build anything usable. BitBit v2 uses ElevenLabs (superior voice quality at comparable cost) and wraps it in business context, channel integrations, and confidence routing. A Bland phone call is just sound. A BitBit drive-time debrief is a business operations session that references real clients, real invoices, and real deadlines.

### vs. HubSpot / Salesforce (The Incumbents)
The largest competitive threat. But their AI features (Copilot, Einstein) are add-ons bolted onto record-keeping systems. They will never understand that Dave is 3 days overdue, that his email tone shifted, and that you are seeing him Thursday -- because that requires cross-channel data fusion that their architecture does not support. BitBit's moat is depth of context in a focused niche. HubSpot serves everyone. BitBit serves the 3-person agency owner perfectly.

### vs. Microsoft Copilot / Google Workspace AI
The existential threat. Both will add "AI operations" features. The defense is specialization and time-in-market. Microsoft Copilot will summarize emails and schedule meetings. It will not generate invoices from voice notes, predict cash flow from payment patterns, or learn that you always invoice within 48 hours of project completion. By the time they build generic versions of these features, BitBit will have 12 months of compounding context that makes it irreplaceable for its users.

---

## 6. Risk Register

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Anthropic API cost escalation** | Medium | High | Current inference costs ~$200-400/month for one org. v2 features (business pulse, sentiment analysis, anticipatory actions) could 3-5x this. Mitigation: aggressive Haiku usage for classification/routing, Sonnet only for generation, Opus only for high-stakes reasoning. Monitor weekly. Threshold: if costs exceed $1K/month/org, implement response caching and reduce recomputation frequency. |
| **ElevenLabs voice quality regression** | Low | Medium | Voice AI is evolving rapidly. ElevenLabs could raise prices or degrade quality. Mitigation: build voice pipeline with abstraction layer (TTS interface, not ElevenLabs-specific code). Can swap to Cartesia, LMNT, or OpenAI TTS in days. |
| **WhatsApp API instability** | Medium | High | Baileys (unofficial) and Meta Cloud API (official) both have reliability risks. Mitigation: dual transport already in progress (T013). If both fail, SMS via Telnyx is the fallback channel. |
| **Supabase scaling limits** | Low | Medium | Current usage is tiny. v2 adds time-series data, behavioral patterns, and more frequent writes. Supabase handles this easily at BitBit's scale (100s of orgs, not 100Ks). Monitor database size and query latency monthly. |
| **Context window overflow** | Medium | Medium | As memory accumulates, prompt size grows. Risk of hitting Claude's context limit on long-running conversations. Mitigation: the compiled baseplate approach (pre-compute and cache) already solves this. Extend with memory consolidation (summarize old events, keep only insights). |

### Market Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Microsoft/Google bundle AI ops** | High | High | Inevitable within 12-18 months. Defense: depth of context in a focused niche. By the time they ship generic features, BitBit has 12+ months of compounding advantage per user. Their features will be broad and shallow. BitBit's will be narrow and deep. |
| **Recession reduces SMB spend** | Medium | High | Small businesses cut SaaS first in downturns. Mitigation: position BitBit as revenue-generating (finds uninvoiced work, prevents churn, optimizes pricing) not cost-center. If BitBit saves/finds $5K/month, it survives budget cuts. |
| **Competitor copies voice-first approach** | Medium | Medium | Voice-first is a UX decision, not a technical moat. Others can copy it. Defense: voice is just the interface. The moat is context (relationship graph, behavioral patterns, outcome learning). Voice without context is just a phone call. |
| **Target market too small** | Medium | Medium | 3-person agencies are a small TAM. Mitigation: v2 features (voice commands, mobile-first) expand to trades, field service, property management -- much larger TAM with same pain points. |

### Resource Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Tor is a single point of failure** | High | Critical | All development depends on one person. Mitigation: maintain clean architecture, comprehensive CLAUDE.md, automated tests. If Tor is unavailable for 2 weeks, another developer with Claude Code can continue. The GitNexus index also helps. |
| **Feature scope creep in v2** | High | Medium | 19 features in the manifesto, 15 in this roadmap. Risk of trying to build everything at once. Mitigation: strict phase gates. Do not start v2.1 until v2.0 ships. Weekly check: "Is this feature in the current phase?" |
| **Andy's attention divided** | Medium | Medium | Andy runs the agency and is the primary user. He may not have time to test, give feedback, or validate AI outputs. Mitigation: design for async feedback. BitBit should work well with zero feedback and get better with it. Confidence auto-calibration ensures the system is useful even without active training. |

---

## 7. Open Questions for Andy

### 1. Pricing and Packaging
"BitBit v2 has significantly more value (cash flow prediction, revenue leak detection, voice commands, smart documents). Should we raise the price? What price point feels right for a tool that saves you $5K+/month in found revenue and recovered time? Current competitors charge $49-299/month for individual features that BitBit bundles."

### 2. Voice Feature Priority
"Would you actually use a phone-based briefing during your commute? Or are WhatsApp voice notes sufficient? The drive-time debrief is the most expensive feature to build and maintain (~$0.07/min). If the answer is 'WhatsApp voice is enough,' we can defer phone calls to v3 and save 5-7 weeks."

### 3. Who Is the Next Andy?
"v1 was built for you specifically -- All Webbed Up, web agency, 3 people, 15 clients. v2 features are designed to be more universal. But we need to decide: is the next customer another web agency? A tradie? A consultant? A property manager? The voice-first features work best for mobile operators (trades, field service). The revenue intelligence works best for service businesses (agencies, consultants). Which market do we attack first?"

### 4. Tradie Market Validation
"The voice-first approach opens up trades and field service -- a market 50x larger than web agencies. But we have zero validation that a plumber or electrician would use AI for invoicing. Before building v2.1's voice features, should we find 3-5 tradies to test the concept? A weekend of user interviews could validate or kill this bet."

### 5. Billing and Trial Timing
"v1.2 has deferred billing requirements (BILL-01 through BILL-06). When do we turn on payments? Options: (a) Ship v2.0 quick wins first, then add billing -- more value before asking for money. (b) Add billing now and start charging immediately -- cash flow for the business. (c) Free beta through v2.1, paid from v2.2 -- maximum learning before committing to a price."

### 6. Single-Player vs. Team Features
"BitBit is built for the business owner. But Andy has a team (however small). Should v2 add team features (shared inbox, task delegation, team performance dashboards) or stay pure single-player? Team features expand TAM but add complexity. Every hour spent on team features is an hour not spent on making the single-player experience magical."

### 7. Data Sensitivity Comfort Level
"v2 features like sentiment drift detection and communication style matching require analyzing the content of client communications. Some business owners may be uncomfortable with AI reading their client emails. How do we message this? Options: (a) On by default with clear disclosure. (b) Opt-in per feature. (c) Show what data is used for each insight (transparency dashboard)."

### 8. Agent Marketplace Timing
"The competitive analysis identified an 'Agent Marketplace' as a powerful network effect play -- users create and share agent configurations for specific niches (plumber lead qualifier, design agency onboarding). But marketplaces are chicken-and-egg problems. Should this be a v3 goal after we have 50+ active users, or should we build the infrastructure now to enable it later?"

### 9. How Much Autonomy Is Too Much?
"v2.3's anticipatory actions mean BitBit will start doing things without being asked -- drafting invoices when projects complete, sending follow-ups when patterns match. The confidence auto-calibration governs this, but the philosophical question is: how much should BitBit do silently? Should there always be a notification ('I did this')? Or should truly routine actions (like scheduling an invoice follow-up at 14 days overdue) happen invisibly?"

### 10. Measurement of Success
"How do we know v2 is working? Proposed metrics: (a) Revenue found -- total value of revenue leak detections, (b) Time saved -- estimated hours of admin work automated per month, (c) Relationship health -- average relationship score trend across all clients, (d) Autonomy earned -- percentage of actions auto-executed vs. requiring approval. Which of these matter most to you? Are there others?"

---

## Appendix A: Research Document Index

| # | Document | Key Insight for BitBit |
|---|----------|----------------------|
| 1 | Agentic Memory Architectures | Tiered memory (episodic/semantic/procedural) maps to existing Context Baseplate. Extend, do not replace. |
| 2 | Proactive Anticipatory Agents | Pattern-derived confidence enables graduated autonomy. The trigger-action-confidence pattern is the foundation for anticipatory actions. |
| 3 | Realtime Voice Agents | ElevenLabs + Telnyx is the right stack. Start with WhatsApp TTS, graduate to phone calls. 75ms TTFB is sufficient. |
| 4 | Multi-Agent Orchestration | Keep custom orchestrator. Adopt LangGraph patterns (supervisor, human-in-the-loop) as design inspiration, not dependencies. MCP as distribution channel. |
| 5 | AI Business Intelligence | Daily briefing + client health scoring + revenue leak detection = the BI stack for SMBs. Build headless (Recharts), not embedded (Luzmo). |
| 6 | Competitive Analysis | No competitor combines context + channels + financial ops. The gap widens with v2 memory and voice features. |
| 7 | v2 Feature Manifesto | 19 features ranked. Top 4 by impact/effort ratio: contact timing, briefing, confidence calibration, relationship decay. |
| 8 | Memory Persistence & AGI Frontiers | Watchdog/sentinel patterns for business monitoring. GCP Vertex AI Memory Bank validates the compiled baseplate approach. |
| 9 | Inference & Intelligence Amplification | 3-tier Claude routing (Haiku/Sonnet/Opus) + extended thinking for high-stakes decisions. RouteLLM unnecessary at this scale. |
| 10 | Onboarding & Data Bootstrapping | Email archaeology is the killer onboarding strategy. 3-month backfill provides 80% of needed context. Progressive profiling beats long forms. |
| 11 | Agent Testing & Experimentation | Promptfoo for regression testing, custom eval harness for domain-specific metrics, DIY A/B testing. Skip Langfuse/DeepEval. |
| 12 | ElevenLabs Voice Integration | Best voice quality, native Telnyx integration, MCP support, $0.07/min on Scale tier. Startup grant available. |
| 13 | Web Tooling Research | Firecrawl primary, Jina Reader fallback. Tavily for web search in agent tools. |
| 14 | Current Roadmap | v1.0-v1.2 complete: 37/37 requirements, 19 phases, all channels operational. |
| 15 | Current Requirements | Future requirements: billing (BILL-01-06), remaining agents (proposal, ad script, onboarding, voice). |

## Appendix B: Cost Projections (Per Organization)

| Component | Current (v1.2) | v2.0 | v2.1 | v2.2 | v2.3 |
|-----------|---------------|------|------|------|------|
| Anthropic API | $200-400/mo | $250-500/mo | $350-700/mo | $400-800/mo | $500-1000/mo |
| ElevenLabs TTS | $0 | $11/mo (Starter) | $99/mo (Scale) | $99/mo | $99/mo |
| Firecrawl | $0 | $0 (free tier) | $19/mo | $19/mo | $19/mo |
| Supabase | $25/mo | $25/mo | $25/mo | $25/mo | $75/mo (Pro) |
| Vercel | $20/mo | $20/mo | $20/mo | $20/mo | $20/mo |
| Fly.io | $5-10/mo | $5-10/mo | $10-20/mo | $10-20/mo | $10-20/mo |
| Cloudflare | $0 | $0 | $0 | $5/mo | $5/mo |
| **Total infra** | **$250-455/mo** | **$311-566/mo** | **$523-883/mo** | **$578-963/mo** | **$728-1,213/mo** |

**Break-even per customer at $149/month plan:** v2.0 needs 3-4 paying customers. v2.3 needs 5-9 paying customers. These costs scale sub-linearly with customer count (shared infrastructure, Anthropic batch discounts).

---

*Synthesis completed 2026-03-12. Based on 12 deep research documents totaling ~500 pages of analysis, 2 strategic analyses, and full codebase audit. Ready for Tor + Andy review.*
