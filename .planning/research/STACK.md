# Stack Research: v1.3 Agent Roles & Autonomy Engine

## What We Already Have (DO NOT ADD)

- **LLM**: Anthropic SDK with Haiku/Sonnet/Opus tiering — sufficient for all role execution
- **Database**: Supabase with 24+ tables, RLS, realtime — sufficient for role state storage
- **Compute**: Vercel (serverless) + Fly.io (long-running) + Cloudflare (cron) — sufficient compute tiers
- **Agent engine**: Agentic loop, tool use, SSE streaming, confidence routing — foundation exists
- **Context**: Entity resolution, relationship graph, timeline, context assembler — semantic layer exists

## Stack Additions Needed

### 1. State Machine Library — XState v5 or Custom

**Why**: Agent roles need persistent state machines (idle → analyzing → acting → waiting_approval → executing → learning). Current agents are request-response; roles need lifecycle management.

**Options**:
- **XState v5** (`xstate@5.x`): Industry-standard FSM, JSON-serializable state, supports persistence to DB. Mature, well-typed.
- **Custom FSM**: Simple enum-based state + transition table in TypeScript. Less overhead, no dependency.

**Recommendation**: Custom FSM stored as JSONB in Supabase. XState adds 40KB+ to bundle and we only need simple state transitions, not nested/parallel states. Keep it lean.

**Integration**: State stored in new `role_states` table, loaded on role activation, saved after each transition.

### 2. Temporal/Durable Execution — Fly.io Machines API or Custom

**Why**: Roles execute multi-step workflows (analyze invoices → identify overdue → draft reminders → queue for approval → send). These span minutes/hours, not single requests.

**Options**:
- **Inngest** (`inngest@3.x`): Event-driven durable functions, built-in retry, step functions. Works with Vercel + Fly.io. Free tier: 25K steps/mo.
- **Trigger.dev** (`@trigger.dev/sdk@3.x`): Background jobs with durable execution. Self-hostable. Better for long-running tasks.
- **Custom via Supabase**: Task queue in `role_tasks` table, Fly.io worker polls and executes. Simple, no vendor.

**Recommendation**: Custom task queue in Supabase + Fly.io worker execution. We already have this pattern (cron polling + worker dispatch). Adding Inngest/Trigger.dev introduces another vendor for minimal gain. The Fly.io worker can handle durable execution via checkpoint rows in the DB.

**Integration**: Extends existing `agent_tasks` pattern. New `role_workflows` table tracks multi-step execution.

### 3. Business Intelligence Computation — Supabase RPCs + Materialized Views

**Why**: Revenue Radar, Client Health, Cash Flow, Capacity all need aggregate computations across invoices, messages, projects, contacts.

**Options**:
- **Supabase RPC functions**: Postgres functions that compute metrics on demand or via cron.
- **Materialized views**: Pre-computed aggregates refreshed on schedule.
- **External analytics (Cube.js, Metabase)**: Heavy, adds infra.

**Recommendation**: Supabase RPC functions + a `business_intelligence` JSONB cache table. Cron triggers recomputation (daily for most metrics, hourly for time-sensitive ones like Cash Flow). Dashboard reads from cache. Keeps everything in Supabase, no new infra.

**Integration**: New RPC functions, new `bi_snapshots` table, new cron endpoint on Cloudflare/Vercel.

### 4. Role Memory — Supabase JSONB + Existing Semantic Memory

**Why**: Each role needs persistent memory (Finance knows payment patterns, Comms knows conversation history, Sales knows deal stages). Must survive restarts, accumulate over time.

**Options**:
- **Extend existing `semantic_memories` table**: Add `role_id` column, reuse confidence/supersession logic.
- **New `role_memories` table**: Dedicated table with role-specific schema.
- **Vector store (Pinecone)**: For retrieval-augmented role context.

**Recommendation**: Extend `semantic_memories` with `role_id` + add `role_context` JSONB table for structured working memory (current state, active workflows, learned preferences). Semantic memories for long-term knowledge, role_context for operational state. Vector search deferred — not needed yet.

**Integration**: Existing semantic memory system gets role awareness. New table for operational context.

### 5. Event System — Supabase Realtime + pg_notify

**Why**: Roles need to react to events (new message, invoice paid, client response). Current system polls via cron. Roles need event-driven triggers for responsive behavior.

**Options**:
- **Supabase Realtime**: Already available, subscribe to table changes.
- **pg_notify + custom listener**: Lightweight pub/sub within Postgres.
- **External (Redis Pub/Sub, NATS)**: Adds infra.

**Recommendation**: Supabase Realtime for dashboard → role communication. pg_notify for inter-role coordination on Fly.io workers. Both already available, no new infra.

**Integration**: Fly.io worker subscribes to Supabase Realtime channels. Roles publish events via table inserts.

## Summary: Zero New Dependencies

The key insight: **everything needed can be built on the existing stack**. No new vendors, no new databases, no new libraries beyond what's already in the monorepo. The additions are:

1. Custom state machine (TypeScript, no library)
2. Extended task queue (Supabase tables + Fly.io worker)
3. BI computation (Postgres RPCs + cache table)
4. Extended semantic memory (role awareness)
5. Event system (Supabase Realtime, already available)

**Total new infra cost: $0** (all within existing Supabase + Fly.io allocation)
