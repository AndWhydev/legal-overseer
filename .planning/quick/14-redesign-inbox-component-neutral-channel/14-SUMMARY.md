---
phase: Q14
plan: 01
subsystem: dashboard-inbox
tags: [ui, glassmorphic, inbox, panel-interaction]
dependency_graph:
  requires: []
  provides: [neutral-channel-icons, edge-knock-panel, refined-inbox-header]
  affects: [inbox-feed, dashboard-redesign]
tech_stack:
  added: []
  patterns: [edge-knock-proximity-detection, spring-animation, monochrome-icons]
key_files:
  created: []
  modified:
    - personal-assistant/src/components/dashboard/inbox-feed.tsx
    - personal-assistant/src/components/dashboard/dashboard-redesign.tsx
decisions:
  - Unified neutral icon color rgba(255,255,255,0.4) for all 9 channel types
  - Time label on subject line (right-aligned) instead of sender line for cleaner hierarchy
  - Autopilot as 28x28 icon-only button with tooltip (no text label)
  - Edge-knock proximity zone of 60px from right viewport edge
  - Spring cubic-bezier(0.34, 1.56, 0.64, 1) for premium panel transitions
metrics:
  duration: 17min
  completed: 2026-03-14
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Quick Task 14: Redesign Inbox Component -- Neutral Channel Icons and Edge-Knock Panel

Neutral monochrome channel icons, time-on-subject-line layout, icon-only autopilot, clickable inbox title, and premium edge-knock panel expand/collapse with cursor proximity detection.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Neutral icons, time placement fix, header controls refinement | af8caeb4 | inbox-feed.tsx |
| 2 | Premium edge-knock panel expand/collapse with proximity detection | 2ad5e21d | dashboard-redesign.tsx |

## Changes Made

### Task 1: Inbox Feed Redesign (inbox-feed.tsx)

**Neutral channel icons:** All 9 channel icon components (Gmail, Outlook, WhatsApp, iMessage, Asana, Stripe, Slack, Calendar, SMS) changed from brand-specific colors to unified `rgba(255, 255, 255, 0.4)` monochrome tone.

**Time placement fix:** Time label moved from sender line (Line 2) to subject line (Line 1), right-aligned with `flexShrink: 0`. Subject truncates to accommodate time via `flex: 1, minWidth: 0`. Dot divider removed.

**Sender line cleanup:** Line 2 now shows only the sender name with no time suffix or dot divider. Simplified from a flex container to a plain span.

**Header controls:**
- Removed `Maximize2` fullscreen button entirely
- Removed `ChevronLeft`/`ChevronRight` collapse toggle button (collapse now handled by parent's edge knock)
- "Inbox" title text is now clickable (navigates to inbox tab via `bb-navigate` event) with subtle opacity hover
- Autopilot button reduced from pill with text to 28x28 icon-only button with `title` tooltip, transparent background when inactive

**Imports cleaned:** Removed `Maximize2`, `ChevronLeft`, `ChevronRight` from lucide-react imports.

### Task 2: Edge-Knock Panel (dashboard-redesign.tsx)

**Edge indicator strip:** Replaced the 32x32 chevron button with a thin vertical luminous strip (3px wide, centered). The strip has a base opacity of 0.06 that increases to 0.20 as cursor approaches.

**Proximity detection:** `useEffect` with `mousemove` listener calculates cursor distance from the right viewport edge. Within the 60px proximity zone, a float from 0-1 drives glow intensity. Uses `requestAnimationFrame` for smooth 60fps updates. Properly cleans up listener and animation frame on unmount.

**Glow effects:** When proximity exceeds 30%, the strip gains a white box-shadow glow (`8px` and `20px` spread). When proximity exceeds 50%, a chevron hint icon fades in with matching opacity.

**Spring animation:** Grid transition updated from `ease` to `cubic-bezier(0.34, 1.56, 0.64, 1)` with 0.4s duration for a bouncy/premium panel expand feel.

**Column width:** Collapsed column refined from 40px to 36px for a more refined edge strip appearance.

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- TypeScript compiles cleanly (only pre-existing errors in e2e test file, unrelated)
- All 9 channel icons use rgba(255,255,255,0.4) -- zero brand colors
- Time on line 1 right of subject, sender on line 2 alone
- No Maximize2 button, no chevron collapse button in inbox header
- Autopilot is 28x28 icon-only with tooltip
- Edge knock: luminous strip visible when collapsed, glow responds to cursor proximity (60px zone)
- Spring animation on panel expand/collapse

## Self-Check: PASSED
