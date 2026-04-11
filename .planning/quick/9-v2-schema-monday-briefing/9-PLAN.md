---
phase: quick
plan: 9
type: feature
autonomous: true
---

# Quick Task 9: v2.0 Shared Schema + Monday Morning Briefing

## Objective
Add v2.0 shared database tables (business_metrics, behavioral_patterns, action_outcomes v2) with entity_profiles extensions, and build a comprehensive Monday Morning Briefing feature with WhatsApp + email delivery and on-demand API.

## Tasks

### Task 1: v2.0 Shared Schema Migration (065)
type="auto"
- Create migration `065_v2_shared_schema.sql`
- Tables: business_metrics, behavioral_patterns, action_outcomes_v2 (rename to avoid conflict with 064)
- ALTER TABLE entity_profiles with 7 new columns
- All tables have RLS, proper indexes, FK to organizations

### Task 2: Briefing Generator
type="auto"
- Create `src/lib/agent/briefing-generator.ts`
- `generateMondayBriefing()` queries calendar, invoices, pipeline, approvals, relationship alerts, leads
- Returns structured briefing object
- Formats WhatsApp text and HTML email versions

### Task 3: Monday Briefing Cron Route
type="auto"
- Replace existing `src/app/api/cron/monday-briefing/route.ts` with enhanced version
- Uses withCronGuard pattern
- Monday 6am AEST schedule (already in vercel.json as `0 21 * * *` which is 9pm UTC Sunday = wrong)
- Update vercel.json cron to `0 19 * * 0` (Monday 6am AEST = Sunday 7pm UTC)
- Sends via WhatsApp + email using dispatchNotification

### Task 4: On-demand Briefing API
type="auto"
- Create `src/app/api/briefing/route.ts`
- GET: generate briefing for current user's org
- Uses createClient + getActiveOrgId auth pattern
- Returns structured JSON for dashboard display

## Verification
- Migration SQL is valid
- TypeScript compiles without errors in new files
- All cron patterns follow withCronGuard
- vercel.json updated with correct Monday 6am AEST schedule

## Output
- `personal-assistant/supabase/migrations/065_v2_shared_schema.sql`
- `personal-assistant/src/lib/agent/briefing-generator.ts`
- `personal-assistant/src/app/api/cron/monday-briefing/route.ts` (enhanced)
- `personal-assistant/src/app/api/briefing/route.ts`
- `personal-assistant/vercel.json` (updated cron)
