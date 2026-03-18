# BitBit product context

## What BitBit is

BitBit is not a platform. BitBit is not a tool. BitBit is a thing that works for you.

Think of it like hiring someone who already knows your business. BitBit reads your emails, manages your invoices, triages your messages, follows up with your clients, hunts for tenders, writes your proposals. It knows who Dave is, that he owes you money, and that he mentioned Steve's project in last Tuesday's email. It connects everything and it remembers everything.

Every user gets their own BitBit. You plug in your services, BitBit learns your world, and then it gets to work. You can message it from WhatsApp while you're on a job site. You can call it. You can ignore it and let it handle things. It tells you what it did, not what it's about to do.

## The problem it solves

Business operators are buried in admin. Email, calendars, messaging apps, invoicing, CRM. Every service is its own silo. Context about people and relationships lives in twenty different places.

Most "AI assistants" wait for instructions. They react. BitBit is different because it thinks ahead. When a new email arrives, BitBit has already figured out who sent it, what it's about, which project it relates to, and whether it needs your attention. That understanding was built before you even asked.

## How it works

**Connections.** One screen with tiles for every service. Gmail, Calendar, WhatsApp, Slack, Xero. Click to connect. No confusing distinction between "channels" and "integrations." It's all just connections.

**Context Baseplate.** This is BitBit's compiled understanding of your world. Not the typical search and retrieve approach. BitBit does its thinking when new information arrives, not when you ask a question. It builds an entity graph with relationships, patterns, and active threads. Dave's email about Steve's invoice gets linked to Steve's contact record at crawl time.

**Specialist agents.** BitBit has a team of agents, each with a specific job. Invoice Flow handles your invoicing. Lead Swarm finds and qualifies prospects. Channel Triage reads everything coming in and escalates what matters. You pick which agents you need. They're like lego bricks.

**Tool orchestration.** When you ask BitBit something, it doesn't load every tool it has. A fast planner (Haiku) reads your intent and selects only the relevant tool groups — contacts and comms for "send Sezer a WhatsApp", web tools for "search for plumbers in Sydney", memory for "remember his rate". This keeps the AI focused, fast, and cheap. As tool count grows beyond 50, complex multi-domain queries can escalate to specialist sub-agents that run in parallel.

**Personal first, org optional.** Every user gets their own BitBit with their own connections. If you're part of a team, you can share an org where some data surfaces to the group level. But the personal experience comes first.

## Who BitBit is for

### Marketing agencies (first target)

Andy's agency All Webbed Up is the first real deployment. Full suite of 10 agents configured specifically for agency work. Lead generation, proposal automation from meeting transcripts, ad script generation with platform adaptation, client onboarding that creates Asana projects and books kickoff calls.

Andy put it simply: "this thing can be sold to a marketing agency worldwide and they'd probably jump at it."

The agency profile: running multiple client accounts, burning hours on proposals and reporting, losing leads because response time is too slow, sending emails that sound robotic because there's no time to personalize them.

### Trades and service businesses

Electricians, plumbers, builders. People who do real work during the day and then have to do invoicing and quoting at night. Half the time they forget things because they're on a job site.

The use case Andy described: a tradie messages BitBit from their phone while they're working. "Hey Bit, prepare an invoice for that kitchen job at Dave's." Or "remind me to follow up with the council about that permit." Speed matters. Hands are dirty. They need something that just works.

The trades bundle is leaner. Sentry for monitoring inbound, Channel Triage for escalation, Invoice Flow for billing, Client Comms for responses. No lead generation or ad scripts needed for most tradespeople.

### Enterprise and tender hunting

The Tender Hunter agent is the premium play. Companies chasing $10K+ contracts need to find tenders, check eligibility (ABN, insurance, case studies), and respond fast. That's a $1,000 to $2,000 per month offering. Andy knows people who would pay that today if it works.

### Dentists and other high touch service businesses

Briefly discussed but the logic holds. Any business juggling many client relationships, appointments, follow ups, and billing is a natural fit. Dentists, physios, accountants. The more agents relevant to their workflow, the higher the value.

### The common thread

All of these people share the same frustration. They started a business to do the work they're good at. Instead they spend hours every day on admin. BitBit gives them that time back. It's not another tool they have to learn. It's something that learns them.

## What's built

