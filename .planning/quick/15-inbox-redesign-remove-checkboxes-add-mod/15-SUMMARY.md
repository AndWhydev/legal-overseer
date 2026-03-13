---
phase: Q16
plan: 01
subsystem: inbox-ux
tags: [inbox, selection, expansion, keyboard, css]
dependency_graph:
  requires: []
  provides: [modifier-key-selection, inline-expanded-rows, white-inverted-selected-state]
  affects: [inbox-tab, use-inbox-keyboard, inbox-shortcuts-overlay, bitbit-design-system]
tech_stack:
  added: []
  patterns: [modifier-key-click-handling, inline-accordion-expansion, css-data-attribute-styling]
key_files:
  created: []
  modified:
    - personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
    - personal-assistant/src/hooks/use-inbox-keyboard.ts
    - personal-assistant/src/styles/bitbit-design-system.css
    - personal-assistant/src/components/dashboard/inbox-shortcuts-overlay.tsx
decisions:
  - "Modifier-key multi-select replaces checkbox: Shift+click for range, Cmd/Ctrl+click for toggle"
  - "Inline ExpandedMessageRow replaces InboxDrawer side panel"
  - "White-inverted selected state via CSS data-selected (dark mode: white bg + dark text)"
  - "AI summary inline extraction reused from inbox-drawer.tsx pattern (extractSummaryInline)"
  - "Thread view embedded in expanded row with collapsible entries"
metrics:
  duration: 13min
  completed: 2026-03-14
---

# Quick Task 16: Remove Checkboxes, Add Modifier-Key Multi-Select, Inline Expanded Rows

Replaced inbox checkboxes with modifier-key multi-select (Shift+click range, Cmd/Ctrl+click toggle) and replaced the InboxDrawer side panel with inline expandable rows showing full message content, AI summary, thread history, and reply composer.

## Tasks Completed

### Task 1: Remove checkboxes, add modifier-key multi-select, white-inverted selected state
**Commit:** `6d7bd10d`

- Removed the 18x18 checkbox div from MessageRow entirely
- Added `onRowClick` prop to MessageRow that passes `(id, index, event)` up to parent
- Implemented modifier-key click handler in InboxTab:
  - `e.shiftKey` -- range select from lastClickedIndexRef to current index
  - `e.metaKey || e.ctrlKey` -- toggle individual selection
  - Plain click -- expand/collapse (wired in Task 2)
- Added `lastClickedIndexRef = useRef<number>(-1)` for range selection tracking
- Removed `onToggleSelect` prop from MessageRow (no checkbox to toggle)
- Removed orange selected inline style `rgba(255, 90, 31, 0.06)` from row
- Added CSS `data-selected` styles:
  - Dark mode: `rgba(255, 255, 255, 0.95)` background with dark text (#0A0F1A)
  - Light mode: `#1A1A1B` background with light text (#F1F5F9)
  - Inverted hover action gradient backgrounds
- Removed `isDrawerOpen` from `UseInboxKeyboardOptions` interface and handler
- Updated shortcuts overlay: replaced `x` toggle with `Shift+Click` range select and `Cmd/Ctrl+Click` toggle select

### Task 2: Replace InboxDrawer with inline expandable rows
**Commit:** `5ea67e91`

- Removed `InboxDrawer` import and render block from inbox-tab.tsx
- Added `expandedId` state to InboxTab for tracking which row is expanded
- Created `ExpandedMessageRow` component (inline, within inbox-tab.tsx) containing:
  - Header bar: sender name, email, full date, channel icon, action pills (Reply, Archive, Done, Spam)
  - AI Summary panel: shimmer loading, summary text, action items, Create Task + Draft Reply buttons (only when significance >= 5)
  - Thread view: collapsible thread messages with avatar, sender, time, body (replicates drawer's ThreadView)
  - Full body text: pre-wrap readable paragraph when no thread
  - Reply composer: auto-expand textarea with Cmd+Enter send, Send button
- Added `extractSummaryInline` helper (copied pattern from inbox-drawer.tsx)
- Expanded row renders as accordion below the clicked MessageRow with fade-in animation
- Scroll-into-view on expand for smooth UX
- Escape key closes expanded row (with textarea blur handling)
- j/k keyboard navigation works alongside expansion
- Enter/o from keyboard toggles expand/collapse

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

1. TypeScript compilation: PASSED (only pre-existing e2e test errors)
2. Next.js build: PASSED (all routes compiled successfully)
3. No checkbox elements in MessageRow
4. Selected rows use CSS data-selected white-inverted styling
5. InboxDrawer import and render removed

## Self-Check: PASSED
