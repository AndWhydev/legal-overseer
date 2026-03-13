---
phase: Q18
plan: 01
subsystem: inbox-ui
tags: [polish, inbox, glassmorphic, filter-chips, expanded-row]
dependency-graph:
  requires: [Q17-01]
  provides: [polished-inbox-toolbar, polished-expanded-row]
  affects: [inbox-tab.tsx, bitbit-design-system.css]
tech-stack:
  added: []
  patterns: [inline-filter-chips, icon-action-buttons, chat-style-reply-composer, continuous-glass-card]
key-files:
  created: []
  modified:
    - personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
    - personal-assistant/src/styles/bitbit-design-system.css
decisions:
  - Inline filter chips replace dropdown Filters drawer for faster access
  - Icon-only action buttons in expanded row (no text labels) for minimal visual weight
  - Chat-style pill reply composer matches chat page design language
  - AI summary and body text are mutually exclusive (show one, never both)
  - Hover actions removed from MessageRow entirely (all actions in expanded row)
metrics:
  duration: 20min
  completed: 2026-03-14
---

# Quick Task 18: Inbox Polish -- Fix Hover Time, Deduplicate Body, Chat-Style Reply

12 user-reported polish fixes applied: toolbar cleanup (time visibility, AI Brief removal, filter chips, glassmorphic refresh) and expanded row improvements (inline email, deduplicated body, ghost alignment, icon actions, chat-style reply, continuous card).

## Task 1: Toolbar cleanup

**CSS changes (bitbit-design-system.css):**
- Removed hover crossfade rules that hid time text on row hover (`.bb-inbox-row:hover .bb-inbox-row__meta-default { opacity: 0 }`)
- Removed all `.bb-inbox-row__hover-actions` and `.bb-inbox-row__action` CSS rules (base, selected, light-mode, responsive)

**TSX changes (inbox-tab.tsx):**
- Deleted `AiBriefPanel` component, `showAiBrief` state, `aiBriefRef`, click-outside useEffect
- Deleted `InboxSelect` component, `showFilters` state, `statusFilter` state, filter drawer JSX
- Removed `Filter`, `Sparkles`, `ListTodo` from lucide-react imports
- Added `FilterChipsBar` component with Channel (All/Gmail/Outlook/WhatsApp/Asana/Calendly/Stripe) and Priority (All/Critical/High/Medium/Low) chip groups
- Chips use glassmorphic inline styles matching `bb-chat__chip` pattern: `var(--glass-pill-bg)`, `var(--glass-card-blur)`, `var(--glass-pill-inset)`
- Active chip: white background with dark text (#0A0A0B), fontWeight 600
- Separator (1px, 16px tall, 8% white) between channel and priority groups
- Replaced Refresh button with glassmorphic chip style matching filter chips
- Removed hover action buttons from MessageRow (Archive/Done/Snooze/Reply/Star)
- Removed `actionBtnStyle` const
- Updated `hasActiveFilters` and `clearFilters` to exclude `statusFilter`

## Task 2: Expanded row fixes

**Fix 6 - Inline email:** Merged sender email onto one line with name: `[Icon] Name . email@example.com ... date`
**Fix 7 - Deduplicate body:** AI summary and body text are now mutually exclusive (ternary, not stacked)
**Fix 8 - Body truncation:** Already correct (60vh scrollable area, no line-clamp)
**Fix 9 - Ghost alignment:** Ghost overlay now inside pill textarea area with matching padding (`8px 0`) and lineHeight (1.5)
**Fix 10 - Icon-only actions:** New `IconActionBtn` component: 32x32, borderRadius 8, transparent bg, 16px icons, hover color transition. Spam button uses red tint.
**Fix 11 - Chat-style reply:** Pill-shaped glass container: `var(--glass-pill-bg)`, borderRadius 20, transparent textarea, circular send button (orange when text present)
**Fix 12 - Continuous card:** Expanded row: marginTop 0 (flush), background matches parent row (`rgba(10,14,23,0.5)`), top border 1px separator, boxShadow inset. MessageRow gets `borderRadius: '12px 12px 0 0'` when expanded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed ListTodo usage from expanded row**
- **Found during:** Task 1 (build failed after removing ListTodo import)
- **Issue:** The `Create Task` button in expanded row action bar used ListTodo, which was removed from imports in Task 1
- **Fix:** Removed the Create Task button early (planned for Task 2) to unblock build
- **Files modified:** inbox-tab.tsx
- **Commit:** Part of Task 1 commit

**2. [Parallel agent interference] Commits rebased by concurrent agent**
- Task 1 and Task 2 commits were incorporated into parallel agent commits via `git pull --rebase`
- Task 1 changes landed in commit `70fc5f51` (feat: stronger aura blobs + chunky grain noise filter)
- Task 2 changes landed in commit `64fe1b47` (fix(chat): revert pill container)
- All code changes verified present in HEAD

## Verification

- Build passes: 0 errors, 0 type errors
- Time text stays visible on hover (CSS crossfade rules deleted)
- AI Brief button, panel, state removed
- Filters dropdown button, drawer removed
- Inline filter chips render below category pills
- Refresh uses glassmorphic chip style
- Expanded row is continuous glass card
- Reply input is pill-shaped
- Action buttons are icon-only