Chat interface with streaming responses and a visible processing pipeline. Multi channel messaging across WhatsApp, SMS, email, iMessage, Facebook Messenger, Instagram, Slack, and Telegram. WhatsApp dual-path transport: Meta Cloud API (primary) with Baileys bridge fallback on Fly.io (`bitbit-wa-bridge.fly.dev`). WhatsApp chat history importer for bootstrapping context from existing conversations. Meta WhatsApp webhook with signature verification. Channel adapter wiring across all transports. Contact management with an entity graph that tracks relationships. Auto-create contacts from triage for human senders. Invoice creation with timeline events. Task management with goals. Dual tier tenancy supporting personal and org modes. Unified connections grid with 15+ service types including ClickUp, GA4, WordPress, Xero, Google Calendar. OAuth infrastructure with token refresh lifecycle. Background intelligence that extracts facts from conversations and consolidates memory over time. Proactive memory building — BitBit learns from every conversation turn, not just when explicitly told to remember. Analytics dashboard wired to real agent_runs data with interactive data-viz library (sparkline, bar, donut, gauge charts with hover tooltips). Activity feed. Error monitoring. 19 cron routes for background processing (including channel-sync, triage, process-embeddings). Confidence based action routing where BitBit decides whether to act autonomously or ask the user. Glassmorphic UI across all dashboard pages. Mobile responsive with bottom navigation. Self-serve onboarding with 3-step wizard. CI/CD pipeline with 5 GitHub Actions workflows. 12 Playwright E2E specs covering auth, dashboard, API routes, kanban, leads, invoices, and KPI rendering. Leads pipeline with kanban and list views, prospect discovery, and outreach intelligence. Context Baseplate with entity profiles, entity patterns (payment timing, response latency, activity frequency, channel preference), mention extraction, active threads, and cross-reference caching. First-contact intelligence — when BitBit doesn't know something, it scans connected channels to find the answer instead of saying "I don't know." Cross-channel search with deeper Gmail sync. Production deployment on Fly.io (worker with bearer auth), Fly.io WhatsApp bridge (`bitbit-wa-bridge.fly.dev`), Cloudflare Workers (edge cron with rate limiting), and VPS relay. Sentry error tracking with context enrichment and PII filtering. Security hardened with webhook HMAC verification, circuit breaker on LLM calls, DLQ with admin API, rate limiting, and security response headers. RLS policies audited across all 91 migrations.

