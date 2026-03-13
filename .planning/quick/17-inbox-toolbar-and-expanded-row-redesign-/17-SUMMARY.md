---
phase: Q17
plan: 01
subsystem: inbox
tags: [inbox, toolbar, expanded-row, ghost-draft, invisible-ai, text-sanitization]
dependency-graph:
  requires: [inbox-tab.tsx, use-inbox-keyboard.ts]
  provides: [sanitizeText, AttachmentPills, ghost-draft-composer, floating-bulk-bar]
  affects: [inbox-tab.tsx, use-inbox-keyboard.ts]
tech-stack:
  patterns: [ghost-draft-overlay, invisible-ai, floating-action-bar, text-sanitization]
key-files:
  modified:
    - personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
    - personal-assistant/src/hooks/use-inbox-keyboard.ts
key-decisions:
  - "Ghost draft uses absolute-positioned overlay div, not placeholder attribute (richer formatting)"
  - "sanitizeText handles SSR without document.createElement (manual entity replacement)"
  - "AttachmentPills is a structural stub that renders nothing until data is passed"
  - "handleNavigateLocal dispatches snooze via data attribute query (no prop drilling)"
  - "Category pills remove all count badges per design brief -- reduces anxiety"
metrics:
  duration: 18min
  completed: 2026-03-14
  tasks: 2
  files: 2
---

# Quick Task 17: Inbox Toolbar & Expanded Row Redesign Summary

Redesigned inbox toolbar category pills (Focus default, no count badges, orange dot indicator, floating bulk action bar) and expanded message row (invisible AI integration, ghost draft reply composer, text sanitization, bottom action buttons, decluttered header layout).

## Task 1: Toolbar category pills + floating bulk action bar

**Commit:** 6ec9561c (Task 1 changes merged with concurrent agent commit) + aba9723d (Task 2 includes remaining refinements)

**Changes:**
- Renamed `priority` pill label from "Priority" to "Focus" (internal key unchanged)
- Default active pill changed from `'all'` to `'priority'` (Focus is the landing view)
- Removed count badge spans from all category pills
- Added orange dot indicator (6px, var(--bb-orange)) on Focus pill when `hasUnreadPriority && !isActive`
- Added tooltip with keyboard shortcut to each pill: "All (1)", "Focus (2)", etc.
- Simplified pill styles: active = white bg/dark text, inactive = transparent/dim text (no glassmorphic blur on inactive)
- Removed inline bulk action bar div (was pushed content down)
- Added floating bulk action bar with `position: fixed; bottom: 80px` (above undo toast at 24px)
- Bulk bar: glassmorphic styling (blur 20px, rgba(15,20,30,0.95)), z-index 50
- Added Snooze and Spam buttons to bulk bar alongside Archive, Done, X
- Added `handleBulkSpam` callback

## Task 2: Expanded row redesign

**Commit:** aba9723d

**Changes:**

### sanitizeText utility
- Decodes 20+ HTML entities (&amp; &lt; &gt; &#39; &rsquo; &mdash; etc.)
- Numeric entity decoder: `&#NNN;` and `&#xHHH;`
- Strips remaining HTML tags via regex
- Normalizes whitespace (collapse tabs/spaces)
- Applied to: bodyPreview, aiSummary, subject, sender name, action items, thread messages, draft reply text

### Invisible AI integration
- Removed the "AI Summary" boxed panel (purple border, sparkle icon, "AI Summary" header)
- AI summary now renders as a plain `<p>` tag with fade-in animation (300ms)
- Same font size (14px), color (82% white), line height (1.6) as body text
- Thin 1px divider (4% white) between summary and body text
- Action items now use neutral colors: text rgba(255,255,255,0.6), chevron rgba(255,255,255,0.3)
- Removed shimmerStyle loading skeleton entirely -- body text shows while AI loads, summary fades in

### Ghost draft reply composer
- Ghost text rendered as absolute-positioned div over textarea with pointer-events: none
- Style: rgba(255,255,255,0.25), italic, same font/size/padding as textarea
- Tab key accepts ghost draft: sets replyText, auto-expands textarea, positions cursor at end
- Any keystroke in textarea dismisses ghost (sets ghostDismissed flag)
- If textarea cleared, ghost reappears after 500ms debounce via useEffect timer
- "Tab to use suggested reply" hint shown below composer when ghost visible
- "Cmd+Enter to send" hint shown when text is present
- Placeholder attribute conditionally empty when ghost is visible

### Header restructure
- Row 1: Channel icon (14px) + Sender name (14px, 600 weight) + Date (right-aligned, 12px dim)
- Row 2: sender@email.com (12px, dim, 22px left padding)
- No borderBottom between header and content -- spacing only (20px gap via padding)

### Action buttons moved to bottom
- Removed action pills from header area entirely
- Bottom bar contains: Reply, Archive, Done, Snooze, Forward, Create Task (conditional on action items), Spam (right-aligned), Close (X)
- Create Task dispatches `bb:create-task` custom event

### Content area
- Added max-height: 60vh with overflow-y: auto and thin scrollbar
- Body text always visible (not conditional on thread existence)
- Thread view renders after body text

### AttachmentPills stub
- Structural component that accepts `{ name, size, type }[]` array
- Renders nothing when attachments is undefined/empty
- Placed after action items, before thread view

### Keyboard shortcuts
- Extended category switch range from 1-4 to 1-5 (covers all 5 pills)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed TypeScript error with useRef initial value**
- Found during: Task 2
- Issue: `useRef<ReturnType<typeof setTimeout>>()` requires explicit initial value in strict mode
- Fix: Changed to `useRef<ReturnType<typeof setTimeout>>(undefined)`
- Files: inbox-tab.tsx

**2. [Rule 3 - Blocking] Task 1 commit absorbed by concurrent agent**
- Found during: Task 1 commit
- Issue: Another parallel agent committed changes to inbox-tab.tsx simultaneously, absorbing Task 1 changes into commit 6ec9561c
- Fix: Continued with Task 2 which captured all remaining changes in aba9723d
- Impact: None -- all Task 1 changes are present in the final codebase

## Self-Check: PASSED

- [x] inbox-tab.tsx exists and contains all changes
- [x] use-inbox-keyboard.ts exists with 1-5 range
- [x] Commit aba9723d exists
- [x] TypeScript compiles with zero errors in target files
- [x] Focus is default active pill
- [x] No count badges on pills
- [x] Orange dot on Focus pill when hasUnreadPriority
- [x] Floating bulk bar with glassmorphic styling
- [x] AI summary renders as seamless paragraph (no box, no header, no sparkle)
- [x] Ghost draft overlay with Tab acceptance
- [x] sanitizeText applied to all user-facing text
- [x] Action buttons at bottom, not top
- [x] AttachmentPills stub present
