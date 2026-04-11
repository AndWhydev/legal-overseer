---
phase: Q16
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
  - personal-assistant/src/hooks/use-inbox-keyboard.ts
  - personal-assistant/src/styles/bitbit-design-system.css
  - personal-assistant/src/components/dashboard/inbox-shortcuts-overlay.tsx
autonomous: true
requirements: [Q16-01, Q16-02, Q16-03, Q16-04]

must_haves:
  truths:
    - "No visible checkbox elements on any inbox message row"
    - "Shift+click selects a contiguous range of messages between last-clicked and current"
    - "Cmd/Ctrl+click toggles individual message selection without deselecting others"
    - "Plain click on a message row expands it inline with full content, AI summary, thread, and reply composer"
    - "Selected rows have white/light background with inverted dark text and icons"
    - "No side drawer panel opens when clicking a message"
  artifacts:
    - path: "personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx"
      provides: "MessageRow without checkbox, ExpandedMessageRow inline panel, modifier-key click handling"
    - path: "personal-assistant/src/hooks/use-inbox-keyboard.ts"
      provides: "lastClickedIndex ref for Shift+click range calculation"
    - path: "personal-assistant/src/styles/bitbit-design-system.css"
      provides: "data-selected styles with white bg, dark text inversion"
    - path: "personal-assistant/src/components/dashboard/inbox-shortcuts-overlay.tsx"
      provides: "Updated shortcut descriptions reflecting new selection model"
  key_links:
    - from: "inbox-tab.tsx MessageRow onClick"
      to: "expandedId state"
      via: "plain click sets expandedId, shift/ctrl click modifies selectedIds"
      pattern: "e\\.shiftKey|e\\.metaKey|e\\.ctrlKey"
    - from: "inbox-tab.tsx ExpandedMessageRow"
      to: "AiSummaryPanel, ThreadView, reply composer"
      via: "inline accordion render below the clicked row"
      pattern: "expandedId === msg\\.id"
---

<objective>
Remove checkboxes from inbox message rows, replace with modifier-key multi-select (Shift+click for range, Cmd/Ctrl+click for toggle), add white-inverted selected state styling, and replace the side drawer panel with inline expandable rows that show full message content, AI summary, thread history, and reply composer accordion-style.

Purpose: Modernize the inbox UX to match email client conventions -- no clunky checkboxes, intuitive modifier-key selection, and inline content expansion instead of a separate drawer panel that hides the message list.

Output: Updated inbox-tab.tsx, use-inbox-keyboard.ts, design system CSS, and shortcuts overlay.
</objective>

<execution_context>
@/home/claude/.claude/get-shit-done/workflows/execute-plan.md
@/home/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
@personal-assistant/src/hooks/use-inbox-keyboard.ts
@personal-assistant/src/components/dashboard/inbox-drawer.tsx
@personal-assistant/src/components/dashboard/inbox-shortcuts-overlay.tsx
@personal-assistant/src/styles/bitbit-design-system.css

<interfaces>
<!-- From inbox-tab.tsx: MessageRow props (lines 1331-1344) -->
MessageRow receives: message, onArchive, onDone, onSnooze, onReply, onStar, onClick,
  focused, selected, onToggleSelect, starred

<!-- From inbox-drawer.tsx: Components to move inline -->
AiSummaryPanel (lines 229-357): message prop, onCreateTask, onDraftReply
ThreadView (lines 364-523): messages (ThreadMessageItem[]), onFocusReply
Reply composer (lines 915-953): textarea + send button

<!-- From use-inbox-keyboard.ts: hook interface (lines 7-36) -->
UseInboxKeyboardOptions: enabled, messageCount, isDrawerOpen, onOpen, onArchive, onDone,
  onReply, onForward, onSnooze, onStar, onDelete, onSpam, onSelect, onSelectAll,
  onDeselectAll, onCategorySwitch, onSearch, onClose, onGoInbox
UseInboxKeyboardReturn: selectedIndex, setSelectedIndex, selectedIds, setSelectedIds,
  showShortcuts, setShowShortcuts

