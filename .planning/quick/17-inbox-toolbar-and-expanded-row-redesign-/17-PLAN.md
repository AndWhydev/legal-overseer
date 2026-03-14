---
phase: Q17
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
  - personal-assistant/src/hooks/use-inbox-keyboard.ts
autonomous: true
requirements: [Q17-TOOLBAR, Q17-EXPANDED]

must_haves:
  truths:
    - "Focus pill is default active category on load (not All)"
    - "Focus pill shows orange dot when hasUnreadPriority"
    - "Category pills show no count badges"
    - "Bulk action bar floats at bottom of viewport with glassmorphic styling"
    - "Expanded row has no AI Summary header, sparkle icon, or purple borders"
    - "AI summary renders as first body paragraph seamlessly"
    - "Action buttons are at the bottom of expanded row, not the top"
    - "Ghost draft text appears in reply composer when row expands"
    - "Tab key accepts ghost draft into textarea"
    - "HTML entities in bodyPreview/aiSummary render correctly"
  artifacts:
    - path: "personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx"
      provides: "Toolbar pills, floating bulk bar, redesigned ExpandedMessageRow with ghost draft"
    - path: "personal-assistant/src/hooks/use-inbox-keyboard.ts"
      provides: "Tab key handler for ghost draft acceptance"
  key_links:
    - from: "ExpandedMessageRow"
      to: "extractSummaryInline"
      via: "draftReply field populates ghost text overlay"
      pattern: "aiResult\\.draftReply"
    - from: "use-inbox-keyboard.ts"
      to: "ExpandedMessageRow ghost draft"
      via: "Tab key event propagation"
---

<objective>
Redesign the inbox toolbar (category pills, floating bulk bar) and expanded message row (invisible AI, ghost draft reply, decluttered layout, text sanitization).

Purpose: Make AI integration invisible (no labeled boxes), add ghost draft reply for faster responses, move bulk actions to non-intrusive floating bar, and fix HTML entity rendering.
Output: Updated inbox-tab.tsx and use-inbox-keyboard.ts
</objective>

<context>
@personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx
@personal-assistant/src/hooks/use-inbox-keyboard.ts
@.planning/quick/16-inbox-toolbar-expanded-row-redesign/DESIGN-BRIEF.md

Key interfaces already in the file:
- `CategoryPillType = 'all' | 'priority' | 'updates' | 'feed' | 'receipts'`
- `PILL_CONFIG` maps each pill to `{ label, filter }` -- rename priority's label to 'Focus'
- `CategoryPillsBar` component renders pills with counts
- `ExpandedMessageRow` component with `extractSummaryInline` returning `{ summary, actionItems, draftReply }`
- `useInboxKeyboard` hook handles keyboard shortcuts -- needs Tab key for ghost draft
- Bulk action bar is inline div at line ~810 with `keyboard.selectedIds.size > 0` guard
- `UndoToastStack` already uses fixed position at bottom -- bulk bar must not collide (use bottom: 80px for bulk bar, toast stays at bottom: 24px)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Toolbar category pills + floating bulk action bar</name>
  <files>personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx</files>
  <action>
**PILL_CONFIG changes:**
- Rename the `priority` entry's label from `'Priority'` to `'Focus'`
- Keep the key as `'priority'` (internal identifier unchanged)

**Default active pill:**
- Change `useState<CategoryPillType>('all')` to `useState<CategoryPillType>('priority')` at line ~340

**CategoryPillsBar component (lines ~899-1020) -- full rework:**
- Remove count badge rendering entirely (delete the `{count > 0 && ...}` span inside each pill button)
- Active pill style: `background: rgba(255,255,255,0.95)`, `color: '#0A0A0B'`, `fontWeight: 600` (already correct for dark mode)
- Inactive pill style: `background: transparent`, `color: 'rgba(255,255,255,0.45)'`, `fontWeight: 500`, no border
- Add orange dot indicator on Focus pill when `hasUnreadPriority && !isActive`:
  ```tsx
  {isPriority && hasUnreadPriority && !isActive && (
    <span style={{
      width: 6, height: 6, borderRadius: '50%',
      background: 'var(--bb-orange, #FF5A1F)',
      flexShrink: 0,
    }} />
  )}
  ```
  Place the dot BEFORE the label text inside the button (left side of label)
- Add `title` tooltip to each pill showing keyboard shortcut: `title={cfg.label + ' (' + (PILL_ORDER.indexOf(pill) + 1) + ')'}` -- but All=1, Focus=2, Updates=3, Feed=4, Receipts=5

