# BitBit AWU — Comprehensive Development Roadmap

**Generated**: 2026-02-19 | **Last Updated**: 2026-02-19
**Sources**: PRD, Architecture, Demo Checklist, Infrastructure Research, Pricing Packages, Agent Cost Breakdown, AWU Config, WhatsApp Guide, Tender Architecture, Quick Start Connections, Cluely Call Transcripts
**Research Agents**: 6 parallel agents (platform, channel, agent, code, infra, GTM) + team-lead coordinator
**Academic References**: A-MEM (arXiv 2502.12110), Zep KG (arXiv 2501.13956), ICLR 2026 MemAgents, RAGFlow Context Review
**Scope**: Full development lifecycle from current state to public launch

> **NOTE on Phase Structure**: Phase 1 (Semantic Context Engine) and Phase 1.5 (Conversational Interface) were
> added as the foundational intelligence layer. All subsequent phases retain their original task IDs (1.x → 9.x)
> for cross-reference stability. The phase NAMES have shifted but task IDs are unchanged.

---

## Current State Summary

**What EXISTS (functional)**:
- Next.js 16 dashboard (auth, kanban, chat, contacts, activity, channels, settings)
- Agent engine with model routing (Haiku/Sonnet/Opus), agentic loop, SSE streaming
- Gmail adapter (IMAP via imapflow — serverless risk, 30s timeout)
- iMessage adapter (macOS chat.db — local only, CANNOT deploy to cloud)
- Calendar + Reminders adapters (macOS osascript — local only, CANNOT deploy)
- Channel synthesizer pipeline
- 4 DB migrations (core schema, RLS, seed triggers, channels = 12 tables)
- AWU deployment config (org settings, agent rollout phases, channel configs, client roster)
- AWU policy pack + voice profiles (Andy, Tor)
- 16+ UI components (Radix-based)

**What's BROKEN or STUB**:
- **`@bitbit/core` package** — index.ts references non-existent files (engine, model-router, orchestrator)
- **Outlook adapter is BROKEN** — reads `~/.agent/cache/outlook-emails.json` (local file cache), NOT actual IMAP. Will NOT work on Vercel. Needs rewrite to Microsoft Graph API or real IMAP
- **`packages/dashboard`** — empty directory (migration from personal-assistant not started)
- **Root monorepo `npm install` fails** — broken core exports prevent workspace resolution
- **10 agent packages** — stubs only (lead-swarm and invoice-flow have `throw NotImplemented`)
- **Supabase injection pattern** — engine.ts and tools.ts use module-level Supabase client from personal-assistant; moving to @bitbit/core requires dependency injection refactor (biggest architectural risk)
- **Confidence scoring missing from agent results** — handler.ts returns don't include confidence scores, blocking act/ask/escalate routing
- No Supabase project created
- No AWU seed data SQL
- 9 PRD tables not migrated (leads, invoices, proposals, agent_configs, agent_runs, watches, templates, voice_profiles, offer_packages)
- No WhatsApp/Asana/Calendly/Stripe/ClickUp adapters
- Anthropic API card expiring
- Stripe identity verification blocking payouts

### Architectural Risks (from code analysis)

1. **Supabase Injection Pattern** (HIGH): The working agent engine in `personal-assistant/lib/agent/` creates a module-level Supabase client. All tools import it directly. Moving this to `@bitbit/core` for multi-tenant use requires dependency injection — passing client through context, not importing globally. This touches every tool and the engine itself. ~8-12 hrs refactor.

2. **Outlook Adapter** (HIGH): Current `outlook.ts` reads a local JSON file (`~/.agent/cache/outlook-emails.json`), not actual IMAP. This was a prototype shortcut. Production needs either Microsoft Graph API (OAuth, recommended) or real IMAP connection. ~6-8 hrs to rebuild.

3. **macOS-Only Adapters** (MEDIUM): iMessage (chat.db), Calendar (osascript), Reminders (osascript) are macOS-only. They work for local dev but CANNOT deploy to Vercel/Fly.io. For cloud: need Google Calendar API, skip iMessage (or use bridge service), skip Reminders.

4. **Serverless IMAP** (MEDIUM): Gmail IMAP via imapflow may timeout in Vercel's 30s serverless limit. Options: move to Gmail API (OAuth), use Hetzner VPS for IMAP polling, or increase Vercel timeout (Pro plan allows 300s for API routes).

---

## PHASE 0: Platform Foundation & Deployment
**Timeline**: Week 1-2 | **Effort**: ~2.5 hours (Tor solo, Andy for DNS)
**Goal**: Andy can log into a working BitBit dashboard with real data

### Critical Path (~2 hours)

| ID | Task | Effort | Owner | Depends On | Priority |
|----|------|--------|-------|------------|----------|
| 0.1 | Fix Anthropic API billing (update card) | 5 min | Tor | — | CRITICAL BLOCKER |
| 0.2 | Create Supabase project (`bitbit-awu`, ap-southeast-2) | 15 min | Tor | — | CRITICAL |
| 0.3 | Run migration 001_core_schema.sql | 2 min | Tor | 0.2 | CRITICAL |
| 0.4 | Run migration 002_rls_policies.sql | 2 min | Tor | 0.3 | CRITICAL |
| 0.5 | Run migration 003_seed_defaults.sql | 2 min | Tor | 0.4 | CRITICAL |
| 0.6 | Run migration 004_channels.sql | 2 min | Tor | 0.5 | CRITICAL |
| 0.7 | Configure Supabase Auth (site URL, redirects) | 5 min | Tor | 0.2 | CRITICAL |
| 0.8 | Write + run AWU org seed SQL (from config.ts) | 15 min | Tor | 0.6 | CRITICAL |
| 0.9 | Create Andy's Supabase auth user | 5 min | Tor | 0.2 | CRITICAL |
| 0.10 | Insert Andy's profile row (link to AWU org) | 5 min | Tor | 0.8, 0.9 | CRITICAL |
| 0.11 | Seed AWU contacts (6 clients from config.ts) | 20 min | Tor | 0.10 | HIGH |
| 0.12 | Hide Medications nav item from sidebar | 5 min | Tor | — | MEDIUM |
| 0.13 | Install Vercel CLI + link personal-assistant/ | 7 min | Tor | — | CRITICAL |
| 0.14 | Set Vercel env vars (Supabase URL/keys, Anthropic key) | 5 min | Tor | 0.2, 0.13 | CRITICAL |
| 0.15 | Deploy to Vercel production | 5 min | Tor | 0.14, 0.1 | CRITICAL |
| 0.16 | Smoke test (app loads, login page appears) | 10 min | Tor | 0.15 | CRITICAL |
| 0.17 | Confirm domain registrar access (bitbit.com.au) | 5 min | Andy+Tor | — | HIGH |
| 0.18 | Add domain to Vercel + update DNS | 15 min | Andy+Tor | 0.15, 0.17 | HIGH |
| 0.19 | Wait for DNS propagation + verify SSL | 15-30 min | Tor | 0.18 | HIGH |

### Post-Deployment Verification

| ID | Task | Effort | Owner | Depends On | Priority |
|----|------|--------|-------|------------|----------|
| 0.20 | Test Andy's login flow | 5 min | Tor | 0.15, 0.10 | CRITICAL |
| 0.21 | Verify kanban board (5 columns, drag-and-drop) | 5 min | Tor | 0.20 | CRITICAL |
| 0.22 | Test AI chat (Claude SSE streaming) | 5 min | Tor | 0.20, 0.1 | CRITICAL |
| 0.23 | Verify contacts page (6 AWU clients) | 5 min | Tor | 0.20, 0.11 | HIGH |
| 0.24 | Verify activity feed loads | 5 min | Tor | 0.20 | MEDIUM |
| 0.25 | Test Gmail/Outlook IMAP on Vercel (serverless risk) | 30 min | Tor | 0.20 | MEDIUM |
| 0.26 | Seed sample kanban tasks for demo richness | 15 min | Tor | 0.10 | MEDIUM |
| 0.27 | Send Andy credentials (URL, email, password) | 5 min | Tor | 0.22 | HIGH |
| 0.28 | Wire contact search filter (input exists, logic not connected) | 1 hr | Tor | 0.23 | MEDIUM |
| 0.29 | Wire settings save handlers (profile form, preferences) | 2 hr | Tor | 0.20 | MEDIUM |

