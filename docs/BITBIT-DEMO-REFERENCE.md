# BITBIT DEMO REFERENCE GUIDE
## Andy's Investor Meeting — Quick-Glance Cheat Sheet
### Last updated: 2 April 2026

---

## 1. ELEVATOR PITCH

BitBit is a modular AI operations platform that gives small businesses an
always-on, industry-specific personal assistant. Businesses text it on
WhatsApp, send voice notes, or use the dashboard — and BitBit autonomously
handles leads, invoices, client comms, proposals, and more through
specialized AI agents that snap together like lego bricks. It replaces
$200+/month in SaaS tools (HubSpot, Front, Asana, etc.) with a single
intelligent system that learns the business and gets smarter over time.

> "Send a voice note. The problem disappears."

---

## 2. TARGET INDUSTRIES & AGENT BUNDLES

### Tier 1 — Launch Verticals

MARKETING AGENCIES (Primary — AWU is the testbed)
  Use cases: Lead intake, client comms, invoicing, proposals, content scripts
  Agent bundle: Lead Swarm + Invoice Flow + Client Comms + Proposal Bot +
                Ad Script Gen + Channel Triage + Sentry
  Why: Andy runs AWU on it. "I need to do it in order to sell it."

TRADES / ELECTRICIANS (Andy's strongest conviction)
  Use cases: Voice-note invoicing from job sites, lead response, quoting
  Agent bundle: Lead Swarm + Invoice Flow + Client Comms + Sentry
  Why: Voice-first. Tradies text from job sites. AU electricians = 39% of
       trade searches. Massive market, zero AI adoption.
  Key demo: Tradie sends WhatsApp voice note "Just finished the bathroom
            at John's, invoice him for $850" → BitBit creates & sends invoice.

ENTERPRISE / GOVERNMENT (Highest revenue ceiling)
  Use cases: Tender hunting, compliance checking, response drafting
  Agent bundle: Tender Hunter + Proposal Bot + Client Comms + Sentry
  Price point: $1-2k/month (vs $2-30k for tender consultants)
  Why: "I know people that will pay for that if it's working." — Andy

### Tier 2 — Expansion Verticals

DENTISTS / HEALTHCARE
  Use cases: Patient comms, appointment management, review responses
  Agent bundle: Client Comms + Lead Swarm + Sentry

PROPERTY / REAL ESTATE
  Use cases: Listing management, client follow-ups, market reports
  Agent bundle: Client Comms + Lead Swarm + Proposal Bot + Sentry

LEGAL / ACCOUNTING
  Use cases: Client intake, document management, billing
  Agent bundle: Lead Swarm + Invoice Flow + Client Comms + Proposal Bot

CAR DEALERS, BUILDERS, CONTENT CREATORS
  Industry packs already configured for: Agency, Tradie, Content Creator
  Each pack customizes: AI persona, KPI widgets, feature defaults, terminology

---

## 3. AGENT CATALOG (11 Agents)

All agents use the 3-tier model router for cost-optimal inference.
Confidence routing: >=85% auto-act / 55-85% ask human / <55% escalate

#  AGENT              MODEL TIER         EST. COST   STATUS
-- ----------------   ----------------   ---------   ------
1  Channel Triage     Haiku 70%/Son 30%  ~$20/mo     BUILT
   Classifies incoming messages, routes to correct agent/human
   Triggers every 5 min via cron

2  Lead Swarm         Haiku + Sonnet     ~$50/mo     BUILT
   Discovers leads, scores them, sends auto-acknowledgments
   Sub-2-minute response target for hot leads

3  Invoice Flow       Haiku + Sonnet     ~$10/mo     BUILT
   NL creation ("invoice Sezer for the website"), PDF gen, email send
   Duplicate detection, lifecycle tracking, Stripe payment links

4  Client Comms (PA)  Sonnet             ~$20-40/mo  BUILT
   Drafts client responses with voice matching & relationship context
   12 tools, agentic loop, SSE streaming

5  Sentry Monitor     Haiku (cheap)      ~$10/mo     BUILT
   Background monitoring, alert escalation, watch management
   Runs every 5 min

6  Proposal Bot       Opus + Sonnet      ~$30-40/mo  BUILT
   Generates tiered proposals from briefs, PDF output
   Status tracking: draft→sent→viewed→accepted→declined

7  Ad Script Gen      Opus + Sonnet      ~$30/mo     BUILT
   Video/social ad scripts, hook variations, platform-adapted
   Supports Reels 15s, TikTok 30s, Shorts 60s, Feed 15-30s

8  AI Search Optim.   Sonnet + Haiku     ~$20/mo     BUILT
   Audits AI visibility (ChatGPT, Gemini, Perplexity, Claude)
   First-mover advantage — low competition, $2k/mo service opp

9  Tender Hunter      Opus + Son + Haiku ~$1-2k/mo   BUILT
   Scrapes AusTender + state portals, compliance checking, fit scoring
   Response draft generation. 99%+ margin vs tender consultants.

10 Client Onboarding  Sonnet + Haiku     ~$30-40/mo  BUILT
   Auto Asana project creation, welcome emails, credential requests
   Triggers on deal acceptance

11 Scheduler          System             included    BUILT
   Orchestrates all agent execution, manages task queue
   Runs every minute

TOTAL AGENT ROSTER: 11 autonomous agents, all code-complete with tests.

---

## 4. PRICING STRATEGY

### Subscription Tiers (Stripe-integrated, live)

TIER        PRICE       CHANNELS  LEADS   SEATS  KEY FEATURES
--------    ---------   --------  ------  -----  -------------------------
Free        $0          1         50      1      Basic sentry, limited chat
Starter     ~$199/mo    3         500     1      Core agents
Growth      ~$349/mo    10        unlim   5      Advanced agents + roles,
                                                 proposals, multi-user
Scale       ~$999+/mo   unlimited unlim   99     All agents, all roles,
                                                 enterprise features

### Per-Agent Add-Ons
- Base agents (Sentry, Triage, Comms): included in tier
- Lead Swarm: ~$50/mo add-on
- Invoice Flow: ~$10/mo add-on
- Proposal Bot: ~$30-40/mo add-on
- Tender Hunter: $1-2k/mo (enterprise pricing, custom)
- Ad Script Gen: ~$30/mo add-on
- AI Search Optimizer: ~$20/mo add-on

### Key Pricing Facts for Investors
- API cost per client: $4-59/mo depending on usage (LOW/MED/HIGH)
- At $200/mo revenue: 70-98% margin depending on usage
- Break-even: 1 client covers all infrastructure ($49/mo)
- Andy's founder deal: $200/mo (Growth equivalent at 43% discount)
- Each $10k AWU job = ~$2k BitBit funding via earnings split

### Retention Strategy (Andy's words)
"If we make them so reliant on our service because it does literally
everything... it's going to be so difficult for them to leave."
- 30-day free trial
- Unified inbox + Invoice Flow as free-tier hook
- 15-day check-in call to upsell
- Modular upsell: start cheap, prove value, add agents

### Revenue Projections
Month 1:   1 client (Andy)           = $200 MRR
Month 3:   3-5 beta clients          = $1,000-1,500 MRR
Month 6:   5-10 clients              = $2,500-5,000 MRR
Month 9:   10-20 clients (launch)    = $5,000-8,000 MRR
Month 12:  20+ clients (scale)       = $15,000+ MRR

---

## 5. KEY DEMO FLOWS (Show in This Order)

### Flow 1: "The WhatsApp Magic" (30 sec — OPEN WITH THIS)
Show: Voice note → "Hey Bit, invoice John for the bathroom reno, $850"
BitBit: Resolves entity, creates invoice, generates PDF, queues for approval
Impact: Jaw-drop moment. "Send a voice note, problem disappears."

### Flow 2: "The Dashboard" (60 sec)
Show: Log into app.bitbit.chat → Dashboard with KPI cards, Kanban board
Click through: Unified Inbox → Contacts with relationship scores →
               Leads pipeline → Approvals queue
Impact: Shows breadth. "This replaces HubSpot + Front + Asana."

### Flow 3: "The AI Chat" (30 sec)
Show: Chat with BitBit in the dashboard → Ask "What's overdue?"
BitBit responds with context-aware business intelligence
Impact: Shows the brain. It KNOWS the business.

### Flow 4: "Lead Response Speed" (30 sec)
Show: New lead email arrives → Lead Swarm classifies → Auto-acknowledgment
      drafted → Approval queued → Approved → Sent in under 2 minutes
Impact: "Speed is so important in business."

### Flow 5: "Industry Packs" (30 sec)
Show: Switch between Agency / Tradie / Content Creator packs
      Different KPIs, different terminology, different agent bundles
Impact: Shows scalability across verticals. Same platform, infinite niches.

### Flow 6: "Client Portal" (30 sec)
Show: Client-facing portal → Projects, Invoices, Files, Requests
      White-label, magic link login (no passwords for clients)
Impact: Shows enterprise readiness.

### Flow 7: "Revenue Intelligence" (30 sec)
Show: Cash flow forecasting, client scoring, collection accelerator
Impact: Shows this isn't just comms — it's a business brain.

### DEMO TIP: Always test before demos!
Andy learned this the hard way: "We went in there to use the document
editing and it wasn't working... I would assume you would have tested
it prior." — Mar 21 meeting about LegalSign demo failure.

---

## 6. SALES POSITIONING

### Key Talking Points

"LEGO BRICKS, NOT MONOLITH"
  "Anytime a certain client comes along that needs solution ABC but not DEF,
   we just apply ABC." Modular = lower entry price, higher expansion revenue.

"REPLACES 5+ SAAS PRODUCTS"
  HubSpot ($45/mo) + Front ($19/seat) + Lindy.ai ($49/mo) +
  Asana ($11/seat) + Clari ($$$) + Copilot ($29/mo) + Mem.ai ($15/mo)
  = $200+/seat/month in SaaS costs → replaced by one BitBit subscription

"I USE IT MYSELF"
  Andy runs All Webbed Up on BitBit. "I need to do it in order to sell it
  because people are going to be like show us and I'm going to say I
  fucking use it."

"VOICE-FIRST FOR TRADES"
  Electricians, plumbers, builders don't sit at computers. They send voice
  notes from job sites. BitBit is the only AI operations tool built for that.

"ENTERPRISE TENDER PLAY"
  Tender Hunter at $1-2k/mo vs $2-30k tender consultants = 99%+ margin.
  Government tender matching, compliance checking, response drafting.

"AI SEARCH — FIRST MOVER"
  New service: rank businesses on AI chat engines (ChatGPT, Gemini, Perplexity).
  Low competition. $2k/month pricing opportunity.

### Objection Handling

"How is this different from ChatGPT?"
→ ChatGPT doesn't know your business. BitBit has a semantic memory layer
  that learns your contacts, projects, rates, and communication style.
  It connects to 20 channels and takes real actions (sends invoices,
  responds to leads, files proposals).

"What about Lindy / other AI assistants?"
→ They're generic. BitBit has industry-specific agent bundles that snap
  in per vertical. And the confidence routing means it knows when to act
  vs. when to ask — most competitors either auto-do everything (dangerous)
  or require approval for everything (slow).

"Is it actually reliable?"
→ Confidence routing: >=85% auto-act, 55-85% ask first, <55% escalate.
  Circuit breaker, dead letter queue, cost guard, duplicate detection.
  719 tests across 51 files. Production-grade reliability.

"Why would I switch from my current tools?"
→ "If we make them so reliant on our service because it does literally
  everything... it's going to be so difficult for them to leave."
  Consolidation play — one system instead of six.

---

## 7. ANDY'S OWN QUOTES (Verbatim — Use for Credibility)

ON THE CORE VALUE:
"Hey remind me to do this or hey Bit prepare an email for this guy for a
quote or for an invoice... that'll be so fucking killer dude because speed
is so important in business." — Feb 19

ON PRICING CONFIDENCE:
"I know people that will pay for that if it's working." — Feb 19, re: Tender Hunter

ON PROOF OF PRODUCT:
"I need to do it in order to sell it because people are going to be like
show us and I'm going to say I fucking use it." — Feb 22

ON MODULARITY:
"Anytime a certain client comes along that needs solution ABC but not DEF
we just apply ABC." — Feb 19

ON RETENTION / MOAT:
"If we make them so reliant on our service because it does literally
everything... it's going to be so difficult for them to leave." — Feb 25

ON REVENUE URGENCY:
"Charge people for this shit bro because if it's costing you that much."
— Feb 22

ON CONVERSION:
"I guarantee you half of them are going to say yes. Of the half that say
yes a good percentage are going to want more shit." — Feb 25

ON PARTNERSHIP:
"The last thing I want happen is we've got fifty fifty of a company and
you're doing all the work or vice versa." — Feb 25

ON PIPELINE (Mar 21):
"I've probably had 20 leads come in the last week or two weeks... there's
like out of the 20 probably three or four of them actually building...
so there's 10 g's worth of work there I reckon minimum."

ON BITBIT FUNDING MODEL (Mar 21):
"If we can get even just one job that's 10 grand a month it's like 2k to
BitBit every month, that's enough for ad spend."

---

## 8. TECHNICAL ARCHITECTURE (Investor-Friendly)

### The Stack
Frontend:   Next.js 16 + React 19 (single-page app, lazy-loaded tabs)
Backend:    204 API endpoints (Next.js serverless on Vercel)
Database:   Supabase (Postgres) — 118 migrations, full row-level security
AI Engine:  Anthropic Claude (3-tier model routing)
Search:     Pinecone (vector store) + Voyage AI (embeddings)
Email:      Resend API
Payments:   Stripe (4-tier subscription billing)
Monitoring: Sentry (error tracking)
Hosting:    Vercel (dashboard) + Fly.io (workers) + Cloudflare (edge cron)

### The AI Brain — 3-Tier Model Router
TIER             MODEL           USE CASE                    COST/1M INPUT
Classification   Haiku 4.5       Triage, parsing, labeling   $0.25
Conversation     Sonnet 4.5      Chat, comms, general tasks  $3.00
Synthesis        Opus 4          Strategy, complex analysis   $15.00

Auto-routes by complexity. Target distribution: Haiku 70% / Sonnet 25% / Opus 5%.

### Confidence Routing (The Innovation)
>= 85% confidence → Auto-execute (fast, no human needed)
55-85% confidence → Queue for approval (human decides)
< 55% confidence  → Escalate immediately (alert the owner)

Thresholds configurable per-agent and per-org.
This is what separates BitBit from competitors — it knows WHEN to act
vs. when to ask. Most AI tools either auto-do everything (dangerous)
or require approval for everything (defeats the purpose).

### Key Numbers
204 API endpoints          | 272 React components
22 scheduled cron jobs     | 27 dashboard tabs/pages
20 channel integrations    | 11 specialized AI agents
118 database migrations    | 3 industry packs
719 tests / 51 files       | Multi-tenant with RLS isolation

### Semantic Memory System ("Memory Palace")
- Stores, recalls, consolidates, and forgets context automatically
- Entity resolution: 5-step fuzzy matching across contacts
- Knowledge graph: connects conversations, contacts, tasks, history
- GDPR-compliant memory deletion
- Why it matters: "Invoice Sezer for the usual" → BitBit KNOWS who Sezer
  is, what the work was, the rate, and that it was already invoiced.

### Security Highlights
- Row-level security on every table (org isolation)
- AI prompt injection detection and neutralization
- GDPR soft delete with data anonymization
- Per-agent and per-role AI spending limits
- Circuit breaker prevents cascading failures
- Full audit trail of all actions

---

## 9. WHAT'S LIVE RIGHT NOW — app.bitbit.chat

### Dashboard Pages (BUILT & DEPLOYED)
/dashboard              Main KPI cards, Kanban board, inbox feed
/dashboard/chat         AI conversation interface (threaded, streaming)
/dashboard/leads        Lead discovery, scoring, pipeline kanban
/dashboard/invoices     Invoice gen, PDF render, email delivery
/dashboard/contacts     Full CRM with relationship health scores
/dashboard/contacts/[x] Individual contact detail pages
/dashboard/approvals    Confidence-based approval queue
/dashboard/activity     Real-time activity feed
/dashboard/meetings     Meeting intelligence, transcription
/dashboard/channels     Channel status, connect/disconnect
/dashboard/connections  OAuth integration management
/dashboard/settings     Connections, Automations, Appearance, Billing
/dashboard/creator-studio  Content generation & scheduling
/dashboard/sentry       Autonomous monitoring agent
/dashboard/portal       Client portal management
/dashboard/medications  Health tracking (personal vertical)
/dashboard/builder      Project builder interface

### Client Portal (WHITE-LABEL, BUILT)
/portal/login           Magic link login (no passwords)
/portal/[slug]          Client dashboard
/portal/[slug]/projects Project view (scoped to their org)
/portal/[slug]/invoices View and pay invoices
/portal/[slug]/files    Upload/download files
/portal/[slug]/requests Submit new requests

### Public Pages (BUILT)
/                       Landing page
/showcase               Interactive data viz component gallery
/waitlist               Email signup
/privacy                Privacy policy
/terms                  Terms of service
/(auth)/onboard         Self-serve onboarding flow

### API Infrastructure (DEPLOYED)
- 22 cron jobs (channel sync, triage, sentry, briefings, billing...)
- Revenue intelligence suite (cash flow, scoring, collections, radar)
- Memory Palace (store, recall, search, consolidate, forget)
- Swarm orchestration (multi-agent parallel execution)
- Role engine (Sales, Finance, Comms sub-roles)
- Full OAuth callback system for channel integrations

### Channel Integrations (20 Types — Code Complete)
Gmail, Outlook, WhatsApp, Slack, Telegram, Asana, Calendly, Stripe,
Google Calendar, GSC, GA4, ClickUp, Xero, Facebook Messenger, Instagram,
iMessage, WordPress, SMS, Apple Calendar, Apple Reminders
→ 17 have unified inbox adapters with deduplication

---

## QUICK REFERENCE — NUMBERS TO KNOW COLD

Platform size:    204 endpoints, 272 components, 118 DB migrations
AI agents:        11 autonomous agents, all code-complete
Channels:         20 integrations (17 unified inbox)
Dashboard:        27 tabs/pages
Test coverage:    719 tests across 51 files
Pricing range:    $0 (free) to $999+/mo (Scale)
Agent costs:      $10-50/mo per agent, Tender Hunter $1-2k/mo
API margins:      70-98% depending on usage tier
Break-even:       1 client pays for all infrastructure
Target MRR Y1:    $15,000+
SaaS replaced:    $200+/seat/month across 5+ products
Industry packs:   3 live (Agency, Tradie, Content Creator)

---

## REMINDERS FOR TOMORROW

1. TEST THE DEMO BEFORE THE MEETING — don't repeat the LegalSign incident
2. Lead with the WhatsApp voice note demo — that's the jaw-drop moment
3. Use your own quotes about using BitBit for AWU — credibility is king
4. Know the margins cold: 70-98% depending on usage
5. Tender Hunter is the enterprise play: $1-2k/mo, 99%+ margin
6. The retention moat: "so reliant they can't leave"
7. R&D tax rebate target: April 2026 — mention if asked about funding efficiency
8. 50/50 partnership: Tor = CTO, Andy = Sales/Commercial
9. Entity: Delaware or Australia (accountant involved)
10. Pipeline right now: ~20 leads, 3-4 actively building, ~$10k pipeline

---
*Synthesized from: Cluely Feb 18 (15 sessions), Feb 19/22/25 sessions,
Mar 21 meeting transcript, BitBit codebase audit (25 Mar 2026),
comprehensive roadmap, investor feature showcase, expectations-vs-reality
pressure test document.*