Whispers: proactive nudge system that surfaces contextual suggestions without being asked. Five whisper sources: stale contacts (people you haven't talked to), due items, unfinished momentum, anomalies, and proactive completions. API route + dashboard component + migration 085.

Medications tracker: personal health tracking module with 12 components (protocol manager, cycling timeline, monthly grid, stock indicator, half-life chart, absorption hints, inventory panel, script roadmap, in-transit tracker). API routes + migration 084.

User identity anchor: persistent user profile with agentic execution layer and knowledge drive. Grounds BitBit's understanding of who the user is across sessions.

Agent superpower tools: web_search (Brave API), fetch_url (readability extraction), browse_website (Playwright headless), send_email (Resend with approval routing), send_sms (Telnyx with approval routing), send_gmail (via user's Gmail account), send_whatsapp (via bridge), send_outlook (via Microsoft Graph). Agentic execution: execute_code tool runs code against the BitBit SDK for complex multi-step operations. Tool orchestration via Haiku planner that selects tool groups per conversation (5-12 filtered tools from 26 total across 6 groups, 90-95% KV cache hit rate). Agent kill switch per organisation. Daily outbound send limits. Approval queue for all outbound comms during beta. AI disclosure in privacy policy, chat banner, and agent system prompt. Waitlist landing page at bitbit.chat with email capture backed by Supabase. New brand icon (white background, black logo) deployed site-wide. Google Search Console verified. Privacy Policy and Terms of Service live.

Total Recall: persistent conversational memory with cross-channel continuity. One active thread per user per org — all channels (web, WhatsApp, SMS, email, Slack) write to the same conversation thread. Cross-channel identity resolution maps phone numbers, email addresses, and Slack IDs to authenticated users. Three-tier conversation compression: last 10 turns verbatim, turns 11-30 compressed via Haiku, turns 31+ distilled to key facts (commitments, decisions, deadlines, financial amounts). Context assembly pipeline with priority-based token budgeting across 6 tiers within an 8K token budget. Action execution dispatcher with 7 transport handlers (email/SMS/WhatsApp/task/invoice create/invoice send/reminder), idempotency guard, and retry with exponential backoff. `approve_action` LLM tool lets users approve pending actions conversationally ("yep, send it") with fuzzy matching and expired action re-queue. Pending approvals surfaced in system prompt so the LLM can match "send it" to the right action. Unified pipeline routes web chat through identity resolution → thread management → context assembly → engine → storage → post-processing. Thread archival cron (*/15) archives stale threads after 24h inactivity. 4 new database tables, 3 PL/pgSQL helper functions, full RLS policies.

RAG infrastructure: Pinecone Serverless vector database with Voyage-3.5-lite embeddings for semantic search across all ingested content (emails, messages, documents). Kuzu WASM knowledge graph for entity relationship traversal. Embedding queue for async processing. Hybrid retrieval combining vector similarity, metadata filtering, and graph traversal. RAG stats monitoring widget in dashboard settings.

19 cron routes. 91 database migrations. 1,862+ tests. 21 E2E spec files.

## What's next

**Channel smoke tests (T011).** All 5 key platform credentials are configured. Remaining: smoke test each channel adapter against real credentials, load test under concurrent access. Ed25519 SMS webhook verification fixed.

**Onboarding flow (T010).** Core routing and wizard implemented. FR-6 (OAuth callback), FR-7 (skip for now), FR-8 (first-value API), FR-9 (agent recommendations), FR-11 (help affordance), FR-12 (funnel instrumentation) all committed. Needs end-to-end verification.

**Legal and revenue (T012).** Entity formation, equity agreement, Stripe identity verification, Andy's first subscription. Revenue cannot flow until this is resolved. Terms and privacy policy are live.

**Beta launch (T013).** Waitlist page live at bitbit.chat collecting signups. AWU case study still needed. Pricing page needs Stripe checkout wiring. Beta outreach to 5-10 agencies from Andy's network.

**Agent superpowers Phase 3 (T027).** 1Password Connect Server on Fly + generic credential tool + skill extensibility framework.

**WhatsApp production (T008/T012).** WABA phone registration requires real mobile SIM (Meta blocks VoIP). Cheap prepaid AU SIM sufficient. Permanent System User token generated (2026-03-11).

**Total Recall remaining (T031).** Migration 067 applied to Supabase remote (2026-03-17). Phase 5: migrate WhatsApp/SMS/email channel adapters through the unified conversation pipeline (currently only web chat uses it). Phase 7: deprecate legacy ConversationRouter string-packing, add message cleanup cron for compiled threads, identity backfill for new signups.

**Context Baseplate remaining (T009).** End-to-end verification with real data. Relationship and memory data seeding. No-reply contact cleanup. Apply migration 066 to remote.

## Pricing direction

Per agent pricing with packages. Not per seat, not usage based.

Sentry (base monitoring) runs on cheap models, roughly $10/month cost. Channel Triage layers on top for about $20. Invoice Flow around $10. Client Comms $20 to $40. Lead Swarm $50/month unlimited with abuse caps. Proposal Generator is the most expensive at $30 to $40 because it needs the best model, but sells easily at $400/month. Tender Hunter is the premium tier at $1K to $2K/month.

Full agency deployment with all 10 agents costs roughly $150 to $200/month. Charge triple or quadruple that to market.

The retention model: once BitBit handles everything, it becomes very difficult to leave. Not because of lock in, but because it genuinely does the work.

## Architecture

```
personal-assistant/          Next.js 16 app (Vercel deployed dashboard)
  src/app/api/               25+ API route groups, 19 cron routes
  src/components/            17 component groups (incl. medications, whispers)
  src/lib/agent/             Engine, tools (26 across 6 groups), planner, prompt-builder, approval-queue, action-executor
  src/lib/channels/          Channel adapters, synthesizer, transport
  src/lib/context/           Entity profiles, baseplate, mention scanner, xref cache
  src/lib/context-assembly/  ContextAssembler, TokenBudgetManager (Total Recall)
  src/lib/conversation/      Identity resolver, thread resolver, unified pipeline (Total Recall)
  src/lib/memory/            Compressor, consolidator, thread archiver (Total Recall)
  src/lib/whispers/          Proactive nudge generation (5 sources)
  supabase/migrations/       91 migrations

packages/core/               Shared types and utilities
packages/agents/             10 specialist agent packages
  lead-swarm, invoice-flow, channel-triage, client-comms,
  proposal-bot, ad-script-gen, client-onboarding,
  ai-search-optimizer, tender-hunter, sentry

deployments/                 Per client configs (awu, torkay, demo, cloudflare, fly, vps)
```