<!-- From inbox-tab.tsx: InboxDrawer usage (lines 827-836) -->
InboxDrawer is rendered at bottom of InboxTab with selectedMessage state.
Clicking a row sets selectedMessage, drawer opens. Must be replaced with expandedId state.

<!-- Key CSS classes from bitbit-design-system.css -->
.bb-inbox-row: glassmorphic message row with data-unread, data-important, data-level,
  data-focused, data-selected attributes
.bb-inbox-row:hover .bb-inbox-row__hover-actions: opacity 1 crossfade
.bb-inbox-row:hover .bb-inbox-row__meta-default: opacity 0 crossfade
Currently data-selected has orange background: rgba(255, 90, 31, 0.06) -- needs white inversion

<!-- Checkbox element to remove (inbox-tab.tsx lines 1409-1420) -->
A div styled as checkbox before col1, with onClick stopPropagation + onToggleSelect.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove checkboxes, add modifier-key multi-select, white-inverted selected state</name>
  <files>
    personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
    personal-assistant/src/hooks/use-inbox-keyboard.ts
    personal-assistant/src/styles/bitbit-design-system.css
    personal-assistant/src/components/dashboard/inbox-shortcuts-overlay.tsx
  </files>
  <action>
**inbox-tab.tsx -- MessageRow component (around line 1389-1555):**
1. DELETE the checkbox div entirely (lines 1409-1420 -- the 18x18 div with border, onClick stopPropagation, and CheckCircle2 icon).
2. CHANGE the row's onClick handler. Currently it's just `onClick={onClick}` which opens the drawer. Replace with a new handler that checks modifier keys:
   - If `e.shiftKey` -- perform range selection: select all messages between `lastClickedIndexRef.current` and the current message index (inclusive). Use the `displayed` array indices. Add all IDs in range to selectedIds. Update lastClickedIndexRef.
   - If `e.metaKey || e.ctrlKey` -- toggle individual: if already selected, remove from selectedIds; if not, add. Update lastClickedIndexRef.
   - If neither modifier -- this is a plain click. Do NOT select. Instead set `expandedId` (handled in Task 2). Update lastClickedIndexRef.
3. REMOVE the `onToggleSelect` prop from MessageRow entirely (no more checkbox toggle needed).
4. REMOVE the `selected` inline style override `{ background: 'rgba(255, 90, 31, 0.06)' }` from the row's style prop (line 1405). Selected styling will come from CSS `data-selected` attribute.
5. ADD a `lastClickedIndexRef = useRef<number>(-1)` to the InboxTab component, near the other refs. Pass the current message index to MessageRow via a new `index` prop.

**inbox-tab.tsx -- InboxTab component:**
6. ADD `const lastClickedIndexRef = useRef<number>(-1);` near line 342.
7. CHANGE the MessageRow onClick callback (around line 807). Instead of `onClick={() => setSelectedMessage(msg)}`, implement the modifier-key logic described above. The handler receives the React.MouseEvent from MessageRow (MessageRow must pass it up).
8. UPDATE MessageRow props: add `index: number` prop. In MessageRow, change onClick to pass the event: `onClick={(e) => { onRowClick?.(msg.id, index, e); }}` where `onRowClick` replaces `onClick`.

**use-inbox-keyboard.ts:**
9. REMOVE `isDrawerOpen` from UseInboxKeyboardOptions (no more drawer). Keep the hook otherwise functional. The `enabled` prop already gates keyboard shortcuts.
10. UPDATE the Selection shortcuts description in the overlay:
    - Change "x -- Toggle select" to "Shift+Click -- Range select"
    - Add "Cmd/Ctrl+Click -- Toggle select"
    - Keep "Cmd+A -- Select all" and "Cmd+Shift+A -- Deselect all"

**inbox-shortcuts-overlay.tsx:**
11. UPDATE the SHORTCUTS array:
    - Remove the `{ keys: ['x'], description: 'Toggle select', category: 'Selection' }` entry
    - Add `{ keys: ['Shift', 'Click'], description: 'Range select', category: 'Selection' }`
    - Add `{ keys: ['Cmd/Ctrl', 'Click'], description: 'Toggle select', category: 'Selection' }`

