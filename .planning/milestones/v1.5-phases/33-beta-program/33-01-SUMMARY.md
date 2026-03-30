---
phase: "33"
plan: "01"
subsystem: beta-program
tags: [beta, invite, feedback, monitoring, onboarding, admin]
dependency_graph:
  requires: [waitlist-schema, resend-email, supabase-auth, module-registry]
  provides: [beta-invite-flow, feedback-widget, beta-metrics, daily-tips]
  affects: [admin-tab, dashboard-tab, spa-shell, module-registry]
tech_stack:
  added: [beta_feedback-table, beta_daily_tips-table, waitlist-status-column]
  patterns: [admin-gated-api, floating-widget, session-dismissal, per-org-aggregation]
key_files:
  created:
    - personal-assistant/supabase/migrations/20260327_beta_program.sql
    - personal-assistant/src/app/api/admin/beta-invite/route.ts
    - personal-assistant/src/lib/beta/invite-email.ts
    - personal-assistant/src/app/api/beta/feedback/route.ts
    - personal-assistant/src/components/beta/feedback-widget.tsx
    - personal-assistant/src/app/api/admin/beta-metrics/route.ts
    - personal-assistant/src/components/dashboard/tabs/beta-admin-tab.tsx
    - personal-assistant/src/app/api/beta/daily-tip/route.ts
    - personal-assistant/src/components/beta/daily-tip-banner.tsx
  modified:
    - personal-assistant/src/components/dashboard/spa-shell.tsx
    - personal-assistant/src/components/dashboard/tabs/dashboard-tab.tsx
    - personal-assistant/src/lib/modules/registry.ts
decisions:
  - "Invite codes expire after 7 days, single-use per waitlist entry"
  - "Feedback widget uses file input for screenshots (not html2canvas) -- simpler, works cross-browser"
  - "Daily tips use account age (days since signup) not manual progression -- zero state to track"
  - "Beta metrics aggregate from agent_runs and channel_messages -- existing tables, no new counters"
  - "Beta-admin tab registered in scale tier + operations sidebar category"
metrics:
  duration_seconds: 1314
  completed: "2026-03-27"
---

# Phase 33 Plan 01: Beta Program Infrastructure Summary

Admin can invite waitlist users to beta with unique codes and email delivery, beta users get daily onboarding tips, in-app feedback widget is always available, and admin can monitor per-org usage metrics.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Beta invite flow | 1304e580 | beta-invite/route.ts, invite-email.ts, 20260327_beta_program.sql |
| 2 | Feedback widget | 1315ec05 | beta/feedback/route.ts, feedback-widget.tsx, spa-shell.tsx |
| 3 | Admin monitoring dashboard | 2a4c9f9f | beta-metrics/route.ts, beta-admin-tab.tsx, registry.ts |
| 4 | Beta onboarding daily tips | c8139b69 | daily-tip/route.ts, daily-tip-banner.tsx, dashboard-tab.tsx |

## What Was Built

### 1. Beta Invite Flow (BETA-01)
- **POST /api/admin/beta-invite**: Admin selects waitlist entries, generates unique `BETA-XXXXXXXX` codes (7-day expiry, single use), sends glassmorphic invite emails via Resend
- **GET /api/admin/beta-invite**: List waitlist entries with status/pagination filters
- **Migration**: Extends waitlist table with `status` column (pending/invited/accepted/expired), creates `beta_feedback` and `beta_daily_tips` tables with RLS policies
- **Email template**: Dark glassmorphic design matching BitBit brand, includes code display, signup CTA, and "what to expect" section

### 2. In-App Feedback Widget (BETA-03)
- **FeedbackWidget component**: Fixed-position floating action button (bottom-right), opens glassmorphic modal overlay
- **Categories**: bug, feature, ux, performance, other -- displayed as selectable pills
- **Screenshot**: File input attachment with preview and remove
- **POST /api/beta/feedback**: Authenticated submission with category validation, 5-5000 char message, page URL auto-capture, user agent logging
- **GET /api/beta/feedback**: Admin-only listing with status/category filters

### 3. Admin Monitoring Dashboard (BETA-04)
- **GET /api/admin/beta-metrics**: Aggregates per-org metrics from `agent_runs` and `channel_messages` tables over 7-day window -- active days, messages, agent runs, token usage, cost, errors, feedback count
- **BetaAdminTab**: Full admin dashboard with:
  - Summary stat cards (total orgs, agent runs, messages, cost, errors, feedback)
  - Waitlist table with batch select + invite button
  - Per-org metrics table (10 columns: name, plan, active days, messages, runs, tokens, cost, errors, feedback, last active)
  - Recent feedback table with category badges and status pills
- Registered as `beta-admin` tab in spa-shell, module registry (scale tier), operations sidebar

### 4. Beta Onboarding Daily Tips (BETA-02)
- **GET /api/beta/daily-tip**: Returns tip based on user account age (day 1 = signup day), falls back to latest tip after seeded range
- **DailyTipBanner component**: Glassmorphic banner with lightbulb icon, day indicator, tip content, CTA button with tab navigation
- **7 seeded tips**: Gmail connect, Inbox triage, Chat intro, Leads, Invoicing, Automations config, Feedback encouragement
- Session-based dismissal (once per day), wired into dashboard-tab as first element

## Deviations from Plan

None -- plan executed as written.

## Decisions Made

1. **Invite code format**: `BETA-XXXXXXXX` (8 random hex chars) -- human-readable, copy-pastable, URL-safe
2. **Screenshot approach**: Browser file input rather than html2canvas -- simpler, no extra dependency, works on all browsers including mobile
3. **Daily tip calculation**: Uses `Math.floor((now - created_at) / 86400000) + 1` -- stateless, no per-user tracking table needed
4. **Metrics aggregation**: Queries existing `agent_runs` and `channel_messages` tables -- no new materialized views or counters, acceptable for up to 10 beta orgs
5. **Beta-admin placement**: Operations sidebar category alongside Admin and Monitoring -- accessible to scale/enterprise tiers only

## Requirements Coverage

| Requirement | Status | Implementation |
|-------------|--------|---------------|
| BETA-01: Admin invite flow | Complete | beta-invite API + Resend email + waitlist status tracking |
| BETA-02: Enhanced onboarding with daily tips | Complete | daily-tip API + DailyTipBanner + 7-day seed data |
| BETA-03: In-app feedback widget | Complete | FeedbackWidget + feedback API + beta_feedback table |
| BETA-04: Admin per-org metrics | Complete | beta-metrics API + BetaAdminTab with full metrics table |
| BETA-05: 10 concurrent orgs | Supported | Queries use limits, parallel Promise.all, 60s cache header |
