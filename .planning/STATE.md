# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** BitBit understands the business better than the business owner -- when Andy says "Invoice Sezer for the White House RE work", BitBit knows who Sezer is, what the work was, the rate, and whether it's already been invoiced.
**Current focus:** v1.1 stabilization complete — clean baseline for Phase 1.5 (Conversational Interface).

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-01 — Milestone v1.2 started

## Performance Metrics

**Delivery totals:**
- Total plans completed: 35 (v1.0 + v1.1)
- v1.0 plans completed: 20
- v1.1 plans completed: 15
- Milestones shipped: v1.0 on 2026-02-21, v1.1 on 2026-02-22

**By Phase:**

| Phase | Milestone | Plans | Status |
|-------|-----------|-------|--------|
| 1. Platform Deploy | v1.0 | 4/4 | Complete |
| 2. Schema Expansion | v1.0 | 4/4 | Complete |
| 3. Semantic Context Engine | v1.0 | 3/3 | Complete |
| 4. Agent Infrastructure | v1.0 | 4/4 | Complete |
| 5. Wire Integration Points | v1.0 | 2/2 | Complete |
| 6. Verification Artifacts | v1.0 | 2/2 | Complete |
| 7. Infrastructure Foundation | v1.1 | 2/2 | Complete |
| 8. Agent Runtime | v1.1 | 3/3 | Complete |
| 9. Approval Flow | v1.1 | 3/3 | Complete |
| 10. Sentry Agent | v1.1 | 4/4 | Complete |
| 11. Lead Swarm Agent | v1.1 | 4/4 | Complete |
| 12. Invoice Flow Agent | v1.1 | 3/3 | Complete |

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table.

- **07-01:** Supabase DI pattern: createClient() only at HTTP boundary, SupabaseClient passed as first param to all agent/context/channel functions.
- **07-02:** Run logger never throws (returns null on failure); cost estimation uses static per-million-token pricing per model tier.
- **08-01:** Bearer token auth (RELAY_SECRET) for cron endpoint; ignoreDuplicates upsert for idempotent message ingestion.
- **08-02:** Haiku model for cost-optimized classification; pure deterministic routing function; spam/newsletter always skip.
- **08-03:** Minimal cron parser (no external deps) for agent scheduling; stateless tick function pattern; separate SCHEDULER_SECRET env var.
- **09-01/02/03:** Approval routing and operator UX are deterministic with urgent-first ordering, explicit conflict outcomes, and optimistic UI rollback.
- **10-01/03/04:** Sentry due-check logic prefers next_check_at, escalation runs once per org per tick, and dashboard actions refresh from API for state integrity.
- **11-01/02/03/04:** Lead pipeline classification and scoring are deterministic; acknowledgments are approval-gated and persisted only after provider delivery success.
- **12-01/02/03:** Invoice flow resolves NL intent to entities, enforces duplicate protections, queues send actions for approval, and exposes dashboard/API lifecycle controls.

### Pending Todos

#### P0 (finalization blockers)

- [x] ~~Fix Lead Swarm regression~~ — mock upsert chain fixed to return `.select().single()` builder
- [x] ~~Reconcile INVC-01..05 requirements~~ — REQUIREMENTS.md updated; INVC-01/02/04/05 complete, INVC-03 partial (email transport)
- [x] ~~Fix root workspace~~ — removed dead `packages/dashboard` from workspaces; added `test` script to personal-assistant
- [x] ~~Voice endpoint stub~~ — returns 501 Not Implemented
- [x] ~~WhatsApp route duplication~~ — deleted duplicate `webhook/route.ts`, fixed broken imports in conversation-manager and agent-dispatch
- [x] ~~Approval queue wiring~~ — agents use `createApproval` directly (equivalent to `queueAgentAction`); approval notification and digest scheduling reclassified as P1 (Phase 1.5 scope)
- [ ] Complete WhatsApp production setup checklist in `09-USER-SETUP.md` (webhook registration + `messages` subscription — requires Andy's Meta Business access)
- [ ] Run stabilization pass for known unrelated TypeScript errors outside Phase 12 scope
- [ ] Run `npx supabase db lint` when Docker is available and resolve migration lint findings

#### P1 (next delivery waves to align with comprehensive roadmap)

- [ ] Approval notification (WhatsApp ping after queue) and digest scheduling (no cron) — Phase 1.5 scope
- [ ] Phase 1.5 Conversational Interface (`1.5.1`-`1.5.19`): WhatsApp NL command parser, multi-turn state, command dispatch, proactive briefings, command center UX, mobile responsiveness, and notification center.
- [ ] Phase 3 Channel Integrations (`3.1`-`3.28`) starting with P0 channels: Outlook rebuild, Asana adapter, Calendly adapter, WhatsApp Business adapter hardening, Stripe adapter/webhooks, plus required credential collection.
- [ ] Phase 4 Communication Agents (`4.1`-`4.17`): Channel Triage and Client Comms, including Command Center behavior and voice-profile-driven drafting.

#### P2 (growth and launch completion scope)

- [ ] Phase 5 Revenue Agents (`5.1`-`5.16`): Proposal Bot and Client Onboarding.
- [ ] Phase 6 Growth Agents (`6.1`-`6.19`): Ad Script Generator, AI Search Optimizer, Tender Hunter.
- [ ] Phase 7 Infrastructure Evolution remaining work (`7.3`-`7.21`): VPS hardening, CI/CD, monitoring, secrets, RLS audit.
- [ ] Phase 8 Business/GTM/Revenue (`8.1`-`8.25`): legal structure, first-revenue operations, beta program, public launch prep.
- [ ] Phase 9 Testing Infrastructure (`9.1`-`9.6`): full unit/integration/adapter/E2E coverage and CI test enforcement.

### Blockers/Concerns

- Local Docker daemon unavailable in this environment, so `npx supabase db lint` could not be run.
- Some unrelated TypeScript errors remain outside Phase 12 scope and should be cleaned in a separate stabilization pass.

## Session Continuity

Last session: 2026-02-25
Stopped at: v1.1 stabilization pass completed — clean baseline for Phase 1.5 (Conversational Interface).
Resume file: None
