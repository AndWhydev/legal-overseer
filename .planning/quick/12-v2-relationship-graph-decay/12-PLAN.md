---
phase: quick
plan: 12
type: feature
autonomous: true
---

# Quick Task 12: v2.0 Relationship Graph with Strength Decay

## Objective

Build a relationship health scoring system that tracks interaction frequency, applies time decay, detects cold relationships, and generates proactive nudges via the approval queue.

## Tasks

### Task 1: Migration + Relationship Scorer
- type: auto
- Create migration 065_relationship_scores.sql adding relationship_strength column to contacts
- Create `personal-assistant/src/lib/intelligence/relationship-scorer.ts` with:
  - `computeRelationshipStrength()` — scans entity_timeline + invoices + tasks for a contact
  - `computeAllRelationshipScores()` — batch scorer for all contacts in an org
  - `detectColdRelationships()` — finds relationships that have degraded
  - `generateRelationshipNudges()` — creates approval queue entries for cold contacts

### Task 2: Cron Route + API Endpoints
- type: auto
- Create `personal-assistant/src/app/api/cron/relationship-health/route.ts` — daily cron
- Create `personal-assistant/src/app/api/contacts/[id]/relationship/route.ts` — GET single contact score
- Create `personal-assistant/src/app/api/relationships/health/route.ts` — GET all contacts sorted by health

### Task 3: Tests
- type: auto
- Create `personal-assistant/src/lib/intelligence/relationship-scorer.test.ts` with 6+ tests:
  - Strength calculation from mock interaction data
  - Decay function reduces score correctly over time
  - Cold detection triggers at correct thresholds
  - Nudge generation creates approval queue entries
  - Handles contacts with no interaction history
  - Trend calculation (rising/stable/declining/cold)

## Verification

- `npx vitest run relationship-scorer` passes all tests
- TypeScript compiles without errors for new files
