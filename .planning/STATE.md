# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** BitBit understands the business better than the business owner -- when Andy says "Invoice Sezer for the White House RE work", BitBit knows who Sezer is, what the work was, the rate, and whether it's already been invoiced.
**Current focus:** v1.1 Phase 12 - Invoice Flow Agent

## Current Position

Phase: 12 of 12 (Invoice Flow Agent)
Plan: 1 of 3 in current phase
Status: Ready
Last activity: 2026-02-22 -- Completed 11-03 leads pipeline APIs and dashboard kanban

Progress: [███████████████████░] 94% (33/35 plans across all milestones)

## Performance Metrics

**Velocity:**
- Total plans completed: 20 (v1.0)
- Average duration: ~25 min (v1.0)
- Total execution time: ~8 hours (v1.0)

**By Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Platform Deploy | 4 | ~2h | ~30 min |
| 2. Schema Expansion | 4 | ~2h | ~30 min |
| 3. Semantic Context | 3 | ~1.5h | ~30 min |
| 4. Agent Infra | 4 | ~1.5h | ~22 min |
| 5. Wire Integration | 2 | ~40 min | ~20 min |
| 6. Verification | 2 | ~30 min | ~15 min |
| Phase 09 P01 | 15m | 2 tasks | 4 files |
| Phase 09 P02 | 2 min | 2 tasks | 6 files |
| Phase 10 P01 | 8m | 2 tasks | 7 files |
| Phase 09 P03 | 4 min | 2 tasks | 5 files |
| Phase 10 P03 | 1 min | 2 tasks | 6 files |
| Phase 10 P04 | 5 min | 2 tasks | 2 files |
| Phase 10 P02 | 1 min | 2 tasks | 1 files |
| Phase 11 P01 | 5 min | 2 tasks | 5 files |
| Phase 11 P02 | 12 min | 2 tasks | 4 files |
| Phase 11 P03 | 4 min | 2 tasks | 7 files |

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions table.

- **07-01:** Supabase DI pattern: createClient() only at HTTP boundary, SupabaseClient passed as first param to all agent/context/channel functions
- **07-02:** Run logger never throws (returns null on failure); cost estimation uses static per-million-token pricing per model tier
- **08-01:** Bearer token auth (RELAY_SECRET) for cron endpoint; ignoreDuplicates upsert for idempotent message ingestion
- **08-02:** Haiku model for cost-optimized classification; pure deterministic routing function; spam/newsletter always skip
- **08-03:** Minimal cron parser (no external deps) for agent scheduling; stateless tick function pattern; separate SCHEDULER_SECRET env var
- [Phase 09]: Resolve conflicts by checking current approval status before update and returning explicit not-found/already-resolved errors.
- [Phase 09]: Keep urgent-first ordering deterministic by sorting pending results after query while preserving created_at tie-breaks.
- [Phase 09]: Integrate approvals into SPA tab registry + sidebar so queue navigation behaves like other dashboard sections.
- [Phase 09]: Use optimistic approval resolution with rollback for responsive queue interactions and safe error recovery.
- [Phase 10]: Evaluate due watches using next_check_at first with interval fallback from last_checked_at.
- [Phase 10]: Scheduler executes runSentryTick for sentry configs and logs processed/triggered/alerts counts.
- [Phase 10]: Installed vitest as workspace devDependency to unblock plan-mandated verification.
- [Phase 09]: Webhook replies are accepted only from WHATSAPP_ANDY_PHONE after normalization, then acknowledged with a WhatsApp confirmation message.
- [Phase 09]: Digest and webhook processing use the existing single-user default org ID pattern to stay consistent with current scheduler/sync routes.
- [Phase 10]: Escalation processing returns deterministic processed/escalated/failed counts and continues on per-alert failures.
- [Phase 10]: Alert acknowledgment uses explicit NOT_FOUND/ALREADY_ACKNOWLEDGED outcomes for stable API responses.
- [Phase 10]: Scheduler runs sentry escalation once per org per tick to prevent duplicate escalation approvals.
- [Phase 10]: Use optimistic local updates for pause/delete/ack actions, then refresh from APIs to keep operator view in sync.
- [Phase 10]: Use visible inline success/error banners so API failures are immediately operator-visible in dashboard operations.
- [Phase 10]: 10-02 remains non-implementing; SNTR-03 and SNTR-04 implementation authority stays with 10-03 and 10-04.
- [Phase 10]: Execution guardrail order for sentry gap closure is fixed at 10-03 -> 10-04 -> 10-02 to avoid ownership overlap.
- [Phase 11]: Mapped fallback categories deterministically for lead intake labels (newsletter->spam, vendor->client, notification->personal).
- [Phase 11]: Lead qualification uses deterministic budget/service/timeline points to produce hot/warm/cold scoring.
- [Phase 11]: Scheduler applies per-org lead-swarm dedupe and logs processed/created/qualified/hot/failed counters.
- [Phase 11]: Lead acknowledgments are now created as lead_ack_send approval drafts and remain blocked from direct send until approval.
- [Phase 11]: High-value lead escalation uses strict estimated_value > 5000 with urgent approval priority and immediate notifyApproval dispatch.
- [Phase 11]: Lead send completion stores ackSentAt metadata while transitioning ack_status to sent to preserve schema stability.
- [Phase 11]: Use explicit per-card stage transition actions for deterministic lead movement UX.
- [Phase 11]: Render converted and lost in one Won/Lost lane while preserving discrete persisted statuses.

### Pending Todos

None.

### Blockers/Concerns

- Vercel 30s timeout risk with IMAP -- Gmail API migration may be needed for channel relay daemon
- AGNT-12/AGNT-13 production-verified with boundary tests and error handling (Phase 7 complete)
- Supabase DI refactor complete (Phase 7 complete)
- WhatsApp Business API requires Meta Business Verification (3-14 day lead time for Phase 9)
- Local Docker daemon unavailable, so `npx supabase db lint` could not be executed for migration verification.

## Session Continuity

Last session: 2026-02-22
Stopped at: Session resumed, proceeding to complete 11-04-PLAN.md
Resume file: None
