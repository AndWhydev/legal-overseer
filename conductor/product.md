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

Chat interface with streaming responses and a visible processing pipeline. Multi channel messaging across WhatsApp, SMS, email, iMessage, Facebook Messenger, Instagram, Slack, and Telegram. Contact management with an entity graph that tracks relationships. Invoice creation with timeline events. Task management with goals. Dual tier tenancy supporting personal and org modes. Unified connections grid with 15+ service types including ClickUp, GA4, WordPress, Xero, Google Calendar. OAuth infrastructure with token refresh lifecycle. Background intelligence that extracts facts from conversations and consolidates memory over time. Analytics dashboard wired to real agent_runs data. Activity feed. Error monitoring. 11 cron routes for background processing. Confidence based action routing where BitBit decides whether to act autonomously or ask the user. Glassmorphic UI across all dashboard pages. Mobile responsive with bottom navigation. Self-serve onboarding with 3-step wizard. CI/CD pipeline with 5 GitHub Actions workflows. 8 Playwright E2E specs. Leads pipeline with kanban and list views, prospect discovery, and outreach intelligence.

1,433 tests. 3 minor failures under investigation.

## What's next

**Platform registrations (T008).** Stripe, Meta, Google, Microsoft, Xero, Slack all need production OAuth app registrations. Human-gated work. WhatsApp requires Meta Business Verification (3-14 day wait). This is the critical unblocker for everything else.

**Production validation (T011).** Deploy Fly.io worker, VPS relay daemon, Cloudflare edge cron. Smoke test agents and channels against real credentials. Fix 3 failing tests. Load test under concurrent access.

**Legal and revenue (T012).** Entity formation, equity agreement, Stripe identity verification, Andy's first subscription. Revenue cannot flow until this is resolved.

**Context Baseplate (T009).** Evolve the semantic engine from query-time assembly to pre-computed understanding. Compiled entity profiles, active thread tracking, pattern extraction.

**Beta launch (T013).** AWU case study, landing page completion, outreach to 5-10 agencies. First external users beyond Andy.

**Security and monitoring (T022).** RLS audit, webhook signature verification, Sentry.io error tracking, uptime monitoring.

**Dashboard polish (T023).** Progressive disclosure toggle, dynamic industry-pack KPIs, conversation interface unification.

## Pricing direction

Per agent pricing with packages. Not per seat, not usage based.

Sentry (base monitoring) runs on cheap models, roughly $10/month cost. Channel Triage layers on top for about $20. Invoice Flow around $10. Client Comms $20 to $40. Lead Swarm $50/month unlimited with abuse caps. Proposal Generator is the most expensive at $30 to $40 because it needs the best model, but sells easily at $400/month. Tender Hunter is the premium tier at $1K to $2K/month.

Full agency deployment with all 10 agents costs roughly $150 to $200/month. Charge triple or quadruple that to market.

The retention model: once BitBit handles everything, it becomes very difficult to leave. Not because of lock in, but because it genuinely does the work.

## Architecture

```
personal-assistant/          Next.js 16 app (Vercel deployed dashboard)
  src/app/api/               22 API route groups
  src/components/            15 component groups
  src/lib/                   Core logic (agent, channels, context, billing)
  supabase/migrations/       55 migrations

packages/core/               Shared types and utilities
packages/agents/             10 specialist agent packages
  lead-swarm, invoice-flow, channel-triage, client-comms,
  proposal-bot, ad-script-gen, client-onboarding,
  ai-search-optimizer, tender-hunter, sentry

deployments/                 Per client configs (awu, torkay, demo, cloudflare, fly, vps)
```
