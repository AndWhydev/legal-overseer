---
phase: Q18
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
  - personal-assistant/src/styles/bitbit-design-system.css
autonomous: true
requirements: [Q18-TOOLBAR, Q18-EXPANDED]
must_haves:
  truths:
    - "Time text (15h, 1d) stays visible on row hover -- never disappears"
    - "AI Brief button and panel are completely removed"
    - "Filters dropdown button and drawer are completely removed"
    - "Inline filter chips (Channel + Priority) appear below category pills bar"
    - "Refresh is a glassmorphic chip button matching filter chip style"
    - "Email shows inline with sender name (Name dot email) in expanded row"
    - "No duplicate body text when aiSummary exists"
    - "Body text in expanded row is not truncated"
    - "Ghost draft overlay aligns perfectly with textarea"
    - "Action buttons are minimal icon-only (no pill backgrounds)"
    - "Reply input has pill-shaped glass container like chat page"
    - "Expanded row visually extends from parent row as one continuous card"
  artifacts:
    - path: "personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx"
      provides: "Inbox component with all 12 fixes applied"
    - path: "personal-assistant/src/styles/bitbit-design-system.css"
      provides: "Updated CSS removing hover-action crossfade, time always visible"
  key_links:
    - from: "bitbit-design-system.css"
      to: "inbox-tab.tsx"
      via: "bb-inbox-row CSS classes"
      pattern: "bb-inbox-row"
---

<objective>
Apply 12 specific polish fixes to the inbox component based on direct user feedback. Fixes span toolbar cleanup (time visibility, remove AI Brief, replace Filters dropdown with inline chips, glassmorphic refresh) and expanded row improvements (inline email, deduplicate body, fix truncation, ghost draft alignment, icon-only actions, chat-style reply input, continuous glass card).

Purpose: Address all user-reported visual and UX issues from inbox review session.
Output: Polished inbox with all 12 fixes applied.
</objective>

<execution_context>
@/home/claude/.claude/get-shit-done/workflows/execute-plan.md
@/home/claude/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
@personal-assistant/src/styles/bitbit-design-system.css
@personal-assistant/src/app/globals.css (CSS custom properties: --glass-pill-bg, --glass-pill-inset, --glass-card-blur)

<interfaces>
<!-- Key CSS variables from globals.css -->
--glass-card-blur: blur(20px) saturate(1.2);
--glass-pill-bg: rgba(10, 14, 23, 0.42);
--glass-pill-inset: inset 0 1px 0 rgba(255, 255, 255, 0.06);

<!-- bb-chat__chip reference style from bitbit-design-system.css (line 6651) -->
.bb-chat__chip {
  background: var(--glass-pill-bg);
  backdrop-filter: var(--glass-card-blur);
  box-shadow: var(--glass-pill-inset);
  border: none;
  border-radius: 20px;
  padding: 6px 14px;
  font-size: 12px;
}

<!-- Current hover crossfade CSS (lines 2433-2443) — TO BE MODIFIED -->
.bb-inbox-row:hover .bb-inbox-row__meta-default { opacity: 0; pointer-events: none; }
.bb-inbox-row:hover .bb-inbox-row__hover-actions { opacity: 1; pointer-events: auto; }

<!-- Key state in InboxTab (lines 368-381) -->
showFilters (line 368) — DELETE
showAiBrief (line 380) — DELETE
aiBriefRef (line 381) — DELETE

<!-- Components to DELETE -->
AiBriefPanel (line 1234-1328) — entire function
InboxSelect (line 1403-1414) — entire function

<!-- Key areas in MessageRow (line 1927+) -->
hover-actions div (lines 2068-2131) — REMOVE entirely
meta-default div (lines 2064-2067) — keep, remove crossfade behavior

<!-- Key areas in ExpandedMessageRow (line 1443+) -->
Header rows (lines 1604-1622) — merge sender+email to one line
AI summary + body (lines 1644-1665) — deduplicate
Ghost draft (lines 1749-1835) — fix alignment, redesign as pill
Action bar (lines 1838-1891) — icon-only buttons
Container (lines 1582-1596) — continuous card styling
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Toolbar cleanup — time fix, remove AI Brief, remove Filters, add inline chips, glassmorphic refresh</name>
  <files>personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx, personal-assistant/src/styles/bitbit-design-system.css</files>
  <action>
**CSS changes in bitbit-design-system.css:**

1. **Fix 1 — Time always visible:** Remove or comment out the hover crossfade rules at lines 2433-2443:
   - DELETE `.bb-inbox-row:hover .bb-inbox-row__meta-default { opacity: 0; pointer-events: none; }`
   - DELETE `.bb-inbox-row:hover .bb-inbox-row__hover-actions { opacity: 1; pointer-events: auto; }`
   - Also delete the `.bb-inbox-row__hover-actions` base rule (line 2642-2654) and `.bb-inbox-row__action` rules (lines 2655-2676) since hover actions are being removed entirely.
   - Delete the light-mode equivalents: `html.light .bb-inbox-row__hover-actions` (line 2782), `html.light .bb-inbox-row__action:hover` (line 2786), and any selected hover-actions rules (line 2714).
   - Delete the responsive `.bb-inbox-row__hover-actions` rule (line 2877).

