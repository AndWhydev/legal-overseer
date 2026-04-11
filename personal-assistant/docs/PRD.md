# BitBit — Product Requirements Document

**Version**: 1.0.0
**Date**: 2026-02-19
**Authors**: Tor Kay & Andy Taleb
**Status**: Draft — Sunday Review

---

## 1. Executive Summary

BitBit is an **agentic AI operations platform** that deploys autonomous agents to run business operations end-to-end. Agents don't recommend — they **act**. They read emails, draft replies, generate invoices, qualify leads, create proposals, manage tasks, and escalate when uncertain. Every decision is auditable, policy-aware, and routed by confidence scoring.

**Partnership**: 50/50 equity split between Tor Kay (technical) and Andy Taleb (commercial/GTM).

**Strategy**: Deploy BitBit inside All Webbed Up (AWU) as a live production testbed. Agents handle real agency work across real clients. Every problem encountered becomes a product improvement. Once battle-tested, take to market as a productized SaaS platform for agencies, e-commerce operators, and service businesses.

**North Star**: *"You send a message. The problem disappears."*

---

## 2. Vision & Strategy

### 2.1 The Problem

Small-to-mid agencies and service businesses drown in operational overhead:

- **Lead leakage**: Inquiries come in across 5+ channels. Response time kills conversion. Leads fall through cracks.
- **Admin paralysis**: Invoicing, proposals, follow-ups, scheduling — the founder spends 60% of their time on ops instead of selling.
- **Communication chaos**: Gmail, Outlook, WhatsApp, iMessage, Asana, ClickUp, Slack — context is fragmented across a dozen tools.
- **Scaling bottleneck**: Can't hire fast enough. Can't train fast enough. Every new client adds linear overhead.
- **Knowledge loss**: When the founder is unavailable, operations stop. No one else knows the client history, pricing, or processes.

### 2.2 The Solution

BitBit deploys a **swarm of specialized AI agents** inside the business. Each agent owns a domain (leads, invoicing, comms, proposals, ads) and operates autonomously within defined policies. Agents:

- **Synthesize** all communication channels into one prioritized feed
- **Act** on routine tasks automatically (confidence > 80%)
- **Ask** for approval on judgment calls (confidence 50-80%)
- **Escalate** edge cases to humans immediately (confidence < 50%)
- **Learn** from every interaction, building persistent memory
- **Audit** every decision with full transparency

### 2.3 Dual-Purpose Deployment

| Purpose | Benefit |
|---------|---------|
| **For AWU (immediate)** | Andy gets his agency automated. Leads stop leaking. Invoices go out on time. Proposals write themselves. Client comms happen 24/7. |
| **For BitBit (long-term)** | Every AWU deployment is a real-world stress test. Edge cases become features. Client feedback becomes product roadmap. Battle-tested = market-ready. |

### 2.4 Go-To-Market Path

```
Phase 1: AWU Internal Deployment (Now - Month 3)
    → Agents running real operations across AWU clients
    → Iterate on failures, refine confidence routing
    → Build case studies from real results

Phase 2: Controlled Beta (Month 3-6)
    → 5-10 agencies in Andy's network
    → White-label capability
    → Usage-based pricing model validated

Phase 3: Public Launch (Month 6-9)
    → Self-serve onboarding
    → Marketplace for agent templates
    → API for custom integrations

Phase 4: Platform (Month 9+)
    → Third-party agent builders
    → Industry-specific agent packs
    → Enterprise tier with dedicated infrastructure
```

---

## 3. Product Architecture

