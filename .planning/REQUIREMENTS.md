# Requirements: BitBit AWU

**Defined:** 2026-02-19
**Core Value:** BitBit understands the business better than the business owner — contextually intelligent AI that knows who, what, when, and how much across all channels.

## v1 Requirements

Requirements for Milestone 1. Each maps to roadmap phases.

### Platform Foundation

- [ ] **PLAT-01**: Supabase project created (bitbit-awu, ap-southeast-2) with auth configured
- [ ] **PLAT-02**: 4 existing migrations run (core schema, RLS, seed defaults, channels)
- [ ] **PLAT-03**: AWU org seed SQL written and run (from config.ts)
- [ ] **PLAT-04**: Andy's auth user created with profile linked to AWU org
- [ ] **PLAT-05**: 6 AWU client contacts seeded
- [ ] **PLAT-06**: Vercel deployment with env vars (Supabase URL/keys, Anthropic key)
- [ ] **PLAT-07**: Domain bitbit.com.au pointed to Vercel with SSL
- [ ] **PLAT-08**: Smoke test passes (login, kanban, chat, contacts, activity)
- [ ] **PLAT-09**: Sample kanban tasks seeded for demo richness
- [x] **PLAT-10**: Anthropic API billing fixed (card updated) — HUMAN TASK (Andy)
- [x] **PLAT-11**: Stripe identity verification fixed (payouts unblocked) — HUMAN TASK (Andy)
- [x] **PLAT-12**: Meta Business Verification submitted (WhatsApp prep) — HUMAN TASK (Andy)

### Semantic Context Engine

- [ ] **SCTX-01**: Entity-relationship schema designed (contacts → projects → tasks → invoices → channels → messages)
- [ ] **SCTX-02**: Migration: entity_relationships table (entity_a, entity_b, relationship_type, metadata, strength)
- [ ] **SCTX-03**: Migration: entity_timeline table (entity_id, event_type, event_data, channel_source, timestamp)
- [ ] **SCTX-04**: Migration: semantic_memories table (org_id, entity_ids[], category, content, confidence, source_events[])
- [ ] **SCTX-05**: Relationship auto-linker (task/contact/invoice CRUD → auto-create entity_relationships)
- [ ] **SCTX-06**: Timeline writer (every channel message, task update, invoice event → entity_timeline entry)
- [ ] **SCTX-07**: Context assembler ported from personal AGI to TypeScript
- [ ] **SCTX-08**: Entity resolution: 5-step fuzzy match (exact alias → email → phone → partial name → phone variants)
- [ ] **SCTX-09**: Cross-reference engine (given entity → related tasks, waiting-for, deadlines, financial signals)

### Agent Infrastructure

- [ ] **AGNT-01**: Migration 005_agent_configs.sql
- [ ] **AGNT-02**: Migration 006_agent_runs.sql
- [ ] **AGNT-03**: Migration 007_leads.sql
- [ ] **AGNT-04**: Migration 008_invoices.sql
- [ ] **AGNT-05**: Migration 009_watches.sql
- [ ] **AGNT-06**: Migration 010_templates_voices.sql
- [ ] **AGNT-07**: Migration 011_proposals.sql
- [ ] **AGNT-08**: Migration 012_offer_packages.sql
- [ ] **AGNT-09**: Migration 013_contacts_enhancements.sql
- [ ] **AGNT-10**: RLS policies for all new tables (org_id scoping)
- [ ] **AGNT-11**: Agent registry with self-registration pattern
- [ ] **AGNT-12**: Confidence routing (act >0.85 / ask 0.55-0.85 / escalate <0.55)
- [ ] **AGNT-13**: Shared CRUD tool system for all agents
- [x] **AGNT-14**: Fix @bitbit/core (audit exports, remove broken refs, verify monorepo resolution)

## v2 Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Semantic Context Engine (Differentiators)

- **SCTX-10**: LLM-based channel classification (Gemini Flash + context briefing)
- **SCTX-11**: Action router (immediate/queue/batch/skip based on significance + urgency)
- **SCTX-12**: Channel relay daemon (poll → buffer → classify → route → write)
- **SCTX-13**: Reflection agent (extract learnable facts after significant events)
- **SCTX-14**: Memory consolidation (merge/supersede outdated memories)
- **SCTX-15**: Policy + voice profile runtime loading from database
- **SCTX-16**: Context-assembled prompt builder (selective, budgeted, entity-aware)