**bitbit-design-system.css:**
12. ADD/UPDATE the `data-selected` styles for `.bb-inbox-row[data-selected]`:
    ```css
    .bb-inbox-row[data-selected] {
      background: rgba(255, 255, 255, 0.95) !important;
      box-shadow: inset 0 1px 0 rgba(0, 0, 0, 0.05);
    }
    .bb-inbox-row[data-selected] .bb-inbox-row__sender,
    .bb-inbox-row[data-selected] .bb-inbox-row__subject {
      color: #0A0F1A;
    }
    .bb-inbox-row[data-selected] .bb-inbox-row__preview {
      color: #374151;
    }
    .bb-inbox-row[data-selected] .bb-inbox-row__time {
      color: #6B7280;
    }
    .bb-inbox-row[data-selected] .bb-inbox-row__tag {
      color: #0A0F1A;
      background: rgba(0, 0, 0, 0.08);
    }
    ```
    Also add light mode variant:
    ```css
    html.light .bb-inbox-row[data-selected] {
      background: #1A1A1B !important;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }
    html.light .bb-inbox-row[data-selected] .bb-inbox-row__sender,
    html.light .bb-inbox-row[data-selected] .bb-inbox-row__subject {
      color: #F1F5F9;
    }
    html.light .bb-inbox-row[data-selected] .bb-inbox-row__preview {
      color: #CBD5E1;
    }
    html.light .bb-inbox-row[data-selected] .bb-inbox-row__time {
      color: #94A3B8;
    }
    html.light .bb-inbox-row[data-selected] .bb-inbox-row__tag {
      color: #F1F5F9;
      background: rgba(255, 255, 255, 0.12);
    }
    ```

**IMPORTANT:** Do NOT remove the InboxDrawer import or the InboxDrawer render yet -- that is handled in Task 2. This task focuses only on checkboxes, selection model, and selected styling.
  </action>
  <verify>
    <automated>cd /home/claude/bitbit && npx tsc --noEmit --project personal-assistant/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>
    - No checkbox div in MessageRow (the 18x18 border div is gone)
    - Shift+click on message rows selects contiguous range between last-clicked and current
    - Cmd/Ctrl+click toggles individual selection without deselecting others
    - Plain click does not select (falls through to expand logic in Task 2)
    - Selected rows show white background with dark/inverted text in dark mode
    - Selected rows show dark background with light/inverted text in light mode
    - Shortcuts overlay updated with new selection descriptions
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Replace InboxDrawer with inline expandable rows</name>
  <files>
    personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
  </files>
  <action>
**Replace drawer with inline expansion:**

1. ADD `const [expandedId, setExpandedId] = useState<string | null>(null);` state to InboxTab (replaces `selectedMessage` for the drawer).
2. KEEP `selectedMessage` only if needed for data; otherwise replace it with a computed `const expandedMessage = displayed.find(m => m.id === expandedId) || null;`.
3. REMOVE the `<InboxDrawer ... />` render block (lines 827-836). Remove the InboxDrawer import from the top of the file (line 12).
4. In the plain-click handler from Task 1 (no modifier keys), set `setExpandedId(prev => prev === msg.id ? null : msg.id)` -- clicking an already-expanded row collapses it.

**Create ExpandedMessageRow component inside inbox-tab.tsx:**

5. CREATE a new `ExpandedMessageRow` component that renders BELOW the clicked MessageRow in the message list. It should contain:
   - **Header bar:** sender name, email, full date, channel icon with brand color, action buttons (Reply, Archive, Done, Spam) styled as small glassmorphic pills
   - **AI Summary panel:** Reuse the `AiSummaryPanel` component from inbox-drawer.tsx (copy it into inbox-tab.tsx or import from a shared location). Show only when `message.significance >= 5`. Include the "Create Task" and "Draft Reply" buttons.
   - **Thread view:** Reuse the `ThreadView` component from inbox-drawer.tsx (copy into inbox-tab.tsx). Show thread messages if available from `SEED_THREAD_MESSAGES[msg.id]`. Each thread message is collapsible with sender, time, body preview.
   - **Full body text:** Show full `message.bodyPreview` in a readable paragraph with whitespace pre-wrap.
   - **Reply composer:** A textarea with auto-expand (min 40px, max 200px), "Send" button, Cmd+Enter shortcut hint. Same pattern as drawer's reply composer.

