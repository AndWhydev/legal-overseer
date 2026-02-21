# BitBit AWU

## What This Is

BitBit is an agentic AI operations platform for digital agencies. It acts as a contextually intelligent business brain — ingesting messages across channels (email, WhatsApp, Asana, etc.), understanding relationships between people/projects/invoices, and executing operational tasks autonomously or with approval. The first customer is Andy from All Webbed Up (AWU), a Brisbane-based web agency.

## Core Value

BitBit understands the business better than the business owner — when Andy says "Invoice Sezer for the White House RE work", BitBit knows who Sezer is, what the work was, the rate, and whether it's already been invoiced.

## Requirements

### Validated

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
- ✓ Platform deployed to Vercel with Supabase backend and AWU seed data — v1.0
- ✓ Andy can log in, see kanban, chat with Claude, browse contacts — v1.0
- ✓ Entity-relationship graph (contacts → projects → tasks → invoices → channels → messages) — v1.0
- ✓ Unified entity timeline across all channels — v1.0
- ✓ Semantic memory system (learnable facts with confidence, supersession, source tracking) — v1.0
- ✓ Context assembler — entity-aware briefings per query — v1.0
- ✓ Entity resolution via 5-step fuzzy match — v1.0
- ✓ Cross-reference engine (given entity → related tasks, deadlines, financial signals) — v1.0
- ✓ Agent registry with self-registration pattern — v1.0
- ✓ 12 new DB migrations with RLS policies for all new tables — v1.0
- ✓ Fix @bitbit/core package (broken exports → only export what exists) — v1.0

### Active

## Current Milestone: v1.1 Agent Runtime + First Agents

**Goal:** Andy uses BitBit daily — agents run in background, classify emails, take autonomous actions (low-risk) or ping WhatsApp for approval (high-risk).

**Target features:**
- Agent runtime (channel relay, classification, action routing, scheduler, approval flow)
- WhatsApp approval channel (act/ask notifications, not full conversational bot)
- Three first agents: Sentry (error monitoring), Lead Swarm (lead qualification), Invoice Flow (invoicing)
- Agent run logging, Supabase DI refactor (v1.0 prerequisites)

**Active requirements:** See REQUIREMENTS.md

### Out of Scope

- WhatsApp full conversational bot — deferred (approval-only channel in v1.1)
- Channel integrations (Outlook rebuild, Asana, Calendly, WhatsApp, Stripe adapters) — deferred
- Communication agents (Channel Triage, Client Comms) — Milestone 3
- Revenue agents (Proposal Bot, Client Onboarding) — Milestone 3
- Growth agents (Ad Script Gen, AI Search Optimizer, Tender Hunter) — Milestone 4
- Marketing website, public launch, self-serve signup — Milestone 5
- Mobile app — not planned
- Real-time chat — high complexity, not core value
- Video posts — storage/bandwidth costs

## Context

Shipped v1.0 MVP with 34,483 LOC TypeScript.
Tech stack: Next.js 16, Supabase (ap-southeast-2), Vercel, Anthropic API.
Monorepo: `personal-assistant/` (dashboard), `packages/core` (types/registry), `src/` (agent engine).
24 database tables (12 existing + 12 new) with full RLS.
Semantic context engine operational: entity resolution, relationship graph, timeline, context assembler.
Agent infrastructure built: registry, confidence routing, shared CRUD tools (needs production verification).

## Constraints

- **Deployment**: Vercel for dashboard, Hetzner VPS for daemon processes — macOS adapters cannot deploy to cloud
- **Serverless limits**: Vercel 30s timeout risks IMAP connections — may need Gmail API migration
- **Architectural risk**: Supabase module-level client pattern blocks multi-tenant — requires DI refactor (~8-12 hrs)
- **Budget**: Minimal infra spend — $49/mo ($4 new on top of existing Vercel $20 + Supabase $25)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Deploy personal-assistant/ directly (not migrate to packages/dashboard) | Migration is weeks of work with zero user-visible benefit | ✓ Good — shipped fast |
| Build semantic engine from scratch (port personal AGI patterns) | Full control, proven patterns, no vendor lock-in | ✓ Good — working in 3 days |
| Milestone 1 scope: Deploy + Brain + Agent Infra | Ship foundation first, validate with Andy, then layer agents | ✓ Good — all 6 phases complete |
| Gemini Flash for classification | Cheapest option ($0.50-2/mo), sufficient for message classification | — Pending (not yet implemented) |
| Track human tasks as blockers | Andy/Tor manual tasks (DNS, credentials, billing) affect critical path | ✓ Good — unblocked deploy |
| Fire-and-forget pattern for context writes | Never block CRUD flow with context side-effects | ✓ Good — no latency impact |
| DB configs passed as parameter to registry | Keep registry pure/sync (no async DB calls in core) | ✓ Good — clean separation |
| Lazy init for agent registry in serverless | Module-level guard flag avoids re-init on every request | ✓ Good — works with Vercel |
| Entity context capped at 4000 chars | Stay within token budget while providing context | ⚠️ Revisit — may need dynamic budget |

---
*Last updated: 2026-02-22 after v1.1 milestone start*
