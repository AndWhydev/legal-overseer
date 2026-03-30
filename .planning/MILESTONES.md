# Milestones

## v1.4 Media, Billing & Growth Roles (Shipped: 2026-03-27)

**Phases completed:** 14 phases (20-28), 34 plans
**Timeline:** 10 days (2026-03-18 → 2026-03-27)
**Stats:** 342 commits, 2,383 files changed, 193,719 insertions
**Requirements:** 44/44 satisfied (MEDIA, BILL, COST, ADS, SEO, TNDR, CONT, ROLE-RUNTIME)

### Delivered
1. File upload pipeline: signed URLs, Supabase Storage, inline previews, AI analysis of uploads
2. Stripe billing: subscription lifecycle, plan gating, usage metering, pricing page, 30-day trial
3. Role engine foundation: 5 architecture tables, composable RoleImplementation interface, autonomy levels
4. 5 domain roles: Finance, Comms, Sales, Growth (SEO/Tender/Ads/Content), Intelligence
5. Cost controls: per-execution token budgets, daily limits, circuit breakers
6. SOTA response drafter: ContextAssembler + RAG + Memory Palace for business-aware replies
7. Intelligence layer: revenue radar, client health scoring, cash flow projections, capacity oracle
8. Role dashboard: activity feed, status cards, autonomy controls, attention view, intelligence widgets
9. Gap closure: role runtime imports (Phase 27), intelligence dashboard wiring (Phase 28)

### Known Gaps (Tech Debt)
- 9/14 phases missing VERIFICATION.md (verification coverage debt)
- `convertTrial()` references British spelling `organisations` (dormant bug)
- `content_calendar` tool returns empty stub (no content_drafts table)
- Duplicate migration sequence prefixes (092, 093)

---

## v1.0 MVP (Shipped: 2026-02-21)

**Phases completed:** 6 phases, 19 plans
**Files modified:** 86 (8,384 lines added)
**Timeline:** 3 days (2026-02-19 → 2026-02-21)
**Git range:** `feat(01-01)` → `docs(phase-06)`

**Key accomplishments:**
1. Deployed BitBit to Vercel with Supabase backend, AWU org seeded with contacts and tasks
2. Created 12 new DB tables (entity relationships, timeline, semantic memories, agent configs, leads, invoices, etc.) with RLS policies
3. Built semantic context engine: fuzzy entity resolution, relationship auto-linker, timeline writer, context assembler
4. Built agent infrastructure: self-registering agent registry, confidence routing, shared CRUD tools
5. Wired cross-phase integration: entity-aware prompts in chat, agent registry lazy init, schema fixes
6. Created verification artifacts proving 27 requirements satisfied across Phases 1-2

### Known Gaps
- **AGNT-12**: Confidence routing — code built (Phase 4, plan 04-02) but not fully verified in production flow
- **AGNT-13**: Shared CRUD tool system — code built (Phase 4, plan 04-03) but not fully verified in production flow

---

## v1.1 Agent Runtime + First Agents (Shipped: 2026-02-22)

**Phases completed:** 6 phases (7-12), 15 plans
**Timeline:** 1 day (2026-02-22) + hardening through 2026-02-25
**Last phase:** 12 (ended at phase 12)

**Key accomplishments:**
1. Supabase DI refactor — createClient() at HTTP boundary, SupabaseClient passed as first param everywhere
2. Agent runtime — channel relay daemon, message classification, action routing, scheduler with cron
3. Approval flow — confidence-routed queue, dashboard cards, WhatsApp notifications, digest batching
4. Sentry agent — watch runtime, escalation, dashboard management
5. Lead Swarm agent — intake classification, qualification scoring, approval-gated acknowledgment, pipeline APIs
6. Invoice Flow agent — NL intent resolution, entity matching, PDF generation, approval-gated send, lifecycle tracking
7. Post-v1.1 hardening: 100+ commits, 719 tests across 51 files, realtime, multi-tenant, notifications, audit, knowledge graph, global search, admin tools, reporting

### Known Gaps
- WhatsApp production setup requires Andy's Meta Business access
- Some unrelated TypeScript errors remain outside milestone scope
- Confidence routing thresholds not validated against real operational data

---

## v1.5 Beta Launch & First Revenue

**Shipped:** 2026-03-28
**Phases:** 29-36 (8 phases, 22 plans)
**Timeline:** 2 days (2026-03-27 → 2026-03-28)
**Stats:** 99 commits, 354 files changed, 35,316 insertions

### Delivered
- Proactive SEO/Tender monitoring via growth role on scheduled ticks
- Onboarding E2E: 5-stage wizard, first-run discovery, welcome conversation, empty states
- Channel smoke tests, concurrent load testing, cron resilience, production monitoring dashboard
- Marketing site: landing page, 3 industry pages, pricing with Stripe Checkout, AWU case study
- Beta program: invite flow, daily tips, feedback widget, admin usage dashboard
- Builder role: website generation via chat, template library, WordPress/Elementor export, preview sandbox
- Proactive workflows: NL rule parser, trigger engine, cross-role tool bridge, workflow dashboard
- Mobile app: Expo/React Native, chat with streaming, voice input, push notifications, offline queue, quick actions

### Known Gaps (Tech Debt)
- og-image.png missing for social sharing previews
- Nyquist validation incomplete on phases 29, 31, 32, 33, 35, 36
- 3 visual checkpoints pending (builder, workflows, mobile)