**Floating bulk action bar (replace inline bar at lines ~810-822):**
- Remove the existing inline `<div>` that renders when `keyboard.selectedIds.size > 0`
- Add a new floating bar AFTER the message list (just before the snooze picker), still guarded by `keyboard.selectedIds.size > 0`
- Floating bar specifications:
  ```tsx
  <div style={{
    position: 'fixed',
    bottom: 80,  // above the undo toast stack at bottom: 24
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 16px',
    background: 'rgba(15, 20, 30, 0.95)',
    backdropFilter: 'blur(20px) saturate(1.2)',
    WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)',
    zIndex: 50,
    animation: 'fadeSlideUp 200ms ease',
  }}>
  ```
- Inside the bar: selection count label, then buttons for Archive, Done, Snooze, Spam, and X (clear)
- Button style: compact ghost pills matching `actionPillStyle` from ExpandedMessageRow -- `padding: '5px 10px'`, `fontSize: 12`, `borderRadius: 6`
- Add Snooze and Spam buttons to the bulk bar (currently only has Archive, Done, Clear):
  - Snooze: `<Clock size={13} /> Snooze` -- on click, show snooze picker (reuse existing snooze pattern, set snoozeTargetId to first selected, or handle bulk)
  - Spam: `<AlertTriangle size={13} /> Spam` -- calls handleSpam for each selected, then clearSelection
- The [X] button at end clears selection and dismisses the bar

**Also add handleBulkSpam callback:**
```tsx
const handleBulkSpam = useCallback(() => {
  keyboard.selectedIds.forEach(id => handleSpam(id));
  clearSelection();
}, [keyboard.selectedIds, handleSpam, clearSelection]);
```
  </action>
  <verify>
    <automated>cd /home/claude/bitbit && npx tsc --noEmit --project personal-assistant/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>
- Focus pill is default active pill on load
- PILL_CONFIG priority label reads "Focus"
- No count badges on any category pills
- Orange dot shows on Focus pill when hasUnreadPriority and not active
- Bulk action bar floats fixed at bottom with glassmorphic styling
- Inline bulk bar div removed
- Bulk bar includes Archive, Done, Snooze, Spam, X buttons
  </done>
</task>

<task type="auto">
  <name>Task 2: Expanded row redesign -- invisible AI, ghost draft, sanitization, decluttered layout</name>
  <files>personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx, personal-assistant/src/hooks/use-inbox-keyboard.ts</files>
  <action>
**Add sanitizeText utility** (top of file, near helpers):
```tsx
function sanitizeText(text: string): string {
  if (!text) return '';
  const textarea = typeof document !== 'undefined' ? document.createElement('textarea') : null;
  if (textarea) {
    textarea.innerHTML = text;
    return textarea.value;
  }
  // SSR fallback: decode common HTML entities
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#9;/g, '\t')
    .replace(/&#10;/g, '\n')
    .replace(/&#13;/g, '\r')
    .replace(/&deg;/g, '\u00B0')
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&rdquo;/g, '\u201D')
    .replace(/&ldquo;/g, '\u201C')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&nbsp;/g, '\u00A0')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
```
Apply `sanitizeText()` to all rendered text: `message.bodyPreview`, `message.aiSummary`, `aiResult.summary`, `aiResult.actionItems`, thread message `bodyPreview`, and `message.subject` in ExpandedMessageRow. Also apply in MessageRow for `message.bodyPreview`/`message.aiSummary` preview text.

**ExpandedMessageRow full restructure (lines ~1393-1811):**

1. **Remove top action buttons entirely.** Delete the header bar's action pills div (lines ~1562-1596 -- the div containing Reply, Archive, Done, Spam buttons in the header).

2. **Restructure header** -- declutter sender/meta layout:
   ```tsx
   {/* Header */}
   <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
     {/* Row 1: channel icon + sender name ... date */}
     <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
       <div style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: brandColor, flexShrink: 0 }}>
         <ChannelIcon size={13} />
       </div>
       <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
         {sanitizeText(String(sender))}
       </span>
       <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto', flexShrink: 0 }}>
         {fullDate}
       </span>
     </div>
     {/* Row 2: email (dim) */}
     {message.senderEmail && (
       <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', paddingLeft: 22 }}>
         {String(message.senderEmail)}
       </div>
     )}
   </div>
   ```

3. **Remove borderBottom from header** -- no border between header and content, use spacing only (20px gap via padding).

4. **Content area with max-height scroll:**
   ```tsx
   <div style={{
     padding: '16px 20px',
     display: 'flex', flexDirection: 'column', gap: 16,
     maxHeight: '60vh',
     overflowY: 'auto',
     scrollbarWidth: 'thin',
     scrollbarColor: 'rgba(255,255,255,0.1) transparent',
   }}>
   ```

5. **Subject** -- render with `sanitizeText()`, same styling (16px, 600 weight).

