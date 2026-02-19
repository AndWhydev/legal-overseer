# BitBit AWU

## What This Is

BitBit is an agentic AI operations platform for digital agencies. It acts as a contextually intelligent business brain — ingesting messages across channels (email, WhatsApp, Asana, etc.), understanding relationships between people/projects/invoices, and executing operational tasks autonomously or with approval. The first customer is Andy from All Webbed Up (AWU), a Brisbane-based web agency.

## Core Value

BitBit understands the business better than the business owner — when Andy says "Invoice Sezer for the White House RE work", BitBit knows who Sezer is, what the work was, the rate, and whether it's already been invoiced.

## Requirements

### Validated

<!-- Existing functional code -->

- ✓ Next.js 16 dashboard with auth, kanban, chat, contacts, activity, channels, settings — existing
- ✓ Agent engine with model routing (Haiku/Sonnet/Opus), agentic loop, SSE streaming — existing
- ✓ Gmail adapter (IMAP via imapflow) — existing
- ✓ Channel synthesizer pipeline — existing
- ✓ 4 DB migrations (core schema, RLS, seed triggers, channels = 12 tables) — existing
- ✓ AWU deployment config, policy pack, voice profiles (Andy, Tor) — existing
- ✓ 16+ Radix-based UI components — existing
- ✓ Coordinator-based task classification and skill routing — existing
- ✓ Cost-optimized model tiering (Haiku classify → Sonnet/Opus execute) — existing
- ✓ Governance layer (PII redaction, rate limiting, circuit breakers, kill switches) — existing

### Active

<!-- Milestone 1: Deploy + Semantic Brain + Agent Infrastructure -->

- [ ] Platform deployed to Vercel with Supabase backend and AWU seed data
- [ ] Andy can log in, see kanban, chat with Claude, browse contacts
- [ ] Entity-relationship graph (contacts → projects → tasks → invoices → channels → messages)
- [ ] Unified entity timeline across all channels
- [ ] Semantic memory system (learnable facts with confidence, supersession, source tracking)
- [ ] Context assembler — entity-aware briefings per query (ported from personal AGI)
- [ ] Entity resolution via 5-step fuzzy match (exact alias → email → phone → partial name → phone variants)
- [ ] Cross-reference engine (given entity → related tasks, deadlines, financial signals)
- [ ] LLM-based channel classification (replace keyword-based with Gemini Flash + context briefing)
- [ ] Action router (immediate/queue/batch/skip based on significance + urgency)
- [ ] Channel relay daemon (poll → buffer → classify → route → write)
- [ ] Reflection agent (extract learnable facts after significant events)
- [ ] Policy + voice profile runtime loading from database
- [ ] Context-assembled prompt builder (selective, budgeted, entity-aware — replaces "dump all")
- [ ] Agent registry with self-registration pattern
- [ ] Confidence routing (act >0.85 / ask 0.55-0.85 / escalate <0.55)
- [ ] Policy engine (load rules.md → runtime enforcement)
- [ ] Shared CRUD tool system for all agents
- [ ] Agent execution scheduler (cron triggers)
- [ ] Agent approval flow API (act/ask/escalate → dashboard + WhatsApp)
- [ ] Agent run logging (tokens, cost, actions, confidence)
- [ ] Supabase dependency injection refactor (module-level client → context-based)
- [ ] 9 new DB migrations (agent_configs, agent_runs, leads, invoices, watches, templates_voices, proposals, offer_packages, contacts_enhancements)
- [ ] RLS policies for all new tables
- [ ] Fix @bitbit/core package (broken exports → only export what exists)

### Out of Scope

- WhatsApp bot + conversational interface — deferred to Milestone 2 (Phase 1.5)
- First agents (Sentry, Lead Swarm, Invoice Flow) — deferred to Milestone 2 (Phase 3)
- Channel integrations (Outlook rebuild, Asana, Calendly, WhatsApp, Stripe adapters) — deferred to Milestone 2
- Communication agents (Channel Triage, Client Comms) — Milestone 3
- Revenue agents (Proposal Bot, Client Onboarding) — Milestone 3
- Growth agents (Ad Script Gen, AI Search Optimizer, Tender Hunter) — Milestone 4
- Marketing website, public launch, self-serve signup — Milestone 5
- Mobile app — not planned
- Real-time chat — high complexity, not core value
- Video posts — storage/bandwidth costs

## Context

- **First customer**: Andy Wilson, All Webbed Up (AWU), Brisbane web/digital agency
- **Business model**: SaaS, $199-999+/mo tiers, 67-97% margins depending on usage
- **Revenue target**: $200/mo from Andy (founder deal) → $15k+ MRR at 20+ clients
- **Proven reference**: Tor's personal AGI (`~/.agent/semantic-layer/`) — production-tested daily, patterns to port
- **Research references**: A-MEM (arXiv 2502.12110), Zep KG (arXiv 2501.13956), ICLR 2026 MemAgents
- **Existing codebase**: Monorepo with `personal-assistant/` (working dashboard), `packages/core` (broken exports), `src/` (agent engine with skills/governance)

## Constraints

- **Deployment**: Vercel for dashboard (personal-assistant/), Hetzner VPS for daemon processes — macOS adapters (iMessage, Calendar, Reminders) cannot deploy to cloud
- **Serverless limits**: Vercel 30s timeout risks IMAP connections — may need Gmail API migration
- **Broken code**: @bitbit/core exports reference non-existent files; Outlook adapter reads local cache not IMAP; root `npm install` fails
- **Architectural risk**: Supabase module-level client pattern blocks multi-tenant — requires DI refactor touching every tool file (~8-12 hrs)
- **External blockers**: Anthropic API card expiring; Stripe identity verification blocking payouts; Meta Business Verification for WhatsApp (3-14 days)
- **Budget**: Minimal infra spend — $49/mo Phase 1 ($4 new on top of existing Vercel $20 + Supabase $25)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Deploy personal-assistant/ directly (not migrate to packages/dashboard) | Migration is weeks of work with zero user-visible benefit | — Pending |
| Build semantic engine from scratch (port personal AGI patterns) | Full control, proven patterns, no vendor lock-in; evaluate Zep for v2 | — Pending |
| Milestone 1 scope: Deploy + Brain + Agent Infra | Ship foundation first, validate with Andy, then layer agents | — Pending |
| Gemini Flash for classification | Cheapest option ($0.50-2/mo), sufficient for message classification | — Pending |
| Track human tasks as blockers | Andy/Tor manual tasks (DNS, credentials, billing) affect critical path | — Pending |

---
*Last updated: 2026-02-19 after initialization*