**TSX changes in inbox-tab.tsx:**

2. **Fix 2 — Remove AI Brief:**
   - Delete `showAiBrief` state (line 380) and `aiBriefRef` ref (line 381).
   - Delete the `useEffect` for click-outside detection of AI brief (lines 474-482).
   - Delete the entire AI Brief button+panel JSX block (lines 728-761 — the `<div ref={aiBriefRef}>` wrapper).
   - Delete the entire `AiBriefPanel` function component (lines 1234-1328).
   - Remove `Sparkles` from the lucide-react import if no longer used elsewhere.

3. **Fix 3 — Remove Filters dropdown:**
   - Delete `showFilters` state (line 368).
   - Delete the Filters button JSX (lines 785-799).
   - Delete the entire filter drawer conditional block `{showFilters && (...)}` (lines 812-846).
   - Delete the entire `InboxSelect` function component (lines 1403-1414).
   - Remove `Filter` from lucide-react import if unused.
   - Keep `channelFilter`, `priorityFilter` state — they're now driven by inline chips.
   - Remove `statusFilter` state (line 367) and its usage in `displayed` filter and `fetchInbox` params since Status filter is being removed (no Status chip group). Keep only channel and priority filtering.

4. **Fix 4 — Add inline filter chips:**
   After the `<CategoryPillsBar>` (line 809), add a new `<FilterChipsBar>` component. Create this as a new function component:

   ```
   function FilterChipsBar({ channelFilter, onChannelChange, priorityFilter, onPriorityChange })
   ```

   Renders two groups of chip buttons in a horizontal scrollable row with `gap: 16px` between groups:

   **Channel group:** chips for All, Gmail, Outlook, WhatsApp, Asana, Calendly, Stripe
   - Values: `''`, `'gmail'`, `'outlook'`, `'whatsapp'`, `'asana'`, `'calendly'`, `'stripe'`

   **Priority group:** chips for All, Critical, High, Medium, Low
   - Values: `''`, `'critical'`, `'high'`, `'medium'`, `'low'`

   Each chip uses inline styles matching `bb-chat__chip`:
   - Inactive: `background: var(--glass-pill-bg)`, `backdropFilter: var(--glass-card-blur)`, `boxShadow: var(--glass-pill-inset)`, `border: 'none'`, `borderRadius: 20`, `padding: '6px 14px'`, `fontSize: 12`, `color: 'rgba(255,255,255,0.5)'`, `cursor: 'pointer'`, `whiteSpace: 'nowrap'`, `transition: 'all 150ms ease'`
   - Active: `background: 'rgba(255,255,255,0.92)'`, `color: '#0A0A0B'`, `fontWeight: 600`

   Container: `display: 'flex'`, `alignItems: 'center'`, `gap: 6`, `padding: '4px 0 8px'`, `overflowX: 'auto'`, `scrollbarWidth: 'none'`

   Add a thin `|` separator (1px wide, 16px tall, `rgba(255,255,255,0.08)` background, `margin: '0 8px'`) between the channel and priority groups.

5. **Fix 5 — Glassmorphic Refresh chip:**
   Replace the current refresh button (lines 763-783) with a chip-styled button using the same glassmorphic chip style as the filter chips (inactive style). Show `<RefreshCw size={13} />` + "Refresh" text. When `refreshing` is true, add `animation: 'spin 1s linear infinite'` on the icon and change text to "Syncing...".

   Position it in the toolbar actions area where it currently lives.

6. **Remove hover action buttons from MessageRow:**
   In the `MessageRow` component, delete the entire `bb-inbox-row__hover-actions` div (lines 2068-2131 approximately). Keep the `bb-inbox-row__meta-default` div with the time/star — it now always stays visible (no crossfade). Remove the `actionBtnStyle` const (lines 1963-1983) since hover action buttons are removed. Remove unused props from MessageRow if they were ONLY used by hover actions — but keep `onArchive`, `onDone`, `onSnooze`, `onReply`, `onStar` since they're still needed by keyboard shortcuts and expanded row.