### Phase 0 Blockers
1. **Anthropic billing** — do FIRST, 5 min, unblocks AI chat
2. **Andy for DNS** — coordinate timing for domain pointing
3. **imapflow serverless risk** — Gmail/Outlook IMAP may timeout in 30s serverless limit
4. **Root monorepo broken** — deploy from `personal-assistant/` only, NOT root
5. **AWU seeds empty** — seed SQL must be written from scratch using config.ts

### Phase 0 Deliverable
Andy can log in at `bitbit.com.au`, see kanban board, chat with Claude, browse 6 contacts, view activity feed. No agents running yet — just the platform shell.

---

## PHASE 1: Semantic Context Engine (THE BRAIN)
**Timeline**: Week 2-4 | **Effort**: ~80-100 hrs
**Goal**: BitBit understands the business better than the business owner
**Why first**: Every agent, every interface, every classification depends on this. Without it, agents are dumb command executors. With it, they're contextually intelligent.

> **Design Principle**: BitBit's value = omniscient context across all channels.
> Andy has 6+ clients, 16+ channels, hundreds of messages/week. He can't hold it all in his head. BitBit can.
> When Andy says "Invoice Sezer for the White House RE work", BitBit must KNOW: who Sezer is, what the work was,
> the rate, the terms, and that it was already invoiced (AWU-202602-002, $200, Feb 18).

