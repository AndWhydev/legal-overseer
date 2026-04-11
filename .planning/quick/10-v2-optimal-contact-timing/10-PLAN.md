---
phase: quick
plan: 10
type: quick-task
autonomous: true
---

# Quick Task 10: v2.0 Optimal Contact Timing

## Objective
Analyze communication patterns per contact to determine optimal send windows, then auto-schedule outbound messages for those windows.

## Tasks

### Task 1: Contact timing analyzer + batch processor
- Create `personal-assistant/src/lib/intelligence/contact-timing.ts`
- `analyzeContactTiming(supabase, orgId, contactId)` scans entity_timeline for message_sent/message_received events
- Groups by day-of-week + hour, computes response latency per bucket
- Returns `OptimalContactWindow[]` with minimum 5 data points per window
- `computeAllContactTimings(supabase, orgId)` batch-processes all contacts with 10+ timeline events
- Stores results in `entity_patterns` table (pattern_type: 'optimal_contact_timing') + `contacts.communication_patterns`

### Task 2: Cron route + API endpoint
- Create `personal-assistant/src/app/api/cron/contact-timing/route.ts` (weekly, Sunday midnight AEST)
- Create `personal-assistant/src/app/api/contacts/[id]/timing/route.ts` (GET endpoint)
- Add `getNextOptimalWindow()` scheduling helper
- Add `scheduledFor` support in approval queue action_payload

### Task 3: Unit tests
- Create `personal-assistant/src/lib/intelligence/contact-timing.test.ts`
- At least 6 tests: optimal window identification, insufficient data, no messages, scheduling logic, AEST timezone, batch processing

## Verification
- `cd personal-assistant && npx vitest run src/lib/intelligence/contact-timing.test.ts`
- All tests pass

## Success Criteria
- Contact timing analyzer correctly identifies optimal windows from entity_timeline data
- Batch processor iterates contacts and stores results
- Cron route follows existing withCronGuard pattern
- API endpoint returns timing data for dashboard
- Scheduling helper computes next optimal send time
- All tests pass