7. **Remove `hasActiveFilters` references** that depended on `statusFilter` or `showFilters`. Update the `hasActiveFilters` computed value to only check `channelFilter` and `priorityFilter`. Remove the "Clear" button in the toolbar that used `clearFilters` if it becomes redundant (the filter chips have "All" as a reset). Update `clearFilters` to only clear channel and priority.
  </action>
  <verify>
    <automated>cd /home/claude/bitbit && npx next build 2>&1 | tail -20</automated>
  </verify>
  <done>
    - Time text stays visible on hover (CSS crossfade rules deleted)
    - AI Brief button, panel, state, and AiBriefPanel component fully removed
    - Filters dropdown button, drawer, InboxSelect component fully removed
    - Inline filter chips (Channel + Priority) render below category pills
    - Refresh button uses glassmorphic chip style with spin animation
    - Hover action buttons removed from MessageRow
    - Build passes with zero errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Expanded row fixes — inline email, deduplicate body, fix truncation, ghost alignment, icon actions, chat-style reply, continuous card</name>
  <files>personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx</files>
  <action>
All changes in the `ExpandedMessageRow` component (line 1443+) and the surrounding JSX in the main InboxTab render:

**Fix 6 — Move email inline with sender name:**
In the expanded row header (lines 1604-1622), merge the sender name and email onto ONE line. Replace the two separate rows with a single flex row:
```
[ChannelIcon] SenderName · sender@email.com                   date
```
- The dot separator: `<span style={{ color: 'rgba(255,255,255,0.25)', margin: '0 6px' }}>·</span>`
- Email: `<span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontWeight: 400 }}>{message.senderEmail}</span>`
- Delete the separate "Row 2: email" block (lines 1617-1622).

**Fix 7 — Remove duplicate summary/body:**
In the content area (lines 1644-1665), change the logic:
- If `showSummary && aiResult && !aiLoading` AND `aiResult.summary` is not empty: show ONLY the aiResult.summary paragraph. Do NOT show the bodyPreview div below it. Also remove the thin divider `<div style={{ height: 1, background: 'rgba(255,255,255,0.04)' }} />` between them.
- If no AI summary: show the bodyPreview as before.
- Implementation: wrap the body text div in a conditional `{!(showSummary && aiResult && !aiLoading) && (...)}`.

**Fix 8 — Fix body text truncation:**
The content area already has `maxHeight: '60vh'` and `overflowY: 'auto'` (lines 1626-1632), which is correct. Ensure the body text div does NOT have any `maxHeight`, `overflow: hidden`, `textOverflow: 'ellipsis'`, or line-clamp that would truncate. The current implementation at lines 1659-1665 looks OK — verify no parent constrains it. The `overflow: 'hidden'` must NOT be on the expanded row container (line 1594) — change to `overflow: 'visible'` or remove the property. Actually, keep `overflow: 'hidden'` on the outer container for the expand animation, but ensure the scrollable inner div (lines 1626-1632) works correctly.

**Fix 9 — Fix ghost draft alignment:**
The ghost text overlay (lines 1753-1768) needs EXACT same positioning as the textarea (lines 1796-1805). Update the ghost overlay styles:
- `position: 'absolute'`
- `top: 0`, `left: 0`, `right: 0` (remove the `right: 48` — the ghost should span the full textarea width)
- `padding: '9px 12px'` — MUST match textarea padding exactly
- `fontSize: 13` — matches textarea
- `fontFamily: 'inherit'` — matches textarea
- `lineHeight: 1.5` — change to match textarea (currently textarea has no explicit lineHeight, so use the default or set both to 1.5)
- Add `lineHeight: 1.5` to the textarea as well so they match.
- The ghost overlay container (the `position: 'relative'` div at line 1750) needs to wrap ONLY the textarea+ghost, not the send button. Currently the flex div with textarea+send is inside. Restructure:
  ```
  <div style={{ display: 'flex', gap: 8 }}>
    <div style={{ position: 'relative', flex: 1 }}>
      {/* ghost overlay */}
      <textarea ... />
    </div>
    <button ... Send />
  </div>
  ```

**Fix 10 — Icon-only action buttons:**
Replace the action bar (lines 1838-1891) with icon-only buttons. New style for each action button:
```
const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 32, height: 32, borderRadius: 8,
  background: 'transparent', border: 'none',
  color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
  transition: 'color 150ms ease',
};
```
Hover: `color: 'rgba(255,255,255,0.8)'` via onMouseEnter/onMouseLeave.

Layout: `display: 'flex'`, `alignItems: 'center'`, `gap: 4`, `padding: '8px 20px 12px'`.

Buttons (16px icons, no text labels):
- Reply (focus textarea) — `<Reply size={16} />`
- Archive — `<Archive size={16} />`
- Done — `<CheckCircle2 size={16} />`
- Snooze — `<Clock size={16} />`
- Forward — `<Forward size={16} />`
- Spam (special: color `rgba(239,68,68,0.5)`, hover `rgba(239,68,68,0.8)`) — `<AlertTriangle size={16} />`
- Spacer `<div style={{ flex: 1 }} />`
- Close — `<X size={16} />`

