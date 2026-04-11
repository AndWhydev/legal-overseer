---
phase: quick
plan: 9
subsystem: schema, briefing, cron
tags: [v2.0, migration, briefing, whatsapp, email, cron]
dependency-graph:
  requires: [organizations, invoices, leads, contacts, approval_queue, tasks, agent_runs, entity_profiles]
  provides: [business_metrics, behavioral_patterns, agent_action_outcomes, monday-briefing-api, monday-briefing-cron]
  affects: [vercel.json, entity_profiles]
tech-stack:
  added: []
  patterns: [briefing-generator, multi-format-output, parallel-data-fetch]
key-files:
  created:
    - personal-assistant/supabase/migrations/065_v2_shared_schema.sql
    - personal-assistant/src/lib/agent/briefing-generator.ts
    - personal-assistant/src/app/api/cron/monday-briefing/route.ts
    - personal-assistant/src/app/api/briefing/route.ts
  modified:
    - personal-assistant/vercel.json
decisions:
  - Named v2.0 action outcomes table agent_action_outcomes to avoid conflict with existing action_outcomes (migration 064)
  - Keep existing morning-briefing daily cron alongside new Monday briefing weekly cron
  - Monday 6am AEST = Sunday 20:00 UTC cron schedule (AEST for year-round consistency)
  - Briefing API supports 3 output formats via query param (json, whatsapp, email)
metrics:
  duration: 9min
  completed: 2026-03-12
  tasks: 4
  files: 5
---

# Quick Task 9: v2.0 Shared Schema + Monday Morning Briefing Summary

v2.0 database foundation (3 new tables + 7 entity_profiles columns) plus comprehensive Monday Morning Briefing with WhatsApp + email + on-demand API delivery

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | v2.0 Shared Schema Migration | 4c225460 | 065_v2_shared_schema.sql |
| 2 | Briefing Generator | 9e5969a5 | briefing-generator.ts |
| 3 | Monday Briefing Cron Route | d388eeb0 | cron/monday-briefing/route.ts, vercel.json |
| 4 | On-demand Briefing API | 1f6a0650 | api/briefing/route.ts |

## What Was Built

### Part A: v2.0 Shared Schema (Migration 065)

**3 new tables:**
- `business_metrics` -- time-series metrics per org (revenue, pipeline_value, utilization, client_count, overdue_amount)
- `behavioral_patterns` -- trigger-action pairs observed from user behavior for proactive agent learning
- `agent_action_outcomes` -- tracks results of agent actions for improvement feedback loops (separate from 064 confidence calibration)

**7 new entity_profiles columns:**
- `sentiment_trajectory` (jsonb) -- array of score/timestamp/source
- `communication_style` (jsonb) -- preferred channel, tone, response speed
- `optimal_contact_windows` (jsonb) -- day/hour/response_rate arrays
- `predicted_ltv` (numeric) -- predicted lifetime value
- `churn_risk_score` (numeric) -- 0-1 churn probability
- `relationship_strength` (numeric) -- 0-100 composite score
- `last_interaction_at` (timestamptz)

All tables have RLS (org member isolation + service_role bypass), proper indexes, and FK constraints.

### Part B: Monday Morning Briefing

**Briefing Generator** (`src/lib/agent/briefing-generator.ts`):
- `generateMondayBriefing()` queries 6 data sources in parallel: upcoming events, overdue invoices, pipeline value, pending approvals, relationship alerts (30+ day silence), recent leads
- `formatBriefingWhatsApp()` produces section-based WhatsApp markdown with status indicators
- `formatBriefingEmail()` produces styled HTML with summary cards and section tables
- Returns typed `BriefingData` with `BriefingSummary` aggregates

**Cron Route** (`/api/cron/monday-briefing`):
- Monday 6am AEST (Sunday 20:00 UTC)
- Iterates all orgs, generates briefing, sends via WhatsApp (if notify_phone) + email + dashboard
- Uses withCronGuard pattern with structured results

**On-demand API** (`/api/briefing`):
- GET with auth (createClient + getActiveOrgId)
- `?format=json` (default) -- full structured briefing for dashboard
- `?format=whatsapp` -- WhatsApp text output
- `?format=email` -- HTML email output

## Decisions Made

1. **agent_action_outcomes vs action_outcomes**: Named the v2.0 table `agent_action_outcomes` to avoid collision with existing `action_outcomes` (migration 064) which tracks confidence calibration. Different schema, different purpose.
2. **Kept daily morning-briefing**: The existing `/api/cron/morning-briefing` (WhatsApp-only daily briefing) is preserved alongside the new Monday briefing for continuity.
3. **AEST scheduling**: Used AEST (UTC+10) for cron stability -- during AEDT it arrives at 7am instead of 6am, which is acceptable.
4. **Multi-format API**: Single endpoint with `format` query param rather than separate endpoints, keeping the API surface small.

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED

All 5 files exist, all 4 commits verified.