### Research References
- [A-MEM: Agentic Memory for LLM Agents](https://arxiv.org/abs/2502.12110) — self-organizing memory with active connection formation
- [Zep: Temporal Knowledge Graph for Agent Memory](https://arxiv.org/pdf/2501.13956) — graph-based entity memory, SOTA on benchmarks, lower token cost
- [ICLR 2026 MemAgents Workshop](https://openreview.net/pdf?id=U51WxL382H) — multi-memory architecture (episodic + semantic + procedural)
- [RAGFlow: From RAG to Context](https://ragflow.io/blog/rag-review-2025-from-rag-to-context) — structured context assembly > naive retrieval
- **Proven reference implementation**: Tor's personal AGI (`~/.agent/semantic-layer/`) — production-tested daily

### 1A: Entity Graph & Knowledge Store

| ID | Task | Effort | Owner | Depends On | Priority | Notes |
|----|------|--------|-------|------------|----------|-------|
| 1.1 | Design entity-relationship schema (contacts → projects → tasks → invoices → channels → messages) | 4 hr | Tor | — | CRITICAL | Graph structure, not flat tables. Consider `pg_graphql` or adjacency list with jsonb edges |
| 1.2 | Write migration: `entity_relationships` table (entity_a, entity_b, relationship_type, metadata, strength, last_updated) | 2 hr | Tor | 1.1 | CRITICAL | Enables "Sezer → White House RE → 6 tasks → $200 invoice" traversal |
| 1.3 | Write migration: `entity_timeline` table (entity_id, event_type, event_data, channel_source, timestamp) | 2 hr | Tor | 1.1 | CRITICAL | Unified timeline per entity across all channels |
| 1.4 | Write migration: `semantic_memories` table (org_id, entity_ids[], category, content, confidence, source_events[], created_at, updated_at, superseded_by) | 2 hr | Tor | — | CRITICAL | Replaces flat `memory_entries`. Memories link to entities and can be superseded |
| 1.5 | Relationship auto-linker: when a task mentions "White House RE" or "Sezer", auto-create entity_relationships | 4 hr | Tor | 1.2 | HIGH | Runs on task/contact/invoice CRUD operations |
| 1.6 | Timeline writer: every channel message, task update, invoice event → entity_timeline entry | 3 hr | Tor | 1.3 | HIGH | Single source of truth for "what happened when" |

### 1B: Context Assembler (Port from Personal AGI)

| ID | Task | Effort | Owner | Depends On | Priority | Notes |
|----|------|--------|-------|------------|----------|-------|
| 1.7 | Port `context_assembler.py` logic to TypeScript `context-assembler.ts` | 8 hr | Tor | 1.1-1.6 | CRITICAL | The most important piece — builds entity-aware briefings per query |
| 1.8 | Entity resolution: 5-step fuzzy match (exact alias → email → phone → partial name → phone format variants) | 4 hr | Tor | — | CRITICAL | Port from personal AGI's proven pattern |
| 1.9 | Cross-reference engine: given entity, find related tasks, waiting-for items, deadlines, financial signals | 6 hr | Tor | 1.2, 1.3 | CRITICAL | Graph traversal + temporal filtering |
| 1.10 | Financial signal extraction: scan related entities for dollar amounts, quotes, invoices, payment status | 3 hr | Tor | 1.9 | HIGH | "Steve has $500 pending quote" context |
| 1.11 | Temporal signal calculation: days since last contact, days until deadline, overdue items | 2 hr | Tor | 1.9 | HIGH | Recency and urgency awareness |
| 1.12 | Selective context assembly: build tailored briefing for a specific query (not dump everything) | 6 hr | Tor | 1.7-1.11 | CRITICAL | Token-efficient: only load what's relevant to THIS request |
| 1.13 | Context budget manager: allocate token budget across memory types (working 40%, episodic 25%, semantic 20%, procedural 15%) | 3 hr | Tor | 1.12 | HIGH | Prevents context overflow at scale |

### 1C: Channel Intelligence (Deep Classification)

| ID | Task | Effort | Owner | Depends On | Priority | Notes |
|----|------|--------|-------|------------|----------|-------|
| 1.14 | Replace keyword-based synthesizer classification with LLM classification (Gemini Flash) | 6 hr | Tor | 1.7 | CRITICAL | Port from personal AGI's deep classification pattern |
| 1.15 | Per-message context briefing: assemble entity context BEFORE classifying (not after) | 4 hr | Tor | 1.12, 1.14 | CRITICAL | "sounds good" from Steve with $500 pending = sig 9, not sig 3 |
| 1.16 | Structured classification output: significance (1-10), time_sensitivity_hours, resolves[], unblocks[], recommended_actions[] | 3 hr | Tor | 1.14 | HIGH | Enables intelligent routing |
| 1.17 | Action router: immediate (sig≥8 + urgent) / queue (sig≥8) / batch (sig<5) / skip (noise) | 3 hr | Tor | 1.16 | HIGH | Port from personal AGI's `action_router.py` |
| 1.18 | Cross-channel deduplication with entity awareness (same person, same topic, different channels = 1 item) | 4 hr | Tor | 1.8 | HIGH | Not just subject matching — entity + topic matching |

### 1D: Background Processing Daemon

| ID | Task | Effort | Owner | Depends On | Priority | Notes |
|----|------|--------|-------|------------|----------|-------|
| 1.19 | Channel relay daemon (poll → buffer → classify → route → write) as Supabase Edge Function or Hetzner cron | 8 hr | Tor | 1.14-1.18 | CRITICAL | The always-on intelligence layer |
| 1.20 | Configurable poll intervals per channel per org (Gmail 5min, WhatsApp real-time via webhook, Asana 15min) | 2 hr | Tor | 1.19 | HIGH | |
| 1.21 | Reflection agent: after significant events, extract learnable facts → write to semantic_memories | 6 hr | Tor | 1.4, 1.19 | HIGH | "Steve always pays within 48hrs" gets learned automatically |
| 1.22 | Memory consolidation: periodically merge/supersede outdated memories | 3 hr | Tor | 1.21 | MEDIUM | Prevents stale facts from polluting context |

### 1E: Policy & Voice Runtime Loading

| ID | Task | Effort | Owner | Depends On | Priority | Notes |
|----|------|--------|-------|------------|----------|-------|
| 1.23 | Wire policy loader into buildSystemPrompt (read from agent_configs table, not disk) | 3 hr | Tor | — | CRITICAL | AWU policies exist but are dead code today |
| 1.24 | Wire voice profile loader (per-org + per-contact voice selection) | 3 hr | Tor | — | CRITICAL | Andy voice, Tor-AWU voice, per-client tone matching |
| 1.25 | Seed AWU policies + voice profiles into Supabase from deployment files | 1 hr | Tor | 1.23, 1.24 | HIGH | Move from /deployments/awu/ files to database |

### 1F: Upgrade Prompt Builder

| ID | Task | Effort | Owner | Depends On | Priority | Notes |
|----|------|--------|-------|------------|----------|-------|
| 1.26 | Replace "dump all" prompt builder with context-assembled prompt builder | 6 hr | Tor | 1.12, 1.13 | CRITICAL | Current loads 50 tasks + all contacts blindly. New version: selective, budgeted, entity-aware |
| 1.27 | Add "what I know about this conversation" preamble (resolved entities, active projects, recent history) | 3 hr | Tor | 1.26 | HIGH | Agent starts each turn already knowing the relevant context |
| 1.28 | Add tool-call context enrichment: when agent calls get_contact, inject full entity graph (not just flat record) | 2 hr | Tor | 1.9 | MEDIUM | Contact lookup returns relationships, timeline, memories |

### Phase 1 Deliverable
BitBit can resolve "Invoice Sezer for the White House RE work" into: entity=Sezer Yunus, project=White House RE, work=6 changes, rate=$200, status=already invoiced (AWU-202602-002). Incoming messages are classified with full context awareness. Memories are learned and recalled automatically. Policies and voice profiles load from the database.

### Phase 1 Risk: Build vs Buy

| Approach | Pros | Cons | Recommendation |
|---|---|---|---|
| **Build from scratch** (port personal AGI patterns) | Full control, proven patterns, no vendor lock-in | 80-100 hrs development, maintenance burden | **Recommended for v1** — the personal AGI patterns are battle-tested |
| **Zep Cloud** (managed knowledge graph) | SOTA performance, handles graph + temporal + episodic | Vendor dependency, cost per org, less customizable | Evaluate for v2 when multi-tenant scale matters |
| **pgvector + embeddings** | Industry standard, native Supabase support | Overkill for entity resolution (graph > vectors for business entities), adds embedding cost | Add as supplementary for fuzzy document search, not primary |
| **LangGraph + MongoDB** | Good multi-agent memory patterns | Over-engineered for this use case, adds infra complexity | Skip |

---

## PHASE 1.5: Conversational Interface (THE MOUTH)
**Timeline**: Week 4-5 | **Effort**: ~35-40 hrs
**Goal**: Andy can text BitBit on WhatsApp and get intelligent responses
**Depends on**: Phase 1 (Semantic Context Engine) — without it, this is just a keyword parser

> **Design Principle**: The WhatsApp interface IS the product for 80% of users.
> Agency owners run businesses from their phones. The dashboard is for deep dives.
> WhatsApp is for "Invoice Sezer", "Any new leads?", "What's overdue?"

### 1.5A: WhatsApp Bot Core

| ID | Task | Effort | Owner | Depends On | Priority | Notes |
|----|------|--------|-------|------------|----------|-------|
| 1.5.1 | Natural language command parser (user message → intent + entities + parameters) | 6 hr | Tor | Phase 1 | CRITICAL | Uses context assembler to resolve ambiguous references |
| 1.5.2 | Multi-turn conversation manager (session state, follow-up questions, confirmations) | 4 hr | Tor | 1.5.1 | CRITICAL | "Invoice Sezer" → "For the White House RE work ($200)? Y/N" → "Y" → done |
| 1.5.3 | Agent dispatch from WhatsApp (intent → correct agent → execute → respond) | 4 hr | Tor | 1.5.1 | CRITICAL | Maps natural language to agent actions |
| 1.5.4 | Rich WhatsApp responses (formatted lists, buttons, quick replies where API supports) | 3 hr | Tor | 1.5.3 | HIGH | Not just plain text — use WhatsApp's interactive message types |
| 1.5.5 | Voice note transcription pipeline (WhatsApp audio → Whisper/Deepgram → text → command parser) | 4 hr | Tor | 1.5.1 | HIGH | Andy sends voice notes, not typed messages |
| 1.5.6 | Proactive morning briefing via WhatsApp (daily digest: leads, overdue, approvals, schedule) | 3 hr | Tor | Phase 1 | HIGH | Pushed at configured time (e.g. 7:30am Brisbane) |
| 1.5.7 | Proactive alerts (new high-value lead, overdue invoice, negative client sentiment) | 3 hr | Tor | 1.17 (action router) | HIGH | Don't wait for Andy to ask — tell him |
| 1.5.8 | Approval flow via WhatsApp (agent wants to act → "Approve? Y/N" → Andy replies → agent executes) | 3 hr | Tor | 1.5.3 | CRITICAL | The confidence routing UI for mobile |
| 1.5.9 | "Help" command — list available actions in plain language | 1 hr | Tor | 1.5.1 | MEDIUM | |
| 1.5.10 | Error recovery ("I didn't understand that. Did you mean...?" with suggestions) | 2 hr | Tor | 1.5.1 | HIGH | Graceful failure, not silent confusion |

### 1.5B: Dashboard UX Simplification

| ID | Task | Effort | Owner | Depends On | Priority | Notes |
|----|------|--------|-------|------------|----------|-------|
| 1.5.11 | Command Center as default landing page (replaces kanban as homepage) | 2 hr | Tor | 4.9a | HIGH | "What needs attention NOW" > task list |
| 1.5.12 | Mobile-responsive dashboard (sidebar → bottom nav, cards → stacked) | 6 hr | Tor | — | HIGH | Current 256px fixed sidebar breaks on mobile |
| 1.5.13 | Guided onboarding tour (first-login walkthrough for non-technical users) | 4 hr | Tor | — | HIGH | "Here's your inbox, leads, how to approve" |
| 1.5.14 | Progressive disclosure (hide Analytics, Agents config, Settings behind "Advanced" toggle) | 3 hr | Tor | — | MEDIUM | Reduce cognitive load for agency owners |
| 1.5.15 | Quick actions from Command Center (one-tap: approve, invoice, reply, dismiss) | 4 hr | Tor | 1.5.11 | HIGH | Minimize clicks for common operations |
| 1.5.16 | Notification center (bell icon, badge counts on sidebar items, unread indicators) | 3 hr | Tor | — | MEDIUM | |

### 1.5C: Multi-Modal Extensibility

| ID | Task | Effort | Owner | Depends On | Priority | Notes |
|----|------|--------|-------|------------|----------|-------|
| 1.5.17 | Abstract conversation interface (WhatsApp, iMessage, SMS, email all use same command parser) | 3 hr | Tor | 1.5.1 | MEDIUM | Build once, deliver everywhere |
| 1.5.18 | Email command interface (reply to BitBit digest with natural language) | 4 hr | Tor | 1.5.17 | LOW | For users who prefer email |
| 1.5.19 | SMS fallback (Twilio/Telnyx for when WhatsApp is down) | 4 hr | Tor | 1.5.17 | LOW | |

### Phase 1.5 Deliverable
Andy texts "Any new leads?" on WhatsApp at 8am. BitBit responds with a rich formatted summary of overnight leads, qualified with context: "2 new leads overnight: (1) Sarah Chen, Event Hero referral, asking about website rebuild — matches your $7-15k web projects, recommend booking a call. (2) Newsletter signup from john@random.com — low quality, auto-archived." Andy replies "Book Sarah". BitBit creates the Calendly booking, sends the link, creates the Asana task, and logs it all.

---

## PHASE 2: Agent Infrastructure
**Timeline**: Week 5-6 | **Effort**: ~3-5 days
**Goal**: Shared agent infrastructure that all 10 agents depend on

### 1A: Database Migrations (PRD Section 5 tables)

| ID | Task | Effort | Owner | Priority | Notes |
|----|------|--------|-------|----------|-------|
| 1.1 | Write migration 005_agent_configs.sql | 1 hr | Tor | CRITICAL | All agents need config storage |
| 1.2 | Write migration 006_agent_runs.sql | 1 hr | Tor | CRITICAL | Execution logging, token tracking |
| 1.3 | Write migration 007_leads.sql | 1 hr | Tor | HIGH | Lead Swarm needs this |
| 1.4 | Write migration 008_invoices.sql | 1 hr | Tor | HIGH | Invoice Flow needs this |
| 1.5 | Write migration 009_watches.sql | 45 min | Tor | HIGH | Sentry agent needs this |
| 1.6 | Write migration 010_templates_voices.sql | 1 hr | Tor | MEDIUM | Templates + voice_profiles tables |
| 1.7 | Write migration 011_proposals.sql | 45 min | Tor | MEDIUM | Proposal Bot (Phase 2) |
| 1.8 | Write migration 012_offer_packages.sql | 30 min | Tor | LOW | Ad Script Gen (Phase 3) |
| 1.9 | Write migration 013_contacts_enhancements.sql | 30 min | Tor | MEDIUM | Add lead_score, lifetime_value, preferred_channel, tags to contacts |
| 1.10 | Add RLS policies for all new tables | 2 hr | Tor | CRITICAL | org_id scoping on every table |

### 1B: Agent Runtime Infrastructure

| ID | Task | Effort | Owner | Depends On | Priority |
|----|------|--------|-------|------------|----------|
| 1.11 | Implement agent-registry (self-registration pattern) | 4 hr | Tor | 1.1 | CRITICAL |
| 1.12 | Implement confidence routing (act >0.85 / ask 0.55-0.85 / escalate <0.55) | 3 hr | Tor | — | CRITICAL |
| 1.13 | Implement policy engine (load rules.md → runtime enforcement) | 4 hr | Tor | — | CRITICAL |
| 1.14 | Build shared tool system (CRUD tools all agents access) | 3 hr | Tor | 1.1-1.10 | CRITICAL |
| 1.15 | Agent execution scheduler (cron triggers via Vercel Cron) | 3 hr | Tor | 1.11 | HIGH |
| 1.16 | Agent approval flow API (act/ask/escalate → dashboard + WhatsApp) | 4 hr | Tor | 1.12 | HIGH |
| 1.17 | Agent run logging (tokens, cost, actions, confidence) | 2 hr | Tor | 1.2 | HIGH |
| 1.18 | Dashboard: Agent management page (enable/disable, config, logs) | 4 hr | Tor | 1.11, 1.17 | MEDIUM |
| 1.18a | Dashboard: Real-time agent status indicators in sidebar | 2 hr | Tor | 1.11 | MEDIUM |
| 1.18b | Dashboard: Approval queue UI (pending agent actions with approve/reject) | 3 hr | Tor | 1.16 | HIGH |

### 1C: Fix @bitbit/core Package

| ID | Task | Effort | Owner | Priority | Notes |
|----|------|--------|-------|----------|-------|
| 1.19 | Audit @bitbit/core index.ts exports vs actual files | 30 min | Tor | HIGH | |
| 1.20 | Decision: implement missing modules OR remove broken exports | 15 min | Tor | HIGH | Recommend: remove broken exports, keep working code in personal-assistant/ |
| 1.21 | Fix index.ts to only export what exists (types.ts) | 30 min | Tor | HIGH | Unblocks monorepo npm install |
| 1.22 | Verify monorepo workspace resolution | 15 min | Tor | HIGH | 1.21 |

### 1D: Supabase Dependency Injection Refactor (Architectural Risk)

| ID | Task | Effort | Owner | Priority | Notes |
|----|------|--------|-------|----------|-------|
| 1.23 | Design DI pattern for Supabase client (context-based injection) | 2 hr | Tor | CRITICAL | Currently module-level import — blocks multi-tenant |
| 1.24 | Refactor engine.ts to accept Supabase client via context | 3 hr | Tor | CRITICAL | 1.23 |
| 1.25 | Refactor all tools to receive Supabase from context (not import) | 4 hr | Tor | CRITICAL | 1.24 — touches every tool file |
| 1.26 | Add org_id scoping to all DB queries in tools | 2 hr | Tor | CRITICAL | 1.25 — multi-tenant isolation |
| 1.27 | Add confidence score to agent handler return type | 1 hr | Tor | HIGH | Currently missing — blocks act/ask/escalate routing |

### Phase 1 Decision Point
**Deploy personal-assistant/ directly vs migrate to packages/dashboard?**
- Recommendation: **Deploy personal-assistant/ directly.** Migration to packages/dashboard is weeks of work with zero user-visible benefit. Do it later when the monorepo actually has multiple deployable packages.

---

## PHASE 2: First Agents (P0 Agents)
**Timeline**: Week 3-4 | **Effort**: ~2-3 weeks
**Goal**: Sentry, Lead Swarm, and Invoice Flow running on real AWU data

### 2A: Sentry Agent (Background Monitor)

| ID | Task | Effort | Owner | Depends On | Priority |
|----|------|--------|-------|------------|----------|
| 2.1 | Port sentry.py concepts to TypeScript platform agent | 6 hr | Tor | 1.11, 1.5 | CRITICAL |
| 2.2 | Implement watch CRUD API (create, list, pause, delete watches) | 3 hr | Tor | 2.1 | CRITICAL |
| 2.3 | Implement Gemini Flash polling loop (cheap background checks) | 4 hr | Tor | 2.1 | CRITICAL |
| 2.4 | Notification routing (email, WhatsApp, dashboard alert) | 3 hr | Tor | 2.1 | HIGH |
| 2.5 | Escalation chains (if no ack in N min → escalate) | 2 hr | Tor | 2.4 | MEDIUM |
| 2.6 | Dashboard: Watches management UI | 3 hr | Tor | 2.2 | MEDIUM |
| 2.7 | Seed AWU default watches (new lead, invoice overdue, negative sentiment) | 1 hr | Tor | 2.2 | HIGH |
| **Model**: Gemini Flash (cheapest — $0.50-2/mo) | | | | |

### 2B: Lead Swarm Agent

| ID | Task | Effort | Owner | Depends On | Priority |
|----|------|--------|-------|------------|----------|
| 2.8 | Implement lead classification (lead/client/spam/personal) | 4 hr | Tor | 1.3, 1.14 | CRITICAL |
| 2.9 | Implement lead qualification (budget, service match, location, timeline) | 4 hr | Tor | 2.8 | CRITICAL |
| 2.10 | Lead scoring (hot/warm/cold) based on engagement signals | 3 hr | Tor | 2.9 | HIGH |
| 2.11 | Auto-acknowledge within 2 min (draft → approve flow initially) | 3 hr | Tor | 2.9, 1.16 | HIGH |
| 2.12 | Calendly booking integration for qualified leads | 4 hr | Tor | 2.9, 3.5 | HIGH |
| 2.13 | Asana task creation for every qualified lead | 2 hr | Tor | 2.9, 3.3 | HIGH |
| 2.14 | Daily lead pipeline summary (to Andy via WhatsApp) | 2 hr | Tor | 2.10, 3.7 | MEDIUM |
| 2.15 | Follow-up sequences for warm leads that don't book | 3 hr | Tor | 2.10 | MEDIUM |
| 2.16 | Dashboard: Leads Pipeline page (kanban: New→Qualified→Booked→Won/Lost) | 6 hr | Tor | 1.3 | HIGH |
| 2.17 | Escalate high-value leads (>$5k) directly to Andy | 1 hr | Tor | 2.10, 1.16 | HIGH |
| **Model**: Haiku (classification) + Sonnet (qualification/drafting) | | | | |

### 2C: Invoice Flow Agent

| ID | Task | Effort | Owner | Depends On | Priority |
|----|------|--------|-------|------------|----------|
| 2.18 | Invoice data model + CRUD API | 3 hr | Tor | 1.4 | CRITICAL |
| 2.19 | PDF generation with branded templates (AWU, Torkay, white-label) | 6 hr | Tor | 2.18 | CRITICAL |
| 2.20 | Configurable payment terms (7/14/30 day) | 1 hr | Tor | 2.18 | HIGH |
| 2.21 | Multiple bank account support | 1 hr | Tor | 2.18 | HIGH |
| 2.22 | Send invoice via email with PDF attachment | 3 hr | Tor | 2.19 | CRITICAL |
| 2.23 | Invoice status tracking (draft→sent→viewed→overdue→paid) | 2 hr | Tor | 2.18 | HIGH |
| 2.24 | Automated payment reminders (Day 1 friendly, Day 7 firm, Day 14 final) | 3 hr | Tor | 2.23 | MEDIUM |
| 2.25 | Stripe payment link generation | 3 hr | Tor | 2.18, 3.8 | MEDIUM |
| 2.26 | Duplicate detection (CRITICAL — never send same invoice twice) | 2 hr | Tor | 2.22 | CRITICAL |
| 2.27 | Dashboard: Invoices page (list, status, overdue alerts, revenue chart) | 6 hr | Tor | 2.18 | HIGH |
| 2.28 | Monthly revenue reporting and forecasting | 3 hr | Tor | 2.23 | LOW |
| **Model**: Haiku (triggers) + Sonnet (generation) | | | | |

---

## PHASE 3: Channel Integrations
**Timeline**: Week 3-6 (parallel with Phase 2) | **Effort**: ~2-3 weeks
**Goal**: Connect Andy's real channels to the platform

### P0 Channels (Required for first agents)

| ID | Task | Effort | Owner | Depends On | Priority | Vercel OK? |
|----|------|--------|-------|------------|----------|------------|
| 3.1 | Gmail adapter: test IMAP on Vercel serverless (or migrate to Gmail API) | 4 hr | Tor | 0.15 | HIGH | Risk — 30s timeout. Consider Gmail API (OAuth) instead |
| 3.1a | **Rebuild Outlook adapter** (BROKEN — reads local cache, not IMAP) | 8 hr | Tor | — | CRITICAL | Current reads `~/.agent/cache/outlook-emails.json`. Rebuild with Microsoft Graph API (OAuth2 + webhooks). Requires Azure AD app registration |
| 3.3 | **Asana REST API adapter** (replace MCP-only approach) | 6 hr | Tor | — | CRITICAL | Yes |
| 3.4 | Asana: Andy provides PAT from allwebbedup.com.au workspace | 5 min | Andy | — | CRITICAL | — |
| 3.5 | **Calendly API adapter** (list events, create bookings, webhooks) | 6 hr | Tor | — | HIGH | Yes |
| 3.6 | Calendly: Andy provides API key | 5 min | Andy | — | HIGH | — |
| 3.7 | **WhatsApp Business API adapter** (Cloud API, not on-premises) | 12 hr | Tor | 3.9-3.12 | CRITICAL | Yes |
| 3.8 | **Stripe adapter** (webhooks for payment events, payment links) | 6 hr | Tor | — | HIGH | Yes |
| 3.9 | Stripe: Fix identity verification (payouts paused since Jan 31) | 15 min | Tor | — | CRITICAL BLOCKER | — |

### WhatsApp Setup (Critical Path — 3-14 day blocker)

| ID | Task | Effort | Owner | Depends On | Priority |
|----|------|--------|-------|------------|----------|
| 3.10 | Create Meta Business Account (or use Andy's existing) | 30 min | Andy+Tor | — | CRITICAL |
| 3.11 | Meta Business Verification submission | 1 hr | Andy+Tor | 3.10 | CRITICAL |
| 3.12 | Wait for Meta Business Verification (3-14 days) | BLOCKER | — | 3.11 | CRITICAL |
| 3.13 | Create WhatsApp Business App in Meta Developer portal | 30 min | Tor | 3.12 | CRITICAL |
| 3.14 | Phone number strategy: new dedicated number (recommended) | 15 min | Andy | — | HIGH |
| 3.15 | WhatsApp webhook handler (Vercel API route) | 4 hr | Tor | 3.13 | CRITICAL |
| 3.16 | WhatsApp message sending (text, templates, media) | 4 hr | Tor | 3.13 | CRITICAL |
| 3.17 | WhatsApp approval flow (Andy replies Y/N to agent requests) | 3 hr | Tor | 3.16 | HIGH |
| **Estimated WhatsApp cost**: $12-30 AUD/mo for Andy as sole user | | | | |

### P1 Channels (Second wave)

| ID | Task | Effort | Owner | Priority |
|----|------|--------|-------|----------|
| 3.18 | **ClickUp API adapter** (read tasks, sync status) | 4 hr | Tor | MEDIUM |
| 3.19 | ClickUp: Andy provides API token | 5 min | Andy | MEDIUM |
| 3.20 | **Google Search Console API adapter** (read performance data) | 4 hr | Tor | MEDIUM |
| 3.21 | **Google Analytics 4 API adapter** (read reports) | 4 hr | Tor | MEDIUM |
| 3.22 | **Cluely API adapter** (call transcripts, summaries) | 3 hr | Tor | MEDIUM |
| 3.23 | **WordPress REST API adapter** (CRUD pages, posts, plugins) | 4 hr | Tor | MEDIUM |

### P2 Channels (Future)

| ID | Task | Effort | Owner | Priority |
|----|------|--------|-------|----------|
| 3.24 | Facebook Messenger adapter (Meta Graph API) | 8 hr | Tor | LOW |
| 3.25 | Instagram DMs adapter (Instagram Graph API) | 8 hr | Tor | LOW |
| 3.26 | Slack adapter (Events API + Bot Token) | 6 hr | Tor | LOW |
| 3.27 | Xero/MYOB accounting adapter | 8 hr | Tor | LOW |
| 3.28 | Google Calendar API adapter (replace macOS osascript) | 4 hr | Tor | LOW |

### Channel Credentials Andy Must Provide

| Channel | What's Needed | How Long |
|---------|--------------|----------|
| Asana | Personal Access Token from allwebbedup.com.au | 5 min |
| Calendly | API key from account settings | 5 min |
| Stripe | Already have — need identity verification | 15 min |
| WhatsApp | Meta Business Account + verification | 3-14 days |
| ClickUp | API token from settings | 5 min |
| GSC | OAuth consent or service account key | 15 min |

---

## PHASE 4: Communication Agents (P1 Agents)
**Timeline**: Week 5-6 | **Effort**: ~2 weeks
**Goal**: Channel Triage and Client Comms running

### 4A: Channel Triage Agent

| ID | Task | Effort | Owner | Depends On | Priority |
|----|------|--------|-------|------------|----------|
| 4.1 | Message classification (actionable/informational/spam/personal) | 4 hr | Tor | 1.14 | HIGH |
| 4.2 | Priority scoring (critical/high/medium/low) | 3 hr | Tor | 4.1 | HIGH |
| 4.3 | Cross-channel deduplication (same topic in email + WhatsApp = 1 item) | 4 hr | Tor | 4.1 | HIGH |
| 4.4 | Entity resolution (link messages to known contacts) | 3 hr | Tor | 4.1 | HIGH |
| 4.5 | Auto-create tasks for actionable items | 2 hr | Tor | 4.1 | HIGH |
| 4.6 | Unified inbox view in dashboard | 6 hr | Tor | 4.1 | HIGH |
| 4.7 | Daily digest: "Here's what needs your attention today" | 3 hr | Tor | 4.1, 3.7 | MEDIUM |
| 4.8 | Weekly summary: communication patterns, response times | 3 hr | Tor | 4.7 | LOW |
| 4.9 | Thread tracking (waiting on you vs waiting on them) | 4 hr | Tor | 4.1 | MEDIUM |
| 4.9a | **Dashboard: Command Center page** (agent activity, active leads, pending approvals, today's priorities) | 8 hr | Tor | 1.18, 4.6 | HIGH |
| **Model**: Haiku (classification 70%) + Sonnet (summarization 30%) | | | | |

### 4B: Client Comms Agent

| ID | Task | Effort | Owner | Depends On | Priority |
|----|------|--------|-------|------------|----------|
| 4.10 | Voice profile system (load Andy/Tor/AWU voice from markdown) | 4 hr | Tor | 1.6 | HIGH |
| 4.11 | Draft email/message replies in correct voice | 4 hr | Tor | 4.10 | HIGH |
| 4.12 | Per-client communication profiles (preferred channel, tone, frequency) | 3 hr | Tor | 4.10 | MEDIUM |
| 4.13 | Template library for common comms (onboarding, milestone, payment) | 3 hr | Tor | 1.6 | MEDIUM |
| 4.14 | Automated weekly status updates to clients | 3 hr | Tor | 4.10 | MEDIUM |
| 4.15 | Meeting summary distribution (from Cluely transcripts) | 3 hr | Tor | 3.22 | LOW |
| 4.16 | Sentiment analysis on incoming client messages | 3 hr | Tor | 4.1 | MEDIUM |
| 4.17 | Contact enrichment (LinkedIn profiles, company info) | 4 hr | Tor | — | LOW |
| **Model**: Sonnet (drafting) + Haiku (classification) | | | | |

---

## PHASE 5: Revenue Agents (P2 Agents)
**Timeline**: Week 7-8 | **Effort**: ~2-3 weeks
**Goal**: Proposal Bot and Client Onboarding automated

### 5A: Proposal Bot

| ID | Task | Effort | Owner | Depends On | Priority |
|----|------|--------|-------|------------|----------|
| 5.1 | Scope document generation from brief inputs | 6 hr | Tor | 1.7, 1.14 | HIGH |
| 5.2 | Pricing template system with tier structures (Basic/Standard/Premium) | 4 hr | Tor | 5.1 | HIGH |
| 5.3 | Auto-calculate pricing from component library | 3 hr | Tor | 5.2 | HIGH |
| 5.4 | Professional PDF proposal generation (AWU branding) | 6 hr | Tor | 5.1 | HIGH |
| 5.5 | Proposal status tracking (draft→sent→viewed→accepted→declined) | 3 hr | Tor | 1.7 | HIGH |
| 5.6 | Cluely transcript ingestion for auto-extracting requirements | 4 hr | Tor | 3.22 | MEDIUM |
| 5.7 | Follow-up sequences for sent proposals | 2 hr | Tor | 5.5 | MEDIUM |
| 5.8 | Dashboard: Proposals pipeline page | 5 hr | Tor | 5.5 | HIGH |
| 5.9 | NDA/contract generation from accepted proposals | 4 hr | Tor | 5.5 | LOW |
| **Model**: Opus (strategy/pricing) + Sonnet (document generation) | | | | |

### 5B: Client Onboarding Agent

| ID | Task | Effort | Owner | Depends On | Priority |
|----|------|--------|-------|------------|----------|
| 5.10 | Trigger on deal acceptance (from Proposal Bot or manual) | 2 hr | Tor | 5.5 | HIGH |
| 5.11 | Auto-create Asana project from template (by project type) | 4 hr | Tor | 3.3 | HIGH |
| 5.12 | Welcome email package (intro, timeline, what we need) | 3 hr | Tor | 4.10 | HIGH |
| 5.13 | Credential request workflow (hosting, DNS, CMS, analytics) | 3 hr | Tor | 5.12 | HIGH |
| 5.14 | GSC + Analytics access setup | 3 hr | Tor | 3.20, 3.21 | MEDIUM |
| 5.15 | Schedule kickoff call via Calendly | 1 hr | Tor | 3.5 | MEDIUM |
| 5.16 | Onboarding completion checklist tracking | 2 hr | Tor | 5.10 | MEDIUM |
| **Model**: Sonnet (document generation) + Haiku (status tracking) | | | | |

---

## PHASE 6: Growth Agents (P3 Agents)
**Timeline**: Week 9-12 | **Effort**: ~3-4 weeks
**Goal**: Ad Script Gen, AI Search Optimizer, and Tender Hunter

### 6A: Ad Script Generator

| ID | Task | Effort | Owner | Depends On | Priority |
|----|------|--------|-------|------------|----------|
| 6.1 | Offer package ingestion (service descriptions, pricing, USPs) | 3 hr | Tor | 1.8 | MEDIUM |
| 6.2 | Competitor ad research integration (Facebook Ad Library) | 6 hr | Tor | — | MEDIUM |
| 6.3 | Video script generation (hook variations: curiosity, problem-agitation, social proof) | 6 hr | Tor | 6.1 | MEDIUM |
| 6.4 | Platform adaptation (Reels 15s, TikTok 30s, Shorts 60s, Feed 15-30s) | 3 hr | Tor | 6.3 | MEDIUM |
| 6.5 | A/B variations (3-5 hook variants per core script) | 2 hr | Tor | 6.3 | LOW |
| 6.6 | Storyboard generation with shot descriptions | 3 hr | Tor | 6.3 | LOW |
| **Model**: Opus (creative) + Sonnet (variations) | | | | |

### 6B: AI Search Optimizer

| ID | Task | Effort | Owner | Depends On | Priority |
|----|------|--------|-------|------------|----------|
| 6.7 | AI visibility audit tool (query ChatGPT/Gemini/Perplexity/Claude) | 8 hr | Tor | — | MEDIUM |
| 6.8 | AI-optimized content generation (structured data, Q&A, entity markup) | 6 hr | Tor | 6.7 | MEDIUM |
| 6.9 | Monitoring: track AI search mentions over time | 4 hr | Tor | 6.7 | MEDIUM |
| 6.10 | Reports: AI visibility vs competitors | 4 hr | Tor | 6.9 | LOW |
| 6.11 | Schema markup optimization for AI consumption | 3 hr | Tor | 6.8 | LOW |
| **Model**: Sonnet (content) + Haiku (monitoring) | | | | |
| **Market opportunity**: Low competition, $2k/mo service, first-mover advantage in AU | | | | |

### 6C: Tender Hunter

| ID | Task | Effort | Owner | Depends On | Priority |
|----|------|--------|-------|------------|----------|
| 6.12 | Write migration for tenders + capability_profiles + tender_templates | 2 hr | Tor | — | MEDIUM |
| 6.13 | AusTender scraper/API integration | 8 hr | Tor | 6.12 | MEDIUM |
| 6.14 | QTenders (QLD) + NSW eTendering scrapers | 8 hr | Tor | 6.13 | MEDIUM |
| 6.15 | Tender filtering (match AWU capabilities) | 4 hr | Tor | 6.13 | MEDIUM |
| 6.16 | Requirement extraction + compliance checking | 6 hr | Tor | 6.15 | MEDIUM |
| 6.17 | Tender response draft generation | 8 hr | Tor | 6.16 | MEDIUM |
| 6.18 | Submission deadline tracking | 2 hr | Tor | 6.15 | MEDIUM |
| 6.19 | Tender fit scoring (effort vs contract value) | 3 hr | Tor | 6.15 | LOW |
| **Model**: Opus (response generation) + Sonnet (extraction) + Haiku (monitoring) | | | | |
| **Market opportunity**: $1-2k/mo vs $2-30k tender consultants. 99%+ margin. | | | | |

---

## PHASE 7: Infrastructure Evolution
**Timeline**: Ongoing, scaling with client count

### 7A: Phase 1 Infrastructure ($4/mo new)

| ID | Task | Effort | Owner | Priority | Monthly Cost |
|----|------|--------|-------|----------|-------------|
| 7.1 | Vercel deployment (existing Pro plan) | Done (Phase 0) | Tor | — | $20 (existing) |
| 7.2 | Supabase project creation (existing Pro plan) | Done (Phase 0) | Tor | — | $25 (existing) |
| 7.3 | Hetzner CX22 VPS setup (Docker, cron, headless Chrome) | 2 hr | Tor | HIGH | $4/mo |
| 7.4 | VPS: Install Docker + Docker Compose | 30 min | Tor | HIGH | — |
| 7.5 | VPS: Set up cron jobs for agent polling | 1 hr | Tor | HIGH | — |
| 7.6 | VPS: Install headless Chromium for browser scraping | 30 min | Tor | MEDIUM | — |
| 7.7 | VPS: Configure firewall + SSH hardening | 30 min | Tor | HIGH | — |

### 7B: Phase 2 Infrastructure ($45/mo, 3-10 clients)

| ID | Task | Effort | Owner | Priority | Monthly Cost |
|----|------|--------|-------|----------|-------------|
| 7.8 | Fly.io setup (2-3 agent worker machines) | 2 hr | Tor | MEDIUM | $10/mo |
| 7.9 | Trigger.dev Hobby (task orchestration, retries, scheduling) | 2 hr | Tor | MEDIUM | $10/mo |
| 7.10 | Cloudflare Workers (edge cron, cheap polling) | 1 hr | Tor | MEDIUM | $5/mo |
| 7.11 | Monitoring: error tracking (Sentry.io or similar) | 2 hr | Tor | MEDIUM | Free tier |
| 7.12 | Monitoring: agent cost tracking dashboard | 4 hr | Tor | MEDIUM | — |
| 7.13 | Monitoring: uptime checks | 1 hr | Tor | MEDIUM | Free tier |

### 7C: CI/CD Pipeline

| ID | Task | Effort | Owner | Priority |
|----|------|--------|-------|----------|
| 7.14 | GitHub Actions: build + type check on PR | 2 hr | Tor | MEDIUM |
| 7.15 | GitHub Actions: run tests on PR | 2 hr | Tor | MEDIUM |
| 7.16 | Vercel preview deployments for PRs | 30 min | Tor | MEDIUM |
| 7.17 | Database migration automation (CI-triggered) | 2 hr | Tor | LOW |

### 7D: Security & Secrets

| ID | Task | Effort | Owner | Priority |
|----|------|--------|-------|----------|
| 7.18 | 1Password integration for all secrets | 1 hr | Tor | HIGH |
| 7.19 | Environment variable management across Vercel/Fly.io/VPS | 1 hr | Tor | HIGH |
| 7.20 | API key rotation strategy | 1 hr | Tor | MEDIUM |
| 7.21 | Supabase RLS audit (verify org isolation) | 2 hr | Tor | HIGH |

---

## PHASE 8: Business, GTM & Revenue
**Timeline**: Parallel track, Month 1-9+

### 8A: Legal & Business Setup (Month 1)

| ID | Task | Effort | Owner | Priority |
|----|------|--------|-------|----------|
| 8.1 | Decision: new entity for BitBit or under existing (Torkay/AWU)? | — | Both | CRITICAL |
| 8.2 | 50/50 equity agreement (written, signed) | 4 hr | Both | CRITICAL |
| 8.3 | IP ownership documentation | 2 hr | Both | CRITICAL |
| 8.4 | ABN/ACN registration for BitBit (if new entity) | 1 hr | Both | HIGH |
| 8.5 | Terms of service + privacy policy | 4 hr | Tor | HIGH |
| 8.6 | Client service agreement template | 2 hr | Both | HIGH |

### 8B: First Revenue (Month 1-2)

| ID | Task | Effort | Owner | Priority | Notes |
|----|------|--------|-------|----------|-------|
| 8.7 | Fix Stripe identity verification (payouts paused!) | 15 min | Tor | CRITICAL BLOCKER | |
| 8.8 | Andy's first invoice ($200/mo founder deal) | 30 min | Tor | HIGH | Growth equivalent at 43% discount |
| 8.9 | Service agreement with Andy/AWU | 1 hr | Both | HIGH | |
| 8.10 | Set up Stripe subscription for Andy ($200/mo) | 30 min | Tor | HIGH | |
| 8.11 | Banking setup (BitBit revenue account) | 1 hr | Both | HIGH | |

### 8C: Beta Program (Month 3-6)

| ID | Task | Effort | Owner | Priority |
|----|------|--------|-------|----------|
| 8.12 | AWU case study document (before/after metrics) | 4 hr | Both | HIGH |
| 8.13 | Beta onboarding flow design | 6 hr | Tor | HIGH |
| 8.14 | Pricing page creation (4 tiers: $199-$999+) | 4 hr | Tor | HIGH |
| 8.15 | Agency targeting list from Andy's network | 2 hr | Andy | HIGH |
| 8.16 | Beta outreach emails (5-10 agencies) | 2 hr | Andy | HIGH |
| 8.17 | Self-serve org creation (multi-tenant signup) | 8 hr | Tor | HIGH |
| 8.18 | Referral/affiliate program design | 3 hr | Both | MEDIUM |

### 8D: Public Launch Prep (Month 6-9)

| ID | Task | Effort | Owner | Priority |
|----|------|--------|-------|----------|
| 8.19 | Marketing website (bitbit.com.au) | 16 hr | Tor | HIGH |
| 8.20 | Self-serve signup + Stripe checkout flow | 8 hr | Tor | HIGH |
| 8.21 | Demo environment for prospects | 4 hr | Tor | HIGH |
| 8.22 | Sales collateral (pitch deck, one-pagers) | 4 hr | Andy+Tor | MEDIUM |
| 8.23 | Content marketing (blog, social) | Ongoing | Andy | MEDIUM |
| 8.24 | MRR dashboard + analytics | 4 hr | Tor | HIGH |
| 8.24a | **Dashboard: Analytics page** (token usage, agent cost tracking, performance metrics, ROI per client) | 4 hr | Tor | HIGH |
| 8.25 | Churn tracking + retention workflows | 3 hr | Tor | MEDIUM |

### Revenue Projections

| Milestone | Clients | MRR | Timeline |
|-----------|---------|-----|----------|
| First invoice | 1 (Andy) | $200 | Month 1 |
| Beta start | 3-5 | $1,000-1,500 | Month 3 |
| Beta full | 5-10 | $2,500-5,000 | Month 6 |
| Public launch | 10-20 | $5,000-8,000 | Month 9 |
| Scale | 20+ | $15,000+ | Month 12 |

### Margins

| Usage Tier | COGS/client | Margin @ $200/mo | Margin @ $349/mo |
|-----------|-------------|-----------------|-----------------|
| Low | $51 | 74.5% | 85.4% |
| Medium | $65 | 67.7% | 81.4% |
| High | $106 | 47.2% | 69.7% |

---

## PHASE 9: Testing Infrastructure
**Timeline**: Ongoing from Week 2

| ID | Task | Effort | Owner | Priority |
|----|------|--------|-------|----------|
| 9.1 | Unit test setup (Vitest for TypeScript) | 2 hr | Tor | HIGH |
| 9.2 | Agent testing framework (mock tools, mock channels) | 6 hr | Tor | HIGH |
| 9.3 | Integration test patterns (Supabase test helpers) | 4 hr | Tor | MEDIUM |
| 9.4 | Channel adapter test suite (mock IMAP, mock APIs) | 4 hr | Tor | MEDIUM |
| 9.5 | E2E test setup (Playwright for dashboard) | 4 hr | Tor | LOW |
| 9.6 | CI integration (tests on PR) | 2 hr | Tor | MEDIUM |

---

## Master Timeline

```
WEEK 1-2: Phase 0 (Deploy) + Phase 1A (Migrations)
           ├── Deploy dashboard to Vercel (2.5 hrs)
           ├── Write 9 new migrations (8 hrs)
           └── Start Meta Business Verification for WhatsApp (3-14 day wait)

WEEK 2-3: Phase 1B-C (Agent Infrastructure + Core Fix)
           ├── Agent registry, confidence routing, policy engine (16 hrs)
           ├── Fix @bitbit/core exports (1 hr)
           └── Test setup (2 hrs)

WEEK 3-4: Phase 2 (First Agents) + Phase 3 (Channels)
           ├── Sentry agent (16 hrs)
           ├── Lead Swarm agent (24 hrs)
           ├── Invoice Flow agent (28 hrs)
           ├── Asana adapter (6 hrs)
           ├── Calendly adapter (6 hrs)
           └── WhatsApp adapter (12 hrs, depends on Meta verification)

WEEK 5-6: Phase 4 (Communication Agents)
           ├── Channel Triage agent (32 hrs)
           └── Client Comms agent (24 hrs)

WEEK 7-8: Phase 5 (Revenue Agents)
           ├── Proposal Bot (32 hrs)
           └── Client Onboarding (16 hrs)

WEEK 9-12: Phase 6 (Growth Agents)
            ├── Ad Script Generator (24 hrs)
            ├── AI Search Optimizer (24 hrs)
            └── Tender Hunter (40 hrs)

ONGOING:   Phase 7 (Infrastructure) + Phase 8 (GTM) + Phase 9 (Testing)
```

---

## Cost Summary

### Infrastructure Costs by Phase

| Phase | Monthly Cost | What |
|-------|-------------|------|
| Phase 0-1 (Launch) | $49/mo ($4 new) | Vercel $20 + Supabase $25 + Hetzner $4 |
| Phase 2 (3-10 clients) | ~$70/mo | + Fly.io $10 + Trigger.dev $10 + CF Workers $5 |
| Phase 3 (10+ clients) | ~$160/mo | + Fly.io scale + Trigger.dev Pro + Hyperbrowser |

### API Costs per Client (from cost breakdown doc)

| Usage | Monthly API Cost | At $200/mo revenue | Margin |
|-------|-----------------|-------------------|--------|
| Low | $4.44 | $195.56 profit | 97.8% |
| Medium | $18.03 | $181.97 profit | 91.0% |
| High | $59.26 | $140.74 profit | 70.4% |

### Break-Even

- Infrastructure break-even: 1 client at $200/mo covers $49/mo infra
- Profitable from Day 1 of Andy's $200/mo subscription

---

## Immediate Next Actions (Priority Order)

### Week 1: Get It Running
1. **Fix Anthropic API billing** — 5 min, unblocks everything
2. **Fix Stripe identity verification** — 15 min, unblocks payouts
3. **Create Supabase project + run migrations** — 25 min
4. **Write AWU seed SQL + create Andy's account** — 30 min
5. **Deploy to Vercel** — 15 min
6. **Start Meta Business Verification for WhatsApp** — 3-14 day wait, start NOW
7. **Get credentials from Andy** (Asana PAT, Calendly key, ClickUp token) — 5 min each

### Week 2-4: Build The Brain (Phase 1 — THE MOAT)
8. **Design entity-relationship schema** — the graph structure that lets BitBit understand "Sezer = White House RE = 6 tasks = $200" — 4 hrs
9. **Write entity graph + timeline + semantic memory migrations** — 6 hrs
10. **Port context assembler from personal AGI** — the most important code in the entire system — 8 hrs
11. **Build entity resolution (5-step fuzzy match)** — 4 hrs
12. **Replace keyword classifier with LLM classification (Gemini Flash + context briefing)** — 6 hrs
13. **Build channel relay daemon** — always-on intelligence layer — 8 hrs
14. **Wire policy + voice profile loading into runtime** — 6 hrs
15. **Replace dumb prompt builder with context-assembled prompt builder** — 6 hrs

### Week 4-5: Build The Mouth (Phase 1.5)
16. **WhatsApp natural language command parser** — 6 hrs
17. **Voice note transcription pipeline** — 4 hrs
18. **Approval flow via WhatsApp** — 3 hrs
19. **Mobile-responsive dashboard** — 6 hrs
20. **Morning briefing + proactive alerts** — 6 hrs

### Week 5+: Build The Agents
21. **Rebuild Outlook adapter** — BROKEN (reads local cache, not IMAP). Rewrite with Microsoft Graph API — 8 hrs
22. **Supabase DI refactor** — module-level client blocks multi-tenant — 12 hrs
23. **Write agent infrastructure** (registry, confidence routing, policy engine) — 16 hrs
24. **Build first 3 agents** (Sentry, Lead Swarm, Invoice Flow) — 68 hrs

---

## Task Count Summary

| Phase | Tasks | Est. Hours | Why This Order |
|-------|-------|-----------|----------------|
| Phase 0: Deploy | 29 | ~8 hrs | Get a working demo Andy can see |
| **Phase 1: Semantic Context Engine** | **28** | **~90 hrs** | **THE BRAIN — everything depends on this** |
| **Phase 1.5: Conversational Interface** | **19** | **~38 hrs** | **THE MOUTH — how users actually interact** |
| Phase 2: Agent Infrastructure | 30 | ~47 hrs | Registry, routing, scheduling for all agents |
| Phase 3: First Agents (Sentry, Lead Swarm, Invoice Flow) | 28 | ~68 hrs | First value delivery |
| Phase 4: Channels (incl. Outlook rebuild) | 29 | ~88 hrs | Connect real data sources |
| Phase 5: Comms Agents (incl. Command Center) | 18 | ~48 hrs | Channel Triage + Client Comms |
| Phase 6: Revenue Agents | 16 | ~48 hrs | Proposal Bot + Onboarding |
| Phase 7: Growth Agents | 19 | ~65 hrs | Ad Script, AI Search, Tender Hunter |
| Phase 8: Infrastructure Evolution | 21 | ~25 hrs | Scaling infrastructure |
| Phase 9: GTM & Revenue (incl. Analytics page) | 26 | ~74 hrs | Business setup + public launch |
| Phase 10: Testing | 6 | ~22 hrs | Ongoing from Phase 2 |
| **TOTAL** | **~269 tasks** | **~621 hrs** |

At 40 hrs/week focused dev: ~15.5 weeks. The extra 3 weeks vs the original 12-week plan is the Semantic Context Engine — but it's what makes BitBit an AGI instead of a chatbot.

### Critical Path
```
Phase 0 (Deploy, 1 week)
  → Phase 1 (Semantic Brain, 2-3 weeks) ← THIS IS THE MOAT
    → Phase 1.5 (WhatsApp Bot + Dashboard UX, 1 week)
      → Phase 2 (Agent Infra, 1 week)
        → Phase 3+4 in parallel (Agents + Channels, 3 weeks)
          → Phase 5-7 (remaining agents + infra, 4 weeks)
```

### Effort Cross-Reference (Agent Research Findings)
- Agent development alone: ~45 dev-days (~360 hrs) per agent researcher
- Monorepo + code architecture: ~50-70 hrs per code researcher
- Semantic context engine: ~90 hrs (new — most critical investment)
- Infrastructure: ~40 hrs across all phases per infra researcher

---

*This roadmap is a living document. Update as tasks complete and priorities shift.*
