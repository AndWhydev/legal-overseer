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

- ✓ Deployment stability: Vercel builds, cron system, cold starts, connection pooling, Fly.io workers, Cloudflare edge cron — v1.2
- ✓ Channel relay: Gmail/Outlook live pull, OAuth for 6 channels, dedup, burst handling, token refresh — v1.2
- ✓ WhatsApp pipeline: voice note transcription, multi-turn context, approval flow, Baileys bridge — v1.2
- ✓ Confidence routing: 50-scenario calibration, per-agent thresholds, false positive measurement, adversarial testing — v1.2
- ✓ Invoice flow validation: ambiguous entity resolution, duplicate detection, branded PDF, email delivery, lifecycle — v1.2
- ✓ Lead response: auto-approve path, classification accuracy, qualification scoring — v1.2
- ✓ Integration fixes: TypeScript errors resolved, ignoreBuildErrors removed, relay daemon wired, Fly.io worker live — v1.2
- ✓ Credential provisioning: OAuth credentials, WhatsApp bridge deployment, smoke test verification — v1.2

- ✓ File attachments: upload via Paperclip/drag-drop, signed URLs, inline previews, AI analysis (Vision + text extraction), org-scoped storage — v1.4
- ✓ Stripe billing: consolidated webhook, subscription lifecycle, plan gating at tool execution layer, usage metering, 30-day trial, pricing page, customer portal — v1.4
- ✓ Cost controls: per-execution token budgets, per-role daily limits, circuit breakers — v1.4
- ✓ Growth tools: Ad Script Generator, SEO Monitor, Tender Hunter, Content Creator — all plan-gated — v1.4
- ✓ Role engine: composable RoleImplementation interface, autonomy levels, role tick scheduler — v1.4
- ✓ Domain roles: Finance, Comms, Sales, Intelligence Layer — v1.4
- ✓ Role dashboard: activity feed, status cards, autonomy controls, attention view, intelligence widgets — v1.4
- ✓ SOTA response drafter: ContextAssembler + RAG + Memory Palace + entity briefings + tone adaptation — v1.4
- ✓ Gap closure: role runtime imports, intelligence dashboard wiring — v1.4

- ✓ Onboarding E2E: 5-stage wizard, first-run discovery, welcome conversation, empty states — v1.5
- ✓ Marketing site: landing page, 3 industry pages, pricing with Stripe Checkout, AWU case study — v1.5
- ✓ Beta program: invite flow, daily tips, feedback widget, admin usage dashboard — v1.5
- ✓ Builder role: website generation via chat, template library, WordPress/Elementor export, preview sandbox — v1.5
- ✓ Proactive workflows: NL rule parser, trigger engine, cross-role tool bridge, workflow dashboard — v1.5
- ✓ Mobile app: Expo/React Native, chat with streaming, voice input, push notifications, offline queue — v1.5

### Active

#### Current Milestone: v2.0 Autonomous Execution

**Goal:** Transform BitBit from an agent that understands and plans into one that autonomously executes real-world tasks — browser automation, multi-step workflows, async background jobs — reliably and generically across industries.

**Target features:**
- Computer Use Agent (CUA) — browser automation as universal execution fallback
- Long-running async task executor — background jobs with multi-step orchestration, failure handling, completion reporting
- Tool priority chain — structured API first → browser fallback → human handoff
- Workflow learning — remember successful execution patterns for reuse
- Execution verification — confirm tasks completed, screenshot evidence, status reporting

### Out of Scope

- ~~CUA (computer-using agent) — future~~ → Now active in v2.0
- Real-time collaborative editing — not core value
- Custom role builder — premature, ship built-in roles first
- Video file processing — storage costs, low ROI
- Voice Agent (Eleven Labs) — deferred, needs validated demand

## Context

Shipped through v1.5 with ~100K+ LOC TypeScript across 5 milestones (36 phases, 113 plans).
Tech stack: Next.js 16, React 19, Supabase (Mumbai), Vercel (dashboard), Fly.io (workers), Cloudflare (edge cron), Anthropic API.
Monorepo: `personal-assistant/` (deployed dashboard), `packages/core` (types), `mobile/` (Expo React Native app).
120+ database migrations, 100+ tables with RLS.
Full agent engine: 5 domain roles (finance, comms, sales, growth, intelligence), composable role architecture, SOTA response drafter.
Billing: Stripe subscription lifecycle, plan gating, usage metering, 30-day trial, pricing page.
Marketing: landing page, industry pages, case study, beta program with invite flow.
Mobile: React Native/Expo app with streaming chat, voice input, push notifications, offline queue.

## Constraints

- **Deployment**: Vercel for dashboard, Fly.io Sydney for workers, Cloudflare for edge cron
- **Supabase**: Mumbai region, 120+ migrations with some sequence gaps
- **Budget**: Production infra ~$70/mo (Vercel $20, Supabase $25, Fly.io $15, misc $10)

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
*Last updated: 2026-03-31 after v2.0 milestone started*