Remove the "Create Task" button (it's conditional on aiResult and clutters the bar).

**Fix 11 — Chat-style reply input:**
Redesign the reply composer section (lines 1749-1835). Replace the current textarea+send layout with a pill-shaped glass container:

Outer container (replaces current `borderTop` div):
```
padding: '12px 20px 16px',
borderTop: '1px solid rgba(255,255,255,0.04)'
```

Inner pill container:
```
display: 'flex', alignItems: 'flex-end', gap: 0,
background: 'var(--glass-pill-bg)',
backdropFilter: 'var(--glass-card-blur)',
borderRadius: 20,
padding: '4px 4px 4px 16px',
boxShadow: 'var(--glass-pill-inset)',
```

Textarea inside the pill:
```
flex: 1, padding: '8px 0',
background: 'transparent', border: 'none', outline: 'none',
color: 'var(--text-primary, #F1F5F9)',
fontSize: 13, fontFamily: 'inherit', lineHeight: 1.5,
resize: 'none', minHeight: 32, maxHeight: 200,
```

Send button inside the pill (right side, circular):
```
width: 32, height: 32, borderRadius: '50%',
display: 'flex', alignItems: 'center', justifyContent: 'center',
border: 'none', cursor: 'pointer', flexShrink: 0,
transition: 'all 150ms ease',
background: replyText.trim() ? '#FF5A1F' : 'transparent',
color: replyText.trim() ? '#fff' : 'rgba(255,255,255,0.25)',
```

Ghost overlay goes INSIDE the pill, positioned absolute over the textarea area:
```
position: 'absolute', top: 0, left: 0, right: 0,
padding: '8px 0',
```
The relative wrapper wraps just the textarea within the pill.

Ghost hint ("Tab to use suggested reply") and Cmd+Enter hint go BELOW the pill container.

**Fix 12 — Continuous glass card:**
The expanded row should visually extend from the parent message row. Two changes:

A) In the **main render** where `<MessageRow>` and `<ExpandedMessageRow>` are rendered (lines 858-886), when a row is expanded, the MessageRow's parent `bb-inbox-row` div needs bottom border-radius removed. Add a conditional style or data attribute. The simplest approach: pass `expanded={expandedId === msg.id}` prop to MessageRow, and when true, add inline style `borderRadius: '12px 12px 0 0'` to override the CSS `border-radius: 12px`.

B) In the **ExpandedMessageRow** container (lines 1582-1596):
- Change `borderRadius` from `'0 0 12px 12px'` to `'0 0 12px 12px'` (already correct)
- Change `marginTop` from `-4` to `0` (flush against parent row)
- Set `borderTop: '1px solid rgba(255,255,255,0.04)'` as subtle separator
- Remove `border: '1px solid rgba(255,255,255,0.05)'` and replace with only the top border
- Match the background to be closer to the parent row: use `background: 'rgba(10, 14, 23, 0.5)'` (same as `.bb-inbox-row`)
- Add `boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)'` to match parent
- Remove `marginBottom: 4` (let the combined card have uniform spacing)

C) In the **message list** gap between items: ensure the gap/margin between a MessageRow+ExpandedRow pair and the next MessageRow still looks correct. The `bb-inbox-list` likely has gap set in CSS — verify it applies between Fragment elements correctly.
  </action>
  <verify>
    <automated>cd /home/claude/bitbit && npx next build 2>&1 | tail -20</automated>
  </verify>
  <done>
    - Email shows inline with sender: "Name · email@example.com" on one line
    - AI summary shown alone when present (no duplicate bodyPreview below it)
    - Body text displays fully within 60vh scrollable area, no truncation
    - Ghost draft overlay perfectly aligned with textarea (matching padding, font, lineHeight)
    - Action buttons are icon-only: transparent background, 16px icons, no text labels
    - Reply input is pill-shaped glass container matching chat page style
    - Expanded row extends from parent as one continuous card (no gap, shared border-radius)
    - Build passes with zero errors
  </done>
</task>

</tasks>

<verification>
- `cd /home/claude/bitbit && npx next build` completes with 0 errors
- Visual check: hover over inbox rows -- time text stays visible
- Visual check: no AI Brief button in toolbar
- Visual check: no Filters dropdown button in toolbar
- Visual check: inline filter chips below category pills
- Visual check: expanded row is one continuous glass card with parent row
- Visual check: reply input is pill-shaped
- Visual check: action buttons are icon-only
</verification>

<success_criteria>
All 12 user-reported fixes applied. Build passes. Inbox toolbar is cleaner (chips instead of dropdown, no AI Brief). Expanded row is polished (inline email, no duplicate text, proper alignment, minimal actions, chat-style reply, continuous card).
</success_criteria>

<output>
After completion, create `.planning/quick/18-inbox-polish-fix-hover-time-disappear-re/18-SUMMARY.md`
</output>
