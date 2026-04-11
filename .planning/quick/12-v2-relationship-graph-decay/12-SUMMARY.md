---
phase: quick
plan: 12
subsystem: intelligence
tags: [v2, relationship-health, decay, nudges, cron]
key-files:
  created:
    - personal-assistant/src/lib/intelligence/relationship-scorer.ts
    - personal-assistant/src/lib/intelligence/relationship-scorer.test.ts
    - personal-assistant/src/app/api/cron/relationship-health/route.ts
    - personal-assistant/src/app/api/contacts/[id]/relationship/route.ts
    - personal-assistant/src/app/api/relationships/health/route.ts
    - personal-assistant/supabase/migrations/065_relationship_scores.sql
decisions:
  - Decay rate 2 points/day of inactivity, floor at 0
  - Score dimensions: messages (40), reciprocity (15), meetings (15), revenue (20), projects (10)
  - Cold detection: strength < 30 + was previously important (had revenue, invoices, or tasks)
  - Nudges route through existing approval_queue with client-comms agent config
  - Trend: rising (<=7 days + >=40 str), stable, declining (>14 days or <30 str), cold (>30 days or <15 str)
metrics:
  duration: 19min
  completed: 2026-03-12
---

# Quick Task 12: v2.0 Relationship Graph with Strength Decay Summary

Relationship health scoring system with 5-dimension strength calculation (messages, reciprocity, meetings, revenue, projects), 2pt/day time decay, cold relationship detection, and proactive nudge generation via approval queue.

## What Was Built

### 1. Relationship Scorer (`relationship-scorer.ts`)
- `computeRelationshipStrength(supabase, orgId, contactId)` -- scans entity_timeline (90-day window), invoices, and entity_relationships
- Base strength from 5 dimensions: message frequency (weighted by recency window), reciprocity ratio, meeting frequency, revenue relationship (active invoices + payment reliability), project activity (task relationships)
- Time decay: 2 points per day of inactivity, floor at 0, ceiling at 100
- Returns `RelationshipScore` with strength, trend, lastInteraction, topChannel, daysSinceContact

### 2. Batch Scorer
- `computeAllRelationshipScores(supabase, orgId)` -- iterates all contacts, computes scores, updates contacts table columns: relationship_strength, relationship_trend, last_interaction_at, relationship_scored_at

### 3. Cold Relationship Detector
- `detectColdRelationships(supabase, orgId)` -- finds contacts where strength < 30 AND they were previously important (lifetime_value > 0 OR active invoices OR task relationships OR interacted within 90 days)
- Returns ColdRelationship with human-readable context message

### 4. Nudge Generator
- `generateRelationshipNudges(supabase, orgId)` -- creates approval_queue entries for each cold relationship
- Suggests "Send a check-in message" (<60 days) or "Schedule a catch-up call" (>60 days)
- Confidence/priority based on client importance (revenue, active invoices, task count)
- Uses existing client-comms agent config for approval routing

### 5. Cron Route
- `GET /api/cron/relationship-health` -- daily cron, iterates all orgs, runs batch scoring + nudge generation
- Uses withCronGuard pattern, maxDuration 300s

### 6. API Endpoints
- `GET /api/contacts/:id/relationship` -- live-computed relationship score for single contact + cached values
- `GET /api/relationships/health` -- all contacts sorted by relationship health, supports filter (cold/declining/all), pagination

### 7. Migration
- `065_relationship_scores.sql` -- adds relationship_strength (0-100), relationship_trend, relationship_scored_at to contacts table with index

### 8. Tests (8 passing)
- Strength calculation from mock interaction data
- Decay function reduces score correctly over time
- Handles contacts with no interaction history
- Trend computation (rising/stable/declining/cold)
- Batch scoring counts
- Cold detection threshold verification
- Nudge generation creates approval queue entries
- No-agent-config graceful fallback

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 9e5969a5 | Migration + relationship scorer (committed with Q9 batch) |
| 2 | 2144de6b | Cron route + API endpoints |
| 3 | 2eb26763 | Test suite (8 tests) |

## Deviations from Plan

### Note: Concurrent Agent Overlap
Task 1 files (relationship-scorer.ts + migration 065) were committed as part of Q9's commit 9e5969a5 because both agents ran in parallel and Q9's staging picked up Q12's files from disk. The content is identical to what Q12 wrote. No functional impact.

## Self-Check: PASSED

All 6 created files verified on disk. All 3 commit hashes verified in git log.
