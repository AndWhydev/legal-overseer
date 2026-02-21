# Roadmap: BitBit AWU — Milestone 1

## Overview

Milestone 1 transforms a working codebase into a deployed, contextually intelligent platform for Andy at All Webbed Up. The journey moves from deployment (Andy can access the platform) through schema expansion (the data model that supports semantic understanding) to the semantic brain itself (entity-aware context assembly) and finally the agent infrastructure layer (registry, routing, shared tools). Each phase delivers a verifiable capability that unblocks the next. Human-required tasks (billing, verification) are tracked within Phase 1 as parallel blockers.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

- [ ] **Phase 1: Platform Deploy** - BitBit deployed to Vercel with Supabase, AWU seeded, Andy live
- [x] **Phase 2: Schema Expansion** - All new DB migrations run with RLS policies
- [ ] **Phase 3: Semantic Context Engine** - Entity relationships, timeline, context assembly, and fuzzy resolution operational
- [x] **Phase 4: Agent Infrastructure** - Registry, confidence routing, and shared CRUD tools wired in

## Phase Details

### Phase 1: Platform Deploy
**Goal**: Andy can log in to a live BitBit instance with AWU data and chat with Claude
**Depends on**: Nothing (first phase)
**Requirements**: PLAT-01, PLAT-02, PLAT-03, PLAT-04, PLAT-05, PLAT-06, PLAT-07, PLAT-08, PLAT-09, PLAT-10, PLAT-11, PLAT-12, AGNT-14
**Success Criteria** (what must be TRUE):
  1. Andy can navigate to bitbit.com.au, log in, and see the kanban board with seeded AWU tasks
  2. Andy can open the chat interface and receive a response from Claude (Anthropic API live)
  3. Andy can browse the contacts view and see the 6 seeded AWU client contacts
  4. @bitbit/core package exports resolve without errors (monorepo builds cleanly)
  5. Supabase project is live in ap-southeast-2 with all 4 existing migrations applied and RLS active
**Plans:** 4 plans in 2 waves

Plans:
- [ ] 01-01-PLAN.md — Supabase project setup, migrations, AWU seed data (PLAT-01 to PLAT-05, PLAT-09) [Wave 1]
- [x] 01-02-PLAN.md — Vercel deployment, domain, smoke test (PLAT-06, PLAT-07, PLAT-08) [Wave 2, depends on 01-01]
- [x] 01-03-PLAN.md — Fix @bitbit/core exports and verify monorepo (AGNT-14) [Wave 1]
- [x] 01-04-PLAN.md — Human tasks: Anthropic billing, Stripe, Meta verification (PLAT-10, PLAT-11, PLAT-12) [Wave 1]

### Phase 2: Schema Expansion
**Goal**: All 12 new database tables exist with RLS policies, contacts enhanced, and the semantic context schema is designed
**Depends on**: Phase 1
**Requirements**: SCTX-01, SCTX-02, SCTX-03, SCTX-04, AGNT-01, AGNT-02, AGNT-03, AGNT-04, AGNT-05, AGNT-06, AGNT-07, AGNT-08, AGNT-09, AGNT-10
**Success Criteria** (what must be TRUE):
  1. All 9 agent migrations (005-013) run cleanly against the live Supabase project
  2. entity_relationships, entity_timeline, and semantic_memories tables exist with correct columns
  3. Every new table has RLS policies enforcing org_id scoping (no cross-org data leakage)
  4. Supabase schema inspector shows all 24 tables (12 existing + 12 new) with correct foreign keys
**Plans:** 4 plans in 2 waves

Plans:
- [x] 02-01-PLAN.md — Semantic context migrations: entity_relationships, entity_timeline, semantic_memories (SCTX-01, SCTX-02, SCTX-03, SCTX-04) [Wave 1]
- [x] 02-02-PLAN.md — Agent infrastructure migrations 008-012: agent_configs, agent_runs, leads, invoices, watches (AGNT-01, AGNT-02, AGNT-03, AGNT-04, AGNT-05) [Wave 1]
- [x] 02-03-PLAN.md — Agent infrastructure migrations 013-016: templates, voice_profiles, proposals, offer_packages, contacts enhancements (AGNT-06, AGNT-07, AGNT-08, AGNT-09) [Wave 1]
- [x] 02-04-PLAN.md — RLS policies for all 12 new tables (AGNT-10) [Wave 2, depends on 02-01, 02-02, 02-03]

### Phase 3: Semantic Context Engine
**Goal**: BitBit can resolve who an entity is, build its relationship graph, and assemble a context briefing for any query
**Depends on**: Phase 2
**Requirements**: SCTX-05, SCTX-06, SCTX-07, SCTX-08, SCTX-09
**Success Criteria** (what must be TRUE):
  1. When Andy says "Sezer", the system resolves to the correct contact via 5-step fuzzy match (exact alias → email → phone → partial name → phone variants)
  2. Every CRUD action on a task, contact, or invoice automatically creates a corresponding entity_relationship record
  3. Every channel message and task update writes a timestamped entry to entity_timeline
  4. The context assembler returns a structured briefing (entity + relationships + timeline + memories) for a given query
  5. Cross-reference engine returns related tasks, deadlines, and financial signals when queried with a contact or project entity
**Plans:** 3 plans in 2 waves

Plans:
- [x] 03-01-PLAN.md — Relationship auto-linker and timeline writer (SCTX-05, SCTX-06) [Wave 1]
- [x] 03-02-PLAN.md — Entity resolution: 5-step fuzzy match (SCTX-08) [Wave 1]
- [x] 03-03-PLAN.md — Context assembler + cross-reference engine (SCTX-07, SCTX-09) [Wave 2, depends on 03-01, 03-02]

### Phase 4: Agent Infrastructure
**Goal**: Agents can register themselves, route by confidence, and share a common CRUD toolset
**Depends on**: Phase 3
**Requirements**: AGNT-11, AGNT-12, AGNT-13
**Success Criteria** (what must be TRUE):
  1. An agent module can call self-register and appear in the agent registry without manual configuration
  2. A task classified at 0.90 confidence executes immediately; at 0.65 it prompts Andy for approval; below 0.55 it escalates
  3. Any agent can call the shared CRUD tools to read/write contacts, tasks, invoices, and messages without reimplementing DB access
**Plans:** 4 plans in 2 waves

Plans:
- [x] 04-01-PLAN.md — Agent registry with self-registration, validation, DB config merge (AGNT-11) [Wave 1]
- [x] 04-02-PLAN.md — Confidence routing with threshold cascade and tests (AGNT-12) [Wave 1]
- [x] 04-03-PLAN.md — Shared CRUD tool system extracted from tools.ts (AGNT-13) [Wave 2, depends on 04-01]
- [ ] 04-04-PLAN.md — Gap closure: fix workspace resolution and canonical type imports (AGNT-11, AGNT-12, AGNT-13) [Wave 1]

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Platform Deploy | 3/4 | In progress | - |
| 2. Schema Expansion | 4/4 | Complete | 2026-02-21 |
| 3. Semantic Context Engine | 3/3 | Complete | 2026-02-21 |
| 4. Agent Infrastructure | 3/3 | Complete | 2026-02-21 |
