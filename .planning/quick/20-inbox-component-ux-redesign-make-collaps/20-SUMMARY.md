---
phase: Q20
plan: 01
subsystem: ui
tags: [inbox, collapse-expand, ux-design, interaction-patterns, accessibility, responsive]

# Dependency graph
requires:
  - phase: Q14-Q18
    provides: "Previous inbox redesign iterations (icons, expand rows, toolbar, polish)"
provides:
  - "Authoritative design reference for inbox collapse/expand mechanism"
  - "Competitive analysis of 6 products (Slack, VS Code, Notion, Linear, Superhuman, Finder)"
  - "Collapse trigger specification (header chevron button)"
  - "Keyboard shortcut recommendation (] key toggle)"
  - "Animation curve fix (remove spring bounce, use standard easing)"
  - "Responsive breakpoint strategy (desktop/tablet/mobile)"
  - "Accessibility specification (ARIA, focus management, screen reader)"
  - "3-phase implementation roadmap with file references"
affects: [inbox-feed, dashboard-redesign, inbox-tab, inbox-shortcuts-overlay, use-inbox-keyboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "State machine for collapse/expand transitions"
    - "BroadcastChannel for cross-tab state sync"
    - "Progressive shortcut hint system"

key-files:
  created:
    - ".planning/quick/20-inbox-component-ux-redesign-make-collaps/20-INBOX-UX-DESIGN.md"
  modified: []

key-decisions:
  - "Header chevron button for collapse (not drag handle, not double-click) -- most discoverable pattern"
  - "] key for panel toggle -- zero conflicts with existing shortcuts, mnemonic for 'push right'"
  - "Replace spring cubic-bezier with standard easing (0.4, 0, 0.2, 1) at 250ms -- panels need precision not playfulness"
  - "Sidebar auto-collapse when navigating to full inbox tab -- reduces redundancy"
  - "Tablet uses bottom-sheet FAB pattern, mobile uses full-screen page -- no collapsed strip on touch devices"
  - "Phase A (critical) scoped to 3 files and 1-2 hours -- collapse button, keyboard shortcut, animation fix"

patterns-established:
  - "Collapse trigger pattern: dedicated button in panel header, keyboard shortcut at layout level"
  - "Persistent collapsed affordance: always-visible 2px line + unread badge"
  - "Progressive onboarding: one-time tooltip -> footer hint -> contextual action hints"

requirements-completed: [Q20-DESIGN-SYNTHESIS]

# Metrics
duration: 10min
completed: 2026-03-14
---

# Quick Task 20: Inbox Collapse/Expand UX Design Summary

**Comprehensive design specification covering missing collapse button, competitive analysis (6 products), state machine, responsive behavior, accessibility, and 3-phase implementation roadmap**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-14T06:26:58Z
- **Completed:** 2026-03-14T06:37:00Z
- **Tasks:** 1
- **Files created:** 1

## Accomplishments

- Created 1205-line authoritative design document synthesizing product design thinking across 9 sections
- Identified and specified the fix for the critical gap: no collapse button exists in InboxFeed (onCollapsedChange prop never called)
- Competitive analysis of Slack, VS Code, Notion, Linear, Superhuman, and macOS Finder with specific interaction patterns
- Designed complete collapse/expand interaction including button specs, edge-knock improvements, keyboard shortcut, and animation
- Mapped all three inbox surfaces (sidebar feed, full tab, drawer) and their transition behaviors
- Full accessibility specification: ARIA roles, focus management, screen reader announcements, reduced motion
- Responsive strategy: desktop collapse, tablet bottom-sheet FAB, mobile full-screen page
- Phased implementation roadmap: Phase A (critical, 3 files, 1-2h), Phase B (important, 4-5 files, 4-6h), Phase C (nice-to-have, 5-8 files, 12-18h)

## Task Commits

1. **Task 1: Design document creation** - `71eeaeac` (docs)

## Files Created/Modified

- `.planning/quick/20-inbox-component-ux-redesign-make-collaps/20-INBOX-UX-DESIGN.md` - Comprehensive UX design specification (1205 lines)

## Decisions Made

- **Collapse trigger: header chevron button** -- most discoverable pattern per competitive analysis. Drag handles are too hidden; double-click violates accessibility expectations. Placed at header trailing edge after autopilot button.
- **Keyboard shortcut: `]` key** -- zero conflicts with existing 20+ shortcuts, mnemonic for "push panel right," no modifier required (consistent with single-key paradigm).
- **Animation: replace spring with standard easing** -- current cubic-bezier(0.34, 1.56, 0.64, 1) overshoots 15%, causing content reflow. Standard easing (0.4, 0, 0.2, 1) at 250ms provides responsive feel without artifacts.
- **Auto-collapse on tab navigation** -- when user clicks "Inbox" title to navigate to full tab, sidebar should auto-collapse since it becomes redundant.
- **No collapsed strip on tablet/mobile** -- edge-knock requires hover state (no touch equivalent), 36px strip is disproportionate on smaller viewports.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Steps

The design document at `20-INBOX-UX-DESIGN.md` is ready to serve as implementation reference. Phase A (collapse button + keyboard shortcut + animation fix) can be executed immediately -- it modifies only 3 files (`inbox-feed.tsx`, `dashboard-redesign.tsx`, `inbox-shortcuts-overlay.tsx`) with an estimated 1-2 hours of work.

---
*Quick Task: Q20*
*Completed: 2026-03-14*