### Agent Infrastructure (Differentiators)

- **AGNT-15**: Policy engine (rules.md → runtime enforcement)
- **AGNT-16**: Agent execution scheduler (cron triggers)
- **AGNT-17**: Approval flow API (act/ask/escalate → dashboard + WhatsApp)
- **AGNT-18**: Agent run logging (tokens, cost, actions, confidence)
- **AGNT-19**: Supabase DI refactor (module-level client → context-based injection)
- **AGNT-20**: Dashboard: agent management page + approval queue UI

### Conversational Interface (Phase 1.5)

- **CONV-01**: WhatsApp natural language command parser
- **CONV-02**: Multi-turn conversation manager
- **CONV-03**: Voice note transcription pipeline
- **CONV-04**: Proactive morning briefing via WhatsApp
- **CONV-05**: Approval flow via WhatsApp
- **CONV-06**: Mobile-responsive dashboard
- **CONV-07**: Command Center as default landing page

### First Agents (Phase 3)

- **AGTS-01**: Sentry agent (background monitor with watches)
- **AGTS-02**: Lead Swarm agent (classify, qualify, score, acknowledge, book)
- **AGTS-03**: Invoice Flow agent (generate, send, track, remind)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time chat | High complexity, not core to agency operations value |
| Video posts | Storage/bandwidth costs, not relevant |
| Mobile native app | Web-first, mobile-responsive later |
| OAuth login (Google/GitHub) | Email/password sufficient for v1 |
| Migrate to packages/dashboard | Weeks of work with zero user-visible benefit |
| Zep Cloud / LangGraph | Over-engineered for v1; evaluate Zep for v2 multi-tenant scale |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLAT-01 | Phase 1 — Platform Deploy | Pending |
| PLAT-02 | Phase 1 — Platform Deploy | Pending |
| PLAT-03 | Phase 1 — Platform Deploy | Pending |
| PLAT-04 | Phase 1 — Platform Deploy | Pending |
| PLAT-05 | Phase 1 — Platform Deploy | Pending |
| PLAT-06 | Phase 1 — Platform Deploy | Pending |
| PLAT-07 | Phase 1 — Platform Deploy | Pending |
| PLAT-08 | Phase 1 — Platform Deploy | Pending |
| PLAT-09 | Phase 1 — Platform Deploy | Pending |
| PLAT-10 | Phase 1 — Platform Deploy | Pending (human task) |
| PLAT-11 | Phase 1 — Platform Deploy | Pending (human task) |
| PLAT-12 | Phase 1 — Platform Deploy | Pending (human task) |
| AGNT-14 | Phase 1 — Platform Deploy | Complete |
| SCTX-01 | Phase 2 — Schema Expansion | Pending |
| SCTX-02 | Phase 2 — Schema Expansion | Pending |
| SCTX-03 | Phase 2 — Schema Expansion | Pending |
| SCTX-04 | Phase 2 — Schema Expansion | Pending |
| AGNT-01 | Phase 2 — Schema Expansion | Pending |
| AGNT-02 | Phase 2 — Schema Expansion | Pending |
| AGNT-03 | Phase 2 — Schema Expansion | Pending |
| AGNT-04 | Phase 2 — Schema Expansion | Pending |
| AGNT-05 | Phase 2 — Schema Expansion | Pending |
| AGNT-06 | Phase 2 — Schema Expansion | Pending |
| AGNT-07 | Phase 2 — Schema Expansion | Pending |
| AGNT-08 | Phase 2 — Schema Expansion | Pending |
| AGNT-09 | Phase 2 — Schema Expansion | Pending |
| AGNT-10 | Phase 2 — Schema Expansion | Pending |
| SCTX-05 | Phase 3 — Semantic Context Engine | Pending |
| SCTX-06 | Phase 3 — Semantic Context Engine | Pending |
| SCTX-07 | Phase 3 — Semantic Context Engine | Pending |
| SCTX-08 | Phase 3 — Semantic Context Engine | Pending |
| SCTX-09 | Phase 3 — Semantic Context Engine | Pending |
| AGNT-11 | Phase 4 — Agent Infrastructure | Pending |
| AGNT-12 | Phase 4 — Agent Infrastructure | Pending |
| AGNT-13 | Phase 4 — Agent Infrastructure | Pending |

**Coverage:**
- v1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0 (coverage complete)

---
*Requirements defined: 2026-02-19*
*Last updated: 2026-02-19 — traceability populated after roadmap creation*
