---
phase: 25-role-dashboard
plan: 02
subsystem: dashboard
tags: [roles, autonomy, attention, approvals, escalations, controls]

# Dependency graph
requires:
  - phase: 25-role-dashboard
    provides: "Plan 01 — role status API and status cards"
  - phase: 09-approval-flow
    provides: "approval_queue table with pending approvals and PATCH /api/agent/approvals endpoint"
provides:
  - "AutonomyToggle component with observer/copilot/autopilot tri-state switch"
  - "AttentionView component — unified human-attention-required queue"
  - "GET /api/roles/attention — combined approval_queue + escalation + high-priority insight stream"
affects: [25-03, dashboard-redesign]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Optimistic UI updates with revert-on-error", "Priority-based sorting (0=urgent through 3=low)", "15s polling for attention items (faster than 30s activity poll)", "Source deduplication via seen Set on source_id"]

key-files:
  created:
    - "personal-assistant/src/components/roles/autonomy-toggle.tsx"
    - "personal-assistant/src/components/roles/attention-view.tsx"
    - "personal-assistant/src/app/api/roles/attention/route.ts"
  modified: []

key-decisions:
  - "AutonomyToggle uses optimistic state update — sets UI immediately, reverts on PATCH failure"
  - "Attention API combines 3 sources: pending approvals (approval_queue), escalations (role_activity last 7 days), and high-priority insights (role_activity last 48h with priority=high/urgent or confidence >= 0.85)"
  - "Escalations hardcoded to priority=1 (high), approval priority mapped via mapPriority() helper (urgent=0, high=1, normal=2, low=3)"
  - "AttentionView shows inline Approve/Reject buttons on hover for approval-source items, calling PATCH /api/agent/approvals"
  - "Deduplication by source_id after priority+recency sort to prevent same item appearing from multiple query paths"

patterns-established:
  - "LEVELS array constant defining the 3 autonomy tiers with label, icon (Eye/Users/Rocket), and description"
  - "LEVEL_COLORS record mapping autonomy levels to color tokens (observer=#94A3B8, copilot=#3b82f6, autopilot=#22c55e)"
  - "SOURCE_META record mapping attention sources (approval/escalation/insight) to icon, color, and label"
  - "PRIORITY_LABELS record with color-coded urgency levels for visual priority indicators"
  - "AttentionItem interface with source discriminator field for polymorphic rendering"
  - "mapPriority() helper normalizing string priority values to numeric 0-3 scale"

requirements-completed: [ROLE-DASH-03, ROLE-DASH-04]

# Metrics
duration: retroactive
completed: 2026-03-26
---

# Phase 25 Plan 02: Autonomy Controls + Attention View Summary

**Tri-state autonomy toggle with optimistic updates and unified attention queue combining pending approvals, role escalations, and high-confidence insights with inline approve/reject actions**

## Performance
- **Duration:** retroactive (code pre-existed)
- **Files modified:** 3

## Accomplishments
- AutonomyToggle component with 3-tier track UI (Observer/Co-pilot/Autopilot), per-level icons (Eye/Users/Rocket), optimistic level switching via PATCH /api/roles/[roleType]/autonomy, disabled state when role is not enabled, hover descriptions, and saving/wait cursor state
- AttentionView component with priority-colored left-edge indicator bars, source-typed badges (Approval needed/Escalation/Needs review), role-type pills, inline Approve/Reject buttons appearing on hover for approval items, optimistic item removal after resolution, and total-count badge in header
- GET /api/roles/attention endpoint querying 3 Supabase tables: approval_queue (pending, limit 50), role_activity escalations (last 7 days, limit 30), and role_activity high-priority insights (last 48h, confidence >= 0.85 or priority high/urgent, limit 30) — combined, priority-sorted, and deduplicated by source_id
- AttentionView polls at 15s intervals (2x faster than activity feed) for responsiveness on approval queues

## Deviations from Plan
None - retroactive summary of existing implementation.

## Issues Encountered
None noted.

---
*Phase: 25-role-dashboard*
*Completed: 2026-03-26*
