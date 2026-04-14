# Phase 07: Surface Surprises — RESULT

## Status: COMPLETE

## Summary

Implemented proactive insight surfacing from the predictive coding engine. High-surprise facts (score >0.7) are now detected after each TAOR response and surfaced as channel-appropriate "heads up" messages to the user.

## What Was Built

### 1. Surprise Surfacer Module (`personal-assistant/src/lib/brain/surprise-surfacer.ts`)
- `getSurpriseFacts(supabase, orgId, entityIds)` — queries recent knowledge_log entries (last 24h, unconsolidated), scores each against entity schemas via `scoreSurprise()`, returns facts exceeding PROACTIVE_SURPRISE_THRESHOLD (0.7)
- `formatSurpriseForChannel(facts, channel)` — SMS/WhatsApp: brief one-liners ("Heads up: [fact]"); dashboard/web: richer format with deviation labels ("Unusual: [fact] (contradicts known pattern)")
- Marks surfaced entries as consolidated to prevent repetition

### 2. TAOR Loop Integration (`personal-assistant/src/lib/agent/engine/taor-loop.ts`)
- After follow-up suggestions, before `done` event
- Best-effort: wrapped in try/catch, non-blocking
- Only triggers when `config.entityId` is present
- Yields surprise insights as a `message` event

### 3. Tests (`personal-assistant/src/lib/brain/__tests__/surprise-surfacer.test.ts`)
- 11 tests covering: high-surprise returned, low-surprise filtered, empty inputs, surfacing marks entries, SMS vs dashboard formatting, both format paths verified

## Quality Gates

| Gate | Result |
|------|--------|
| TypeScript compilation | PASS (no new errors) |
| Unit tests | PASS (11/11) |
| Channel formatting | PASS (SMS and dashboard paths verified) |

## Design Decisions

1. **Real-time scoring instead of persisted scores**: The knowledge_log table has no `surprise_score` column. Rather than adding a migration, the surfacer scores on-the-fly from recent unconsolidated WAL entries against entity schemas. This keeps the change minimal and self-contained.

2. **Consolidated_at as surfacing marker**: Reuses the existing `consolidated_at` column to mark entries as surfaced, preventing re-surfacing. This is semantically correct — surfaced entries have been "processed."

3. **Post-response, not inline**: Surprise insights are yielded as a separate `message` event after the main response completes, so they don't interfere with the primary answer flow.

4. **PROACTIVE_SURPRISE_THRESHOLD = 0.7**: Only genuinely surprising facts surface. The predictive coding SURPRISE_THRESHOLD (0.3) is for memory creation gating; the proactive threshold is deliberately higher.

## Files Changed

- `personal-assistant/src/lib/brain/surprise-surfacer.ts` (NEW)
- `personal-assistant/src/lib/brain/__tests__/surprise-surfacer.test.ts` (NEW)
- `personal-assistant/src/lib/agent/engine/taor-loop.ts` (MODIFIED — import + post-response hook)