### 3.1 System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        BitBit Platform                            │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                     Agent Swarm Layer                        │  │
│  │                                                              │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │  │
│  │  │  Lead    │ │ Invoice  │ │ Channel  │ │   Proposal   │   │  │
│  │  │  Swarm   │ │  Flow    │ │  Triage  │ │     Bot      │   │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └──────┬───────┘   │  │
│  │       │             │            │               │           │  │
│  │  ┌────┴─────┐ ┌────┴─────┐ ┌────┴────┐ ┌───────┴────────┐  │  │
│  │  │ Ad Script│ │ Client   │ │ Tender  │ │  AI Search     │  │  │
│  │  │Generator │ │Onboarder │ │ Hunter  │ │  Optimizer     │  │  │
│  │  └──────────┘ └──────────┘ └─────────┘ └────────────────┘  │  │
│  │                                                              │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                              │                                     │
│  ┌──────────────────────────┴──────────────────────────────────┐  │
│  │                    Core Engine Layer                          │  │
│  │                                                              │  │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐   │  │
│  │  │   Model    │  │  Agentic   │  │    Multi-Agent       │   │  │
│  │  │   Router   │  │   Loop     │  │    Orchestrator      │   │  │
│  │  │ (H/S/O)   │  │ (engine)   │  │  (parallel tasks)    │   │  │
│  │  └────────────┘  └────────────┘  └──────────────────────┘   │  │
│  │                                                              │  │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────────────┐   │  │
│  │  │ Confidence │  │  Policy    │  │    Memory &          │   │  │
│  │  │  Routing   │  │  Engine    │  │    Context Store      │   │  │
│  │  │(act/ask/esc│  │(rules.md) │  │  (persistent KB)     │   │  │
│  │  └────────────┘  └────────────┘  └──────────────────────┘   │  │
│  └──────────────────────────┬──────────────────────────────────┘  │
│                              │                                     │
│  ┌──────────────────────────┴──────────────────────────────────┐  │
│  │                Channel Synthesis Layer                        │  │
│  │                                                              │  │
│  │  ┌───────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌───────────┐  │  │
│  │  │ Gmail │ │Outlook │ │iMessage│ │WhatsApp│ │  Asana    │  │  │
│  │  └───┬───┘ └───┬────┘ └───┬────┘ └───┬────┘ └─────┬─────┘  │  │
│  │      │         │          │           │            │         │  │
│  │  ┌───┴───┐ ┌───┴────┐ ┌──┴─────┐ ┌───┴────┐ ┌────┴──────┐ │  │
│  │  │Calendly│ │ClickUp│ │Calendar│ │Reminders│ │  Stripe  │ │  │
│  │  └───────┘ └────────┘ └────────┘ └────────┘ └──────────┘  │  │
│  │                                                              │  │
│  │  Classify → Deduplicate → Route → Act/Ask/Escalate          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│  ┌──────────────────────────┴──────────────────────────────────┐  │
│  │                     Data Layer                                │  │
│  │                                                              │  │
│  │  Supabase Postgres (multi-tenant, RLS, realtime)             │  │
│  │  organizations │ profiles │ tasks │ contacts │ memory        │  │
│  │  activity_feed │ agent_sessions │ invoices │ leads │ proposals│  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                     │
│  ┌──────────────────────────┴──────────────────────────────────┐  │
│  │                     Interface Layer                           │  │
│  │                                                              │  │
│  │  Dashboard (Next.js)  │  WhatsApp Bot  │  Voice Interface    │  │
│  │  Kanban Board         │  Email Bot     │  API / Webhooks     │  │
│  │  Audit Trail          │  SMS Bot       │  Slack/Teams Bot    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 Multi-Tenant Architecture

Every deployment is scoped by `org_id`. AWU is the first organization. Each of Andy's clients can optionally be a sub-organization with their own policies, contacts, and agent configurations.

```
BitBit Platform
├── Org: All Webbed Up (AWU)
│   ├── Agents: Lead Swarm, Invoice Flow, Channel Triage, ...
│   ├── Contacts: Andy, Tor, Sezer, Harun, Ryan, ...
│   ├── Policies: AWU business rules, pricing, escalation rules
│   ├── Channels: Gmail, Outlook, WhatsApp, Asana, Calendly
│   └── Sub-clients:
│       ├── White House RE (Sezer Yunus)
│       ├── Event Hero (Harun)
│       ├── BEPOP Marketplace (Dima, Rawya)
│       ├── SexPay (adult content platform)
│       ├── Ozy Homes (Ghazi)
│       ├── Salken Engineering / Club Team Manager
│       └── ... future AWU clients
└── Org: Torkay (Tor's own agency) — dogfooding instance
```

### 3.3 Model Routing Strategy

```
User Message → Complexity Analysis → Model Selection

┌─────────────┬──────────────────┬───────────┬─────────────────────────┐
│ Tier        │ Model            │ Cost      │ Use Case                │
├─────────────┼──────────────────┼───────────┼─────────────────────────┤
│ Haiku       │ claude-haiku-4.5 │ Cheapest  │ Classification, routing │
│             │                  │           │ triage, yes/no, tagging │
├─────────────┼──────────────────┼───────────┼─────────────────────────┤
│ Sonnet      │ claude-sonnet-4.6│ Mid       │ Standard CRUD, drafting │
│             │                  │           │ search, data extraction │
├─────────────┼──────────────────┼───────────┼─────────────────────────┤
│ Opus        │ claude-opus-4.6  │ Highest   │ Strategy, proposals,    │
│             │                  │           │ complex reasoning       │
├─────────────┼──────────────────┼───────────┼─────────────────────────┤
│ Gemini      │ gemini-2.5-flash │ Cheapest  │ Background polling,     │
│ (auxiliary) │                  │           │ simple lookups, sentry  │
└─────────────┴──────────────────┴───────────┴─────────────────────────┘
```

Cost optimization: Haiku handles 70% of agent calls (triage, classification), Sonnet handles 25% (drafting, CRUD), Opus handles 5% (strategy, complex proposals). Gemini handles all background monitoring.

---

## 4. Agent Specifications

### 4.1 Lead Swarm

**Priority**: P0 — Deploy first
**Problem**: AWU is losing leads. Inquiries come in across multiple channels with no unified capture, qualification, or follow-up system.

**Capabilities**:
- Monitor all inbound channels (Gmail, Outlook, WhatsApp, website forms, Facebook Messenger, Instagram DMs)
- Classify inbound as: lead, existing client, spam, personal
- Qualify leads against criteria: budget range, service match, location, timeline
- Auto-respond with acknowledgment within 2 minutes of inquiry
- Book Calendly slots for qualified leads
- Create Asana task for every qualified lead with full context
- Score leads (hot/warm/cold) based on engagement signals
- Trigger follow-up sequences for warm leads that don't book
- Escalate high-value leads (>$5k project) directly to Andy via WhatsApp
- Daily lead pipeline summary to Andy

**Integrations**: Gmail, Outlook, WhatsApp Business API, Calendly, Asana, Facebook Lead Ads, website contact forms

**Policy Rules**:
- Never auto-reject a lead — escalate uncertain ones
- Response time SLA: acknowledgment within 2 minutes, qualification within 1 hour
- Always ask budget range before booking a call
- Tag lead source for attribution tracking
- Don't reveal internal pricing until qualification complete

**Success Metrics**:
- Lead response time < 2 minutes (currently: hours to days)
- Lead-to-booking conversion rate
- Zero leads lost/unresponded
- Pipeline value visibility

---

### 4.2 Invoice Flow

**Priority**: P0 — Deploy first
**Problem**: Invoicing is manual, inconsistent, and often delayed. Payment follow-up doesn't happen.

**Capabilities**:
- Auto-generate invoices from completed Asana tasks or manual triggers
- PDF generation with branded templates (AWU branding, Torkay branding, or white-label)
- Configurable payment terms (7-day, 14-day, 30-day)
- Multiple bank account support (different entities)
- Send invoice via email with PDF attachment
- Track payment status (sent, viewed, overdue, paid)
- Automated payment reminders: Day 1 (friendly), Day 7 (firm), Day 14 (final notice)
- Stripe integration for online payment links
- Xero/MYOB sync for accounting
- Monthly revenue reporting and forecasting
- Duplicate detection — never send the same invoice twice
- Support for deposits, milestone payments, and recurring invoices

**Integrations**: Gmail (send), Stripe (payment links), Xero/MYOB (accounting), Asana (task completion triggers), Supabase (invoice records)

**Policy Rules**:
- Never send without human confirmation (first deployment phase)
- Graduate to auto-send for recurring clients after trust is established
- Always include payment terms and bank details
- Flag overdue invoices daily
- Escalate invoices >30 days overdue

**Success Metrics**:
- Days-to-invoice after project completion (target: same day)
- Payment collection rate
- Average days-to-payment
- Outstanding receivables visibility

---

### 4.3 Channel Triage

**Priority**: P1 — Deploy second wave
**Problem**: Andy and Tor both juggle 5+ communication channels. Context is fragmented. Important messages get buried.

**Capabilities**:
- Pull messages from all connected channels on a configurable schedule
- Classify every message: actionable / informational / spam / personal
- Priority scoring: critical / high / medium / low
- Cross-channel deduplication (same topic in email + WhatsApp = one item)
- Entity resolution — link messages to known contacts automatically
- Auto-create tasks for actionable items
- Unified inbox view in the BitBit dashboard
- Daily digest: "Here's what needs your attention today"
- Weekly summary: communication patterns, response times, unresolved threads
- Thread tracking — know when a conversation is waiting on you vs. waiting on them

**Integrations**: Gmail, Outlook, iMessage, WhatsApp, Asana notifications, ClickUp, Slack (future), Facebook Messenger, Instagram DMs

**Policy Rules**:
- Never auto-respond to client messages without approval (initially)
- Always flag messages from new/unknown contacts
- Priority override: anything from an active paying client = minimum "high"
- Legal/complaint keywords trigger immediate escalation

**Success Metrics**:
- Messages triaged per day
- Average time-to-first-response
- Missed/dropped messages (target: zero)
- User time saved on email/message processing

---

### 4.4 Proposal Bot

**Priority**: P1 — Deploy second wave
**Problem**: Every new AWU client needs a scope document, pricing tiers, and a professional quote. These take hours to write and often delay deal closure.

**Capabilities**:
- Generate scope documents from brief inputs (client name, project type, requirements notes, Cluely call transcript)
- Configurable pricing templates with tier structures (Basic / Standard / Premium)
- Auto-calculate pricing based on component library (website: $X, SEO: $Y, CRM: $Z)
- Generate professional PDF proposals with AWU branding
- Include case studies from completed projects automatically
- Track proposal status (draft, sent, viewed, accepted, declined)
- Follow-up sequences for sent proposals
- Version control — track changes between proposal iterations
- NDA generation and tracking
- Contract generation from accepted proposals
- Competitive analysis integration — position against market rates

**Integrations**: Google Drive (templates), Gmail (send), Cluely (call transcripts for context), Asana (project creation on acceptance), Stripe (deposit collection)

**Data Sources**:
- AWU historical projects and pricing
- Cluely call transcripts (auto-extract requirements from meetings)
- Competitor pricing research
- Component cost library (maintained by Tor)

**Policy Rules**:
- Always include payment terms and IP clauses
- Never quote below minimum rates without Andy's approval
- Include "Recommended" tier to anchor pricing
- Add upsell recommendations with ROI justification

**Success Metrics**:
- Proposal creation time (target: < 30 minutes from brief to PDF)
- Proposal-to-close conversion rate
- Average deal size
- Time from inquiry to proposal sent

---

### 4.5 Client Comms Agent

**Priority**: P1 — Deploy second wave
**Problem**: Client communication is inconsistent. Response times vary. Tone varies. Important updates get delayed.

**Capabilities**:
- Draft email/message replies in the correct voice (Andy's voice, AWU brand voice, or client-specific tone)
- Maintain per-client communication profiles (preferred channel, tone, frequency, timezone)
- Automated status updates to clients (weekly project updates, milestone completions)
- Meeting summary distribution after Cluely-recorded calls
- Smart CC/BCC management — know who needs to be in the loop
- Template library for common communications (onboarding welcome, milestone update, project complete, payment reminder)
- Sentiment analysis on incoming client messages — flag frustration early
- Contact enrichment — auto-fill LinkedIn profiles, company info, timezone

**Voice Profiles**:
```
Andy's Voice:
- Casual but professional
- Direct, no fluff
- "Hey [name]," / "Cheers, Andy"
- Uses upsell language naturally

AWU Brand Voice:
- Professional, confident
- Solution-focused
- Technical credibility without jargon
- "The All Webbed Up team" / "Regards, All Webbed Up"

Tor's Voice (for Torkay clients):
- Casual, competent
- Tech-savvy but approachable
- "Hey [name]," / "Cheers, Tor"
```

**Integrations**: Gmail, Outlook, WhatsApp, iMessage, contact CRM, Cluely (call summaries)

**Policy Rules**:
- Always route through approval for first contact with new clients
- Graduate to auto-send for routine updates after trust is established
- Never discuss pricing without referencing approved rate card
- Always CC Andy on client-facing emails (configurable per client)

---

### 4.6 Ad Script Generator

**Priority**: P2 — Deploy after core agents stable
**Problem**: AWU needs 30+ video scripts per month for social media ads. Andy can't find consistent editors or scriptwriters. Current output is zero.

**Capabilities**:
- Ingest offer packages (service descriptions, pricing, USPs)
- Ingest competitor ad research (Facebook Ad Library, TikTok Creative Center, Google Ads Transparency)
- Generate video scripts with hook variations (curiosity, problem-agitation, social proof, scarcity)
- Output in format: Hook (3 sec) → Problem (5 sec) → Solution (10 sec) → CTA (5 sec)
- A/B variations — generate 3-5 hook variants per core script
- Adapt scripts for platform (Instagram Reels 15s, TikTok 30s, YouTube Shorts 60s, Facebook Feed 15-30s)
- Storyboard generation with shot descriptions
- Integrate with AI video tools (Remotion, HeyGen, Synthesia) for automated assembly
- Performance feedback loop — track which scripts convert, learn patterns
- Seasonal/trending topic integration

**Offer Packages (AWU current)**:
- Local SEO ($X/month)
- Google Ads management ($X/month)
- Website builds (tiered)
- Meta CAPI setup
- AI search optimization ($2k/month)
- Citations & directory listings
- Full digital transformation packages

**Integrations**: Facebook Ad Library API, Google Ads, competitor research tools, Remotion (video assembly), social media scheduling tools

**Policy Rules**:
- All scripts reviewed by Andy before filming
- Never make claims that can't be backed up
- Include compliance disclaimers where needed
- Maintain brand voice consistency across all scripts

---

### 4.7 Client Onboarding Agent

**Priority**: P2
**Problem**: Every new AWU client requires the same onboarding steps. These are currently manual and inconsistent.

**Capabilities**:
- Trigger on deal acceptance (from Proposal Bot or manual)
- Auto-create Asana project from template (project type specific)
- Send welcome email package (intro, timeline, what we need from you)
- Request access credentials (hosting, DNS, CMS, analytics, social accounts)
- Set up Google Search Console and Analytics access
- Create client folder structure in Google Drive
- Schedule kickoff call via Calendly
- Set up Slack/WhatsApp channel for client communication
- Configure domain monitoring (uptime, SSL, DNS)
- Generate and send NDA/contract if not already signed
- Track onboarding completion checklist

**Templates by Project Type**:
- Website Build: hosting, DNS, content, branding assets, competitor list
- SEO Campaign: GSC access, existing analytics, keyword targets, competitor URLs
- Ad Campaign: Meta Business Manager access, CAPI token, creative assets, budget
- AI/Automation: API credentials, data sources, business rules documentation

**Integrations**: Asana, Google Drive, Calendly, Gmail, GSC API, Google Analytics API

---

### 4.8 AI Search Optimizer

**Priority**: P2 — Productizable service
**Problem**: Businesses don't rank on AI search engines (ChatGPT, Gemini, Perplexity, Claude). This is an emerging, low-competition market.

**Capabilities**:
- Audit client's visibility on AI chat engines (ChatGPT, Gemini, Perplexity, Claude)
- Generate AI-optimized content (structured data, Q&A format, entity markup)
- Monitor AI search rankings over time (track mentions and recommendations)
- Generate reports showing AI search visibility vs. competitors
- Recommend content strategies specifically for AI discovery
- Create and maintain knowledge base entries that AI models reference
- Schema markup optimization for AI consumption
- Citation building specifically for AI training data sources

**Market Opportunity** (from Feb 12 Cluely call):
- Low competition — most SEO agencies haven't caught on
- High perceived value — $2k/month service
- First-mover advantage — no established Google Search Console data for AI queries
- Australian market particularly underserved

**Integrations**: Custom AI query testing tool, GSC, Google Analytics, content CMS

---

### 4.9 Tender Hunter

**Priority**: P3 — Longer-term play
**Problem**: Government and enterprise tenders represent significant revenue but require dedicated discovery, compliance checking, and response writing.

**Capabilities**:
- Monitor government tender portals (AusTender, QLD QTenders, NSW eTendering)
- Filter tenders matching AWU capabilities (web development, digital marketing, IT services)
- Auto-extract requirements and compliance criteria
- Generate tender response drafts
- Compile required documentation (ABN, insurance, case studies, references)
- Track submission deadlines and status
- Score tender fit (effort vs. contract value)
- Build tender response template library

**Integrations**: Government procurement portals (web scraping), Google Drive (document assembly), Gmail (submissions)

---

### 4.10 Sentry (Background Monitor)

**Priority**: P0 — Core infrastructure
**Problem**: Agents need to watch for events without burning expensive API calls.

**Capabilities**:
- Configurable watches on any channel or data source
- Polling at configurable intervals (1 min to 24 hours)
- Uses Gemini Flash for cheap background monitoring
- Event types: email received, message received, task completed, payment received, deadline approaching
- Notification routing: WhatsApp, iMessage, email, push notification, dashboard alert
- Watch composition — combine multiple conditions (email from X AND about Y)
- Escalation chains — if not acknowledged in N minutes, escalate to next person
- Historical alert log for audit

**Watch Examples for AWU**:
```
watch: "New lead from website contact form" → qualify + respond
watch: "Client replied to proposal" → notify Andy immediately
watch: "Invoice overdue > 7 days" → trigger reminder sequence
watch: "Negative sentiment in client email" → escalate to Andy
watch: "Competitor launched new service page" → alert + analyze
watch: "Google review received" → notify + draft response
```

**Integrations**: Gmail, Outlook, WhatsApp, Asana webhooks, Stripe webhooks, Google Alerts

---

## 5. Data Model Extensions

Building on the existing Supabase schema, the following tables support the full agent suite:

### 5.1 New Tables

```sql
-- Lead management
leads (
    id, org_id, source_channel, source_detail,
    contact_id, status [new|qualified|booked|converted|lost],
    score [hot|warm|cold], budget_range, service_interest,
    qualified_at, converted_at, notes, metadata
)

-- Invoice management
invoices (
    id, org_id, invoice_number, client_contact_id,
    status [draft|sent|viewed|overdue|paid|cancelled],
    items jsonb, subtotal, tax, total, currency,
    issued_date, due_date, paid_date,
    payment_method, stripe_payment_link,
    pdf_url, sent_via, reminder_count
)

-- Proposal management
proposals (
    id, org_id, client_contact_id, title,
    status [draft|sent|viewed|accepted|declined|expired],
    tiers jsonb, selected_tier,
    pdf_url, sent_at, viewed_at, responded_at,
    follow_up_count, notes, version
)

-- Agent configurations
agent_configs (
    id, org_id, agent_type, name, description,
    enabled boolean, policy_rules jsonb,
    channel_access text[], model_tier_override,
    confidence_thresholds jsonb,
    notification_config jsonb,
    schedule jsonb
)

-- Agent execution logs (extends activity_feed)
agent_runs (
    id, org_id, agent_config_id, trigger_type,
    input_summary, output_summary,
    actions_taken jsonb, tools_called jsonb,
    model_used, tokens_in, tokens_out,
    confidence_score, routing_decision [act|ask|escalate],
    duration_ms, error text,
    approved_by uuid, approved_at
)

-- Sentry watches
watches (
    id, org_id, agent_config_id,
    watch_type, description,
    channel text, conditions jsonb,
    interval_seconds, last_checked_at,
    status [active|paused|triggered|expired],
    notification_targets jsonb
)

-- Communication templates
templates (
    id, org_id, name, category,
    subject_template, body_template,
    voice_profile text, channel text,
    variables jsonb, usage_count
)

-- Voice profiles
voice_profiles (
    id, org_id, name, description,
    tone text, formality text,
    greeting_patterns text[],
    sign_off_patterns text[],
    emoji_usage text,
    example_messages jsonb,
    do_patterns text[],
    dont_patterns text[]
)

-- Offer packages (for ad scripts and proposals)
offer_packages (
    id, org_id, name, description,
    service_type, price_range,
    inclusions text[], exclusions text[],
    usp text[], target_audience text,
    status [active|draft|archived]
)
```

### 5.2 Existing Tables (Enhanced)

```sql
-- contacts: Add fields
+ lead_score text
+ lifetime_value decimal
+ last_interaction_at timestamptz
+ preferred_channel text
+ voice_profile_id uuid
+ tags text[]

-- tasks: Add fields
+ source_agent text
+ source_lead_id uuid
+ source_invoice_id uuid
+ source_proposal_id uuid
+ automation_eligible boolean
```

---

## 6. Channel Integrations

### 6.1 Integration Matrix

| Channel | Direction | Priority | Implementation |
|---------|-----------|----------|----------------|
| Gmail (personal) | Inbound + Outbound | P0 | Gmail MCP (existing) |
| Outlook (AWU) | Inbound + Outbound | P0 | Microsoft Graph API |
| WhatsApp | Inbound + Outbound | P0 | WhatsApp Business API / MCP |
| iMessage | Inbound only | P1 | macOS chat.db adapter |
| Asana | Bidirectional | P0 | Asana API (existing MCP) |
| Calendly | Inbound + Booking | P0 | Calendly API / webhooks |
| ClickUp | Inbound | P1 | ClickUp API |
| Stripe | Inbound (webhooks) | P1 | Stripe webhooks |
| Facebook Messenger | Inbound + Outbound | P2 | Meta Messenger API |
| Instagram DMs | Inbound + Outbound | P2 | Instagram Graph API |
| Google Search Console | Read | P1 | GSC API |
| Google Analytics | Read | P1 | GA4 API |
| Cluely | Read | P1 | Cluely API (reverse-engineered) |
| Slack | Bidirectional | P2 | Slack API |
| Xero/MYOB | Bidirectional | P2 | Accounting API |
| WordPress | Bidirectional | P1 | WP REST API |

### 6.2 Channel Synthesis Pipeline

```
All Channels → Pull (scheduled/webhook) → Normalize to ChannelMessage
    → Classify (actionable? priority?)
    → Deduplicate (cross-channel)
    → Entity Resolve (who is this?)
    → Route to Agent (which agent owns this?)
    → Act / Ask / Escalate
    → Log to Activity Feed
    → Update Dashboard (realtime)
```

---

## 7. User Interfaces

### 7.1 BitBit Dashboard (Web)

**Primary interface** for configuration, monitoring, and oversight.

**Pages**:
- **Command Center**: Real-time agent activity feed, active leads, pending approvals, today's priorities
- **Kanban Board**: Drag-and-drop task management across custom columns
- **Inbox**: Unified message feed across all channels, filterable by agent/client/priority
- **Leads Pipeline**: Kanban-style lead tracking (New → Qualified → Booked → Won/Lost)
- **Invoices**: Invoice list with status tracking, overdue alerts, revenue charts
- **Proposals**: Proposal pipeline with stage tracking
- **Contacts**: CRM with full communication history, entity resolution
- **Agents**: Configure, enable/disable, and monitor each agent
- **Audit Trail**: Full transparency on every agent decision
- **Analytics**: Token usage, cost tracking, performance metrics, ROI dashboards
- **Settings**: Org config, channel connections, voice profiles, policies

### 7.2 WhatsApp / Voice Interface

**Andy's primary interface** — he needs to operate from his phone.

- Send a voice note or text → BitBit processes it
- "Invoice Sezer for the White House RE work" → Invoice Flow generates and sends
- "Any new leads today?" → Lead Swarm summarizes pipeline
- "Draft a reply to Harun about the scope doc" → Client Comms drafts in Andy's voice
- "What's overdue?" → Channel Triage lists unresolved items

### 7.3 Approval Flow

For actions requiring human approval (confidence 50-80%):

```
Agent wants to act → Creates approval request
    → Sends to Andy/Tor via WhatsApp: "I want to [action]. Approve? Y/N"
    → Andy replies "Y" → Agent executes
    → Andy replies "N" or "N, instead do X" → Agent adjusts
    → No response in 30 min → Reminder
    → No response in 2 hours → Escalate
```

---

## 8. Policy Engine

Every agent operates within a policy framework. Policies are defined in markdown files (like `CLIENT-PACK.md`) and loaded at runtime.

### 8.1 Policy Hierarchy

```
Global Policies (BitBit platform rules)
    └── Organization Policies (AWU business rules)
        └── Agent Policies (per-agent rules)
            └── Client Policies (per-client overrides)
```

### 8.2 AWU Policy Pack (Initial)

```markdown
# AWU Agency Policies

## Pricing
- Minimum project rate: $500
- Hourly rate: $90-150/hr depending on complexity
- Always include GST in quotes for Australian clients
- Payment terms: 20% deposit, balance on completion (default)
- Never discount more than 15% without Andy's approval

## Communication
- Response SLA: 2 hours during business hours (AEST)
- Always CC Andy on first contact with new clients
- Use AWU email (andy@allwebbedup.com.au) for client-facing comms
- Use Tor's AWU email (tor@allwebbedup.com.au) for technical comms
- Never share internal pricing/cost structures with clients

## Client Handling
- Andy is the face — all relationship management through him
- Tor handles technical execution
- Never contact AWU clients directly without Andy's knowledge
- Escalate any client complaint immediately
- If a client asks about timelines, check with Tor before committing

## Confidentiality
- Client work belongs to AWU
- Don't share one client's data/strategy with another
- NDA required for projects >$5k
- Contractor agreement terms apply (Jan 2026)

## Quality
- All deliverables reviewed before client handoff
- Screenshots/recordings of completed work for verification
- Test in staging before going live
- Backup before making changes to live sites
```

---

## 9. Deployment & Infrastructure

### 9.1 Tech Stack

| Component | Technology | Reason |
|-----------|------------|--------|
| Frontend | Next.js 16, React 19 | Already built, SSR, App Router |
| Database | Supabase (Postgres) | Multi-tenant, RLS, realtime, auth |
| AI Models | Claude (Opus/Sonnet/Haiku), Gemini Flash | Tiered routing for cost optimization |
| Hosting | Vercel | Zero-config Next.js deployment |
| File Storage | Supabase Storage / R2 | PDFs, attachments, media |
| Background Jobs | Supabase Edge Functions / Vercel Cron | Scheduled agent runs, sentry polling |
| Monitoring | Supabase Dashboard + custom analytics | Token usage, agent performance |
| Domain | bitbit.com.au (via Andy) | Pointed to Vercel |

### 9.2 Cost Structure (Estimated Monthly)

| Item | Cost | Notes |
|------|------|-------|
| Supabase Pro | $25/mo | 8GB DB, 250GB bandwidth, realtime |
| Vercel Pro | $20/mo | Edge functions, cron, analytics |
| Claude API (Haiku heavy) | ~$50-150/mo | Depends on volume, Haiku-optimized |
| Gemini API (sentry) | ~$5-10/mo | Flash tier, background only |
| Domain | ~$20/yr | Already purchased |
| **Total** | **~$100-200/mo** | Scales with usage |

### 9.3 Deployment Phases

**Phase 0: Foundation (Week 1-2)**
- [ ] Set up AWU organization in Supabase
- [ ] Deploy BitBit personal-assistant to Vercel
- [ ] Connect real Gmail adapter (replace mock)
- [ ] Connect real Outlook adapter (tor@allwebbedup.com.au)
- [ ] Import AWU contacts into CRM
- [ ] Load AWU policy pack
- [ ] Set up Andy's user account

**Phase 1: First Agents (Week 3-4)**
- [ ] Deploy Lead Swarm agent
- [ ] Deploy Invoice Flow agent
- [ ] Connect Calendly integration
- [ ] Set up WhatsApp bot interface for Andy
- [ ] Configure Sentry watches for lead monitoring
- [ ] Test with 1-2 active AWU clients

**Phase 2: Communication Layer (Week 5-6)**
- [ ] Deploy Channel Triage agent
- [ ] Deploy Client Comms agent
- [ ] Connect Asana bidirectional sync
- [ ] Build voice profile system
- [ ] Daily digest notifications
- [ ] Expand to all active AWU clients

**Phase 3: Revenue Agents (Week 7-8)**
- [ ] Deploy Proposal Bot
- [ ] Deploy Client Onboarding agent
- [ ] Connect Cluely for call transcript ingestion
- [ ] Build proposal templates from AWU history
- [ ] Contract/NDA generation

**Phase 4: Growth Agents (Week 9-12)**
- [ ] Deploy Ad Script Generator
- [ ] Deploy AI Search Optimizer
- [ ] Deploy Tender Hunter
- [ ] Build analytics and ROI dashboards
- [ ] Prepare for beta program with external agencies

---

## 10. Success Metrics

### 10.1 AWU Operational Metrics

| Metric | Current | Target (Month 3) |
|--------|---------|-------------------|
| Lead response time | Hours to days | < 2 minutes |
| Leads lost/month | Unknown (several) | Zero |
| Invoice turnaround | Days after completion | Same day |
| Proposal creation time | 2-4 hours | < 30 minutes |
| Channels monitored | Manual, sporadic | All, continuous |
| Client update frequency | Ad-hoc | Weekly automated |
| Andy's ops time/week | ~25 hours | < 5 hours |

### 10.2 Product Metrics (for market readiness)

| Metric | Target |
|--------|--------|
| Agent uptime | 99.5% |
| False escalation rate | < 10% |
| Correct autonomous actions | > 90% |
| User satisfaction (Andy) | "I can't go back to doing it manually" |
| Cost per agent action | < $0.05 average |
| Time to deploy new agent | < 1 day |
| Time to onboard new org | < 1 hour |

### 10.3 Business Metrics

| Metric | Target (Month 6) |
|--------|-------------------|
| AWU revenue increase | +30% (from lead capture improvement) |
| AWU operational cost decrease | -50% (Andy's time reclaimed) |
| Beta agencies onboarded | 5-10 |
| MRR from beta | $2-5k |
| Case studies documented | 3+ |

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Agent sends wrong email to client | High — damages AWU reputation | Confidence routing + approval flow for all client-facing actions initially |
| API costs spiral | Medium — eats margin | Model routing (Haiku 70%), Gemini for polling, token budgets per agent |
| Channel API changes/rate limits | Medium — breaks integrations | Adapter pattern isolates changes, fallback to polling |
| Data privacy breach | Critical — legal liability | RLS on all tables, no cross-org data access, encryption at rest |
| Andy loses trust after false positive | High — kills partnership | Conservative confidence thresholds initially, graduate trust over time |
| Competitor builds similar product | Medium — market share | Speed + real-world battle testing = moat. Working product > vaporware |
| Scope creep during AWU deployment | Medium — delays market launch | This PRD defines scope. Changes go through versioned PRD updates |

---

## 12. Open Questions for Sunday

1. **Agent priority order** — Is Lead Swarm + Invoice Flow correct as P0, or does Andy have a different burning need?
2. **WhatsApp Business API** — Does AWU have a WhatsApp Business account, or do we need to set one up?
3. **Asana vs ClickUp** — Andy uses both. Which is the source of truth for project management?
4. **Client access** — Which AWU clients should agents operate on first? White House RE is done. Event Hero? BEPOP?
5. **Andy's phone workflow** — How does he want to interact? Voice notes? WhatsApp commands? Dashboard only?
6. **Branding** — BitBit branding, AWU-branded, or white-label for clients?
7. **Revenue model** — When we go to market: per-agent pricing? Per-seat? Usage-based? Tiered SaaS?
8. **IP ownership** — 50/50 on the platform. What about AWU-specific configurations and client data?
9. **ABN / Business entity** — Do we register a new entity for BitBit, or operate under existing (Torkay / AWU)?
10. **Budget for Phase 0-1** — Infrastructure costs (~$100-200/mo). Split 50/50 or covered by AWU as business expense?

---

## 13. Appendix

### A. Existing Codebase Inventory

| Component | Location | Status | Lines |
|-----------|----------|--------|-------|
| BitBit demo-1 (e-commerce MVP) | `~/bitbit/demo-1/` | Shipped v1.0 | ~9,300 |
| BitBit personal-assistant (platform) | `~/bitbit/personal-assistant/` | Active dev | Growing |
| Agent repo (Tor's personal system) | `~/Agent/.agent/` | Production (daily use) | N/A |
| Skills library | `~/.claude/skills/` | 60+ installed | N/A |
| Sentry daemon | `~/Agent/.agent/tools/sentry.py` | Working | N/A |
| Gemini agent | `~/Agent/.agent/tools/gemini_agent.py` | Working | N/A |
| Contact profiles | `~/Agent/.agent/contacts/` | 4 profiles | N/A |

### B. AWU Active Clients (Deployment Targets)

| Client | Project | Value | Status |
|--------|---------|-------|--------|
| White House RE (Sezer) | Website changes | $200 | Complete, invoiced |
| Event Hero (Harun) | Marketplace MVP | $10-12k | Scoping |
| BEPOP (Dima, Rawya) | Marketplace app | $7-15k | Scope sent |
| SexPay | Adult content platform | $7k | Quote pending |
| Ozy Homes (Ghazi) | Ad materials | TBD | Active |
| Salken/Club Team Manager | Mobile app | TBD | Month 5, frustrated |

### C. Cluely Call Log (Andy Sessions)

| Date | Session | Key Outcomes |
|------|---------|-------------|
| Feb 16 | Sales Quote, Facebook Token Request | SexPay $7k, CAPI token needed, ABN required |
| Feb 12 | Uncertain Night Shift Availability | AI search optimization $2k/month concept, ad strategy, micro-niches |
| Feb 11 | Fican Vault RE WordPress Sync | White House RE VaultRE plugin debugging, lease sync fixed |
| Feb 11 | Random Banter About Dogs | Cloudways migration, email setup, training protocols |
| Feb 5 | Case Study Prep and Scope Review | Event Hero MVP $10-12k, feature prioritization, payment schedule |
| Feb 1 | Casual Chat About Technical Fix | Ad strategy, 30 videos/month need, Remotion, competitor research |
| Jan 14 | CRM | Early CRM discussion |

---

*This is a living document. Version updates tracked in git.*

**Next Review**: Sunday Feb 23, 2026 — Tor & Andy
