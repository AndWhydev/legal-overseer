---
phase: 21-improve-whisper-text
plan: 01
subsystem: ui
tags: [whispers, text-templates, ux-copy, truncation]

requires:
  - phase: whisper-system
    provides: "Whisper source functions and types"
provides:
  - "Consistent, concise, product-voiced whisper text templates across all 5 sources"
  - "truncateWhisper helper enforcing 45-char max with word-boundary truncation"
affects: [whisper-rendering, chat-ui]

tech-stack:
  added: []
  patterns:
    - "truncateWhisper inline helper for 45-char pill budget"
    - "Priority-prefix framing for task whispers (Urgent:/Priority:)"
    - "Action-oriented contact follow-up framing (Follow up with/Reach out to)"
    - "Severity-prefix for anomaly alerts (Alert:/Warning:/Notice:)"

key-files:
  created: []
  modified:
    - personal-assistant/src/lib/whispers/sources/unfinished-momentum.ts
    - personal-assistant/src/lib/whispers/sources/due-items.ts
    - personal-assistant/src/lib/whispers/sources/stale-contacts.ts
    - personal-assistant/src/lib/whispers/sources/anomalies.ts
    - personal-assistant/src/lib/whispers/sources/proactive-completions.ts

key-decisions:
  - "Inline truncateWhisper per file rather than shared util -- avoids import overhead for a one-liner"
  - "45-char budget with word-boundary truncation and ellipsis fallback"
  - "Hot leads get 'Reach out to' vs standard 'Follow up with' for stale contacts"
  - "'Handled a task for you' as personality fallback when action_summary is null"

patterns-established:
  - "Whisper text must never exceed 45 characters"
  - "All whisper text uses BitBit's proactive assistant voice"
  - "Structured prefixes (Urgent:/Priority:/Alert:/Warning:/Notice:/Approve:/Done:) for categorization"

requirements-completed: [WHISPER-TEXT-01]

duration: 10min
completed: 2026-03-26
---

# Quick Task 21: Whisper Text Generation Summary

**Rewrote all 5 whisper source text templates with truncateWhisper helper, structured prefixes, and BitBit's proactive voice -- all under 45 chars**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-26T11:35:03Z
- **Completed:** 2026-03-26T11:45:11Z
- **Tasks:** 2 (1 auto + 1 human-verify)
- **Files modified:** 5

## Accomplishments

- Added `truncateWhisper` helper to all 5 whisper sources enforcing 45-char max with word-boundary truncation
- Task whispers now use priority-prefix framing (`Urgent:` / `Priority:`) instead of raw titles
- Stale contact whispers reframed from passive observation to proactive suggestions (`Follow up with {Name}?` / `Reach out to {Name}?`)
- Anomaly alerts use severity-prefix (`Alert:` / `Warning:` / `Notice:`), approvals use `Approve:` prefix
- Completion whispers use `Done:` prefix with personality fallback (`Handled a task for you`)
- Invoice whispers tightened by dropping "is" for brevity
- Momentum topic truncation reduced from 50 to 28 chars to stay within budget

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite all 5 whisper source text templates** - `7bdfbba6` (feat)
2. **Task 2: Human verification** - approved by user

## Files Modified

- `personal-assistant/src/lib/whispers/sources/unfinished-momentum.ts` - Tightened topic to 28 chars, added truncateWhisper
- `personal-assistant/src/lib/whispers/sources/due-items.ts` - Priority-prefix for tasks, brevity fix for invoices, added truncateWhisper
- `personal-assistant/src/lib/whispers/sources/stale-contacts.ts` - Reframed as proactive suggestions with lead-score awareness
- `personal-assistant/src/lib/whispers/sources/anomalies.ts` - Severity-prefix for alerts, Approve: prefix for approvals
- `personal-assistant/src/lib/whispers/sources/proactive-completions.ts` - Done: prefix with personality fallback

## Decisions Made

- Inline `truncateWhisper` per file rather than shared util -- avoids import overhead for a one-liner
- 45-char budget with word-boundary truncation and ellipsis fallback for hard cuts
- Hot leads get "Reach out to" vs standard "Follow up with" for stale contacts
- "Handled a task for you" as personality fallback when action_summary is null (not "Completed a task")

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

---
*Quick Task: 21-improve-whisper-text*
*Completed: 2026-03-26*