6. STYLE the expanded row:
   - Container: slightly inset from the row edges, with a subtle top border `rgba(255,255,255,0.06)`, padding 20px, background matching the row's glass material but slightly darker/distinct.
   - Animate open: use CSS `max-height` transition or a simple opacity+height animation. A `data-expanded` attribute on a wrapper div with CSS transition works well. Or use inline style with a simple fade-in.
   - The expanded area should feel like the row "opened up" -- same width as the row, flush left/right.

7. RENDER the expanded content. In the message list map, after each `<MessageRow>`, conditionally render:
   ```tsx
   {expandedId === msg.id && (
     <ExpandedMessageRow
       message={msg}
       threadMessages={SEED_THREAD_MESSAGES[msg.id]}
       onArchive={handleArchive}
       onDone={handleDone}
       onReply={handleReply}
       onClose={() => setExpandedId(null)}
     />
   )}
   ```

8. KEYBOARD: When the expanded row is open:
   - Escape closes it (set expandedId to null)
   - j/k should still navigate the message list (the keyboard hook handles this)
   - The `isDrawerOpen` check in the keyboard hook was removed in Task 1. Instead, if `expandedId` is set, keyboard shortcuts should still work for navigation but Enter/o should toggle expand rather than open drawer.

9. UPDATE the `handleNavigate` callback. Since there is no drawer, j/k navigation from the keyboard hook still works. But if a message is expanded and user presses j/k, collapse the current expansion and move to the next/prev message. Update `onOpen` in the keyboard hook config: `onOpen: (index) => setExpandedId(displayed[index]?.id || null)`.

10. SCROLL into view: When a row is expanded, scroll the expanded content into view with `element.scrollIntoView({ behavior: 'smooth', block: 'nearest' })`.

**Keep the hover action buttons on MessageRow.** They remain functional (archive, done, snooze, reply, star).

**Use inline React styles** for the expanded row (consistent with project convention -- Tailwind OK for layout, inline styles for visual design).
  </action>
  <verify>
    <automated>cd /home/claude/bitbit && npx tsc --noEmit --project personal-assistant/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>
    - InboxDrawer import and render removed from inbox-tab.tsx
    - Plain clicking a message row expands it inline (accordion style) below the row
    - Expanded row shows: action buttons, AI summary (if significance >= 5), thread view, full body text, reply composer
    - Clicking an already-expanded row collapses it
    - Escape key collapses the expanded row
    - j/k keyboard navigation still works alongside expansion
    - No full-screen overlay or side panel appears
    - TypeScript compiles without errors
  </done>
</task>

</tasks>

<verification>
1. TypeScript compilation: `cd /home/claude/bitbit && npx tsc --noEmit --project personal-assistant/tsconfig.json` passes
2. Build check: `cd /home/claude/bitbit/personal-assistant && npx next build` completes without errors
3. Visual verification: No checkbox elements visible on message rows. Selected rows show white-inverted styling. Clicking a row expands inline content instead of opening a drawer.
</verification>

<success_criteria>
- Zero visible checkboxes on inbox message rows
- Shift+click selects contiguous range between last-clicked and current row
- Cmd/Ctrl+click toggles individual row selection
- Plain click expands row inline with AI summary, thread, body, reply composer
- Selected rows have white bg + dark text (dark mode) / dark bg + light text (light mode)
- InboxDrawer component no longer rendered (import removed)
- All existing keyboard shortcuts (j/k navigation, e/d/r actions) continue to work
- TypeScript compiles, Next.js builds
</success_criteria>

<output>
After completion, create `.planning/quick/15-inbox-redesign-remove-checkboxes-add-mod/15-SUMMARY.md`
</output>
