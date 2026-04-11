---
phase: quick-19
plan: 01
subsystem: ui
tags: [react, chain-of-thought, controlled-component, streaming, narration]

requires:
  - phase: Q14
    provides: chain-of-thought component and chat interface

provides:
  - Proper narration tracking via dedicated narrationContentRef
  - Controlled/uncontrolled ChainOfThought component pattern
  - First-sentence truncation for clean timeline step labels

affects: [chat-interface, chain-of-thought, reasoning-chain]

tech-stack:
  added: []
  patterns:
    - "Controlled component pattern: isControlled = open !== undefined, internal state defers to prop"
    - "narrationContentRef separate from assistantContent for pre-tool text isolation"

key-files:
  created: []
  modified:
    - personal-assistant/src/components/chat/chat-interface.tsx
    - personal-assistant/src/components/ai-elements/chain-of-thought.tsx

key-decisions:
  - "narrationContentRef tracks only pre-tool text; narration frozen at first sentence for clean stacking"
  - "ChainOfThought uses isControlled flag to choose between prop-driven and internal state"

patterns-established:
  - "Controlled/uncontrolled component pattern for compound components with open/close state"

requirements-completed: [FIX-COT-STACKING]

duration: 13min
completed: 2026-03-14
---

# Quick Task 19: Fix Chain-of-Thought Timeline Stacking Summary

**Narration isolated via dedicated ref and frozen on first tool_call; ChainOfThought controlled-mode sync fixed for parent auto-open/close**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-14T00:55:39Z
- **Completed:** 2026-03-14T01:08:39Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Narration text now freezes when first tool_call arrives, preventing unbounded growth from full assistantContent
- Chain-of-thought steps stack vertically (narration + tool call 1 + tool call 2 + ...) as independent Lego bricks
- ChainOfThought component properly syncs with parent-controlled `open` prop changes (auto-open/auto-close work)
- Narration displayed as first-sentence-only label (max 120 chars) for clean timeline appearance

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix narration tracking -- separate narrationContentRef from assistantContent** - `eb46d4af` (fix)
2. **Task 2: Fix ChainOfThought controlled component -- sync open prop with internal state** - `77baf941` (fix)

## Files Created/Modified
- `personal-assistant/src/components/chat/chat-interface.tsx` - Added narrationContentRef, rewrote content_delta handler, truncated narration display
- `personal-assistant/src/components/ai-elements/chain-of-thought.tsx` - Fixed controlled/uncontrolled state pattern for open prop

## Decisions Made
- Used dedicated `narrationContentRef` instead of deriving narration from `assistantContent` -- cleaner separation of concerns
- First-sentence truncation via regex `^[^.!?\n]+[.!?]?` for natural-looking timeline labels
- Standard React controlled/uncontrolled pattern: `isControlled = open !== undefined` determines which state source to use

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Chain-of-thought timeline now correctly stacks steps
- Ready for further chat UX improvements

---
*Phase: quick-19*
*Completed: 2026-03-14*