6. **Invisible AI summary** -- replace the boxed AI Summary panel (lines ~1611-1682) with:
   ```tsx
   {showSummary && aiResult && !aiLoading && (
     <>
       <p style={{
         fontSize: 14, color: 'rgba(255,255,255,0.82)', lineHeight: 1.6,
         margin: 0, opacity: 1,
         animation: 'fadeIn 300ms ease',
       }}>
         {sanitizeText(aiResult.summary)}
       </p>
       <div style={{ height: 1, background: 'rgba(255,255,255,0.04)' }} />
     </>
   )}
   ```
   Add the fadeIn keyframes: `@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`
   When `aiLoading` is true, just show the body text (no shimmer, no skeleton).

7. **Action items** -- render in neutral colors (no purple/indigo):
   ```tsx
   {aiResult && aiResult.actionItems.length > 0 && (
     <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
       {aiResult.actionItems.map((item, i) => (
         <li key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
           <span style={{ color: 'rgba(255,255,255,0.3)', marginTop: 1, flexShrink: 0 }}>{'>'}</span>
           {sanitizeText(item)}
         </li>
       ))}
     </ul>
   )}
   ```

8. **Remove "Create Task" and "Draft Reply" buttons** from the AI summary area. Create Task moves to bottom action bar. Draft Reply is replaced by ghost draft.

9. **Body text** -- apply `sanitizeText()` to bodyPreview.

10. **Ghost draft reply composer** -- replace the current reply composer section:
    - Add state for ghost draft visibility:
      ```tsx
      const [ghostVisible, setGhostVisible] = useState(true);
      const [ghostDismissed, setGhostDismissed] = useState(false);
      const ghostTimerRef = useRef<ReturnType<typeof setTimeout>>();
      ```
    - The ghost text div overlays the textarea (position: relative wrapper):
      ```tsx
      <div style={{ padding: '12px 20px 16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ position: 'relative' }}>
          {/* Ghost text overlay */}
          {ghostVisible && !replyText && aiResult?.draftReply && (
            <div style={{
              position: 'absolute',
              top: 0, left: 0, right: 48, // leave room for send button space
              padding: '9px 12px',
              color: 'rgba(255, 255, 255, 0.25)',
              fontStyle: 'italic',
              fontSize: 13,
              fontFamily: 'inherit',
              lineHeight: 1.5,
              pointerEvents: 'none',
              whiteSpace: 'pre-wrap',
              zIndex: 1,
            }}>
              {sanitizeText(aiResult.draftReply)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea ...existing props but with updated onChange and onKeyDown... />
            <button ...existing send button... />
          </div>
        </div>
        {/* Ghost hint */}
        {ghostVisible && !replyText && aiResult?.draftReply && (
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 5 }}>
            Tab to use suggested reply
          </div>
        )}
        {replyText && (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 5 }}>
            <kbd style={{ padding: '1px 4px', borderRadius: 3, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', fontSize: 9, fontFamily: 'inherit' }}>Cmd+Enter</kbd> to send
          </div>
        )}
      </div>
      ```
    - Update `handleAutoExpand` to dismiss ghost text on any typing:
      ```tsx
      const handleAutoExpand = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setReplyText(e.target.value);
        if (e.target.value) {
          setGhostVisible(false);
          setGhostDismissed(true);
        }
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
      };
      ```
    - Add effect: if user clears textarea, reshow ghost after 500ms:
      ```tsx
      useEffect(() => {
        if (replyText === '' && ghostDismissed) {
          ghostTimerRef.current = setTimeout(() => {
            setGhostVisible(true);
            setGhostDismissed(false);
          }, 500);
          return () => clearTimeout(ghostTimerRef.current);
        }
      }, [replyText, ghostDismissed]);
      ```
    - Handle Tab key in textarea's onKeyDown:
      ```tsx
      onKeyDown={(e) => {
        if (e.key === 'Tab' && ghostVisible && !replyText && aiResult?.draftReply) {
          e.preventDefault();
          setReplyText(aiResult.draftReply);
          setGhostVisible(false);
          setGhostDismissed(true);
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto';
              textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
              textareaRef.current.setSelectionRange(aiResult.draftReply.length, aiResult.draftReply.length);
            }
          }, 0);
        }
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          handleSendReply();
        }
      }}
      ```

11. **Action buttons at BOTTOM of expanded row** -- after the reply composer, add a bottom action bar:
    ```tsx
    {/* Bottom action bar */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '10px 20px 14px',
      borderTop: '1px solid rgba(255,255,255,0.04)',
      flexWrap: 'wrap',
    }}>
      <button style={actionPillStyle} onClick={() => textareaRef.current?.focus()}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}>
        <Reply size={12} /> Reply
      </button>
      <button style={actionPillStyle} onClick={() => onArchive(message.id)}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}>
        <Archive size={12} /> Archive
      </button>
      <button style={actionPillStyle} onClick={() => onDone(message.id)}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}>
        <CheckCircle2 size={12} /> Done
      </button>
      <button style={actionPillStyle} onClick={() => handleNavigateLocal('snooze')}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}>
        <Clock size={12} /> Snooze
      </button>
      <button style={actionPillStyle} onClick={() => {/* forward placeholder */}}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}>
        <Forward size={12} /> Forward
      </button>
      {aiResult && aiResult.actionItems.length > 0 && (
        <button style={actionPillStyle}
          onClick={() => window.dispatchEvent(new CustomEvent('bb:create-task', { detail: { subject: message.subject || message.bodyPreview.slice(0, 60), description: message.bodyPreview } }))}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}>
          <ListTodo size={12} /> Create Task
        </button>
      )}
      <div style={{ flex: 1 }} />
      <button style={{ ...actionPillStyle, background: 'rgba(239,68,68,0.08)', color: 'rgba(239,68,68,0.8)', borderColor: 'rgba(239,68,68,0.15)' }}
        onClick={() => onSpam(message.id)}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; }}>
        <AlertTriangle size={12} /> Spam
      </button>
      <button style={{ ...actionPillStyle, borderColor: 'transparent', background: 'transparent' }}
        onClick={onClose}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
        <X size={12} />
      </button>
    </div>
    ```

12. **Remove shimmerStyle** variable (no longer used -- delete the `shimmerStyle` const and the shimmer skeleton rendering inside the AI Summary panel).

13. **Attachment pills component** -- add a structural-only component (no real data yet):
    ```tsx
    function AttachmentPills({ attachments }: { attachments?: { name: string; size: string; type: string }[] }) {
      if (!attachments || attachments.length === 0) return null;
      // ... render pills per design brief specs
    }
    ```
    Add it inside ExpandedMessageRow after body text / action items, before thread view. Pass `attachments={undefined}` for now (future data). This is a no-op placeholder that renders nothing when data is absent.

**use-inbox-keyboard.ts updates:**
- The Tab key for ghost draft acceptance is handled locally in the textarea's onKeyDown (above), NOT in the global keyboard hook. The global hook should NOT intercept Tab (it would break normal tab navigation). No changes needed to the hook file for Tab handling.
- However, do extend the keyboard shortcut range from `'1'-'4'` to `'1'-'5'` since there are 5 category pills (line ~271): change `e.key <= '4'` to `e.key <= '5'`
  </action>
  <verify>
    <automated>cd /home/claude/bitbit && npx tsc --noEmit --project personal-assistant/tsconfig.json 2>&1 | head -30</automated>
  </verify>
  <done>
- AI summary renders as seamless first paragraph (no box, no header, no sparkle icon, no purple)
- Action items render in neutral colors (rgba white, not purple/indigo)
- No shimmer animation (fade-in only for late-arriving summary)
- Top action buttons removed, all actions at bottom of expanded row
- Ghost draft appears as greyed italic overlay on empty textarea
- Tab accepts ghost draft, typing dismisses it, clearing textarea re-shows it after 500ms
- "Draft Reply" button removed
- Create Task button moved to bottom action bar (only shows when action items exist)
- HTML entities (&#9;, apostrophes, degree symbols) decode correctly via sanitizeText
- Header decluttered: channel icon + sender on left, date on right, email on second line
- No border between header and content (spacing only)
- Max height ~60vh with internal scroll on content area
- Rounded bottom corners (12px), square top
- Keyboard shortcuts 1-5 work for all 5 category pills
  </done>
</task>

</tasks>

<verification>
1. `cd /home/claude/bitbit && npx tsc --noEmit --project personal-assistant/tsconfig.json` -- zero type errors
2. `cd /home/claude/bitbit/personal-assistant && npx next build 2>&1 | tail -5` -- build succeeds
3. Visual: Open inbox tab, verify Focus pill is active by default with filled white bg
4. Visual: Select multiple messages (Cmd+click), verify floating bar appears at bottom
5. Visual: Click a message to expand, verify no "AI Summary" box, summary is inline text
6. Visual: In expanded row, verify ghost draft text appears in reply composer
7. Visual: Press Tab in reply composer, verify ghost text becomes real text
</verification>

<success_criteria>
- Focus is default category pill, shows orange dot for unread priority
- No count badges on pills
- Floating glassmorphic bulk action bar replaces inline bar
- Expanded row: invisible AI, ghost draft, bottom actions, sanitized text, decluttered header
- TypeScript compiles with zero errors
</success_criteria>

<output>
After completion, create `.planning/quick/17-inbox-toolbar-and-expanded-row-redesign-/17-SUMMARY.md`
</output>
