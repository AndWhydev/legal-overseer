# Design Brief: Inbox Expanded-Row & Toolbar Redesign

**Date**: 2026-03-14
**Scope**: Inline expanded row, smart reply, invisible AI, attachment pills, bulk actions, category toolbar
**Status**: Ready for implementation

---

## Current State

BitBit's inbox tab (`inbox-tab.tsx`) has a working expanded row (`ExpandedMessageRow`) that renders inline below the clicked message row. It includes:

- A header bar with channel icon, sender, email, date, and action buttons (Reply, Archive, Done, Spam)
- Subject line
- AI Summary panel (boxed, with sparkle icon and "AI Summary" header)
- Thread view (collapsible thread messages)
- Reply composer (textarea + Send button)

The toolbar has stat pills (unread, action needed, needs reply, total), category pills (All, Priority, Updates, Feed, Receipts), filter dropdowns, AI Brief button, and a Refresh button. Bulk actions appear as a static bar inline with the content.

### Problems to Solve

1. **AI integration is announced, not embedded** -- the "AI Summary" header with sparkle icon makes it feel bolted-on
2. **Expanded row has no ghost-draft / smart reply** -- the reply composer is blank
3. **No attachment rendering** at all
4. **Bulk action bar pushes content** -- it's inline, not overlaid
5. **Category pills lack visual hierarchy** -- counts shown but no clear "focused" vs "everything" mental model
6. **Expanded row action buttons wrap awkwardly** on narrow viewports

---

## 1. Inline Expanded Row Layout

### Research Findings

**Superhuman** replaces the list view entirely with a full-screen reading view -- not a true inline expand. The reading view strips header clutter and presents the message "like a typed business letter." Information hierarchy: sender identity first (primary decision point), then subject, then body.

**Linear** uses collapsible issue rows in its list view. Clicking an issue either navigates to a detail view or shows a right panel. Their 2025 redesign cut back to monochrome black/white with minimal bold colors.

**Notion** uses toggle headings for progressive disclosure -- headings that expand to reveal content. The pattern is "show just what the user needs when they need it."

**Spark** offers split view (list + reading pane side by side) or full-screen reading. Their expanded sidebar can be collapsed/expanded.

**Hey.com** uses a "big buttons, big text" philosophy. The Imbox view shows messages in a list; clicking opens a full reading view with generous spacing.

### Recommendations for BitBit

**Information hierarchy (top to bottom):**

```
[Channel icon] Sender Name                          Tue 4 Mar, 2:15 PM
               sender@email.com

Subject Line (if email/asana/stripe)

Body preview or AI-generated summary (presented as the content,
not in a labeled box) — 3-4 lines max with "Show more" fade

[Attachment pills row — if any]

[Thread accordion — if multi-message]

[Ghost draft / reply composer]

──────────────────────────────────────────────────────
[Reply] [Archive] [Done] [Snooze] [Forward]    [Close]
```

**Key layout principles:**

- **20px horizontal padding, 16px vertical sections** -- generous breathing room without wasting vertical space in an inline expand context
- **Action buttons at the bottom**, not the top. Rationale: the user reads content first, then decides on action. Placing actions at the top (current design) forces the user to scroll past them to read, then scroll back. Bottom placement follows the natural reading-then-acting flow. This matches Linear's issue detail and Gmail's conversation view.
- **No border between header and content** -- use spacing alone. The current design has a visible border between the sender bar and content area. Remove it. Use 20px of whitespace instead. This is what Superhuman does -- borders create visual noise; spacing creates hierarchy.
- **Rounded bottom corners (12px)**, square top corners that visually connect to the row above
- **Max height of ~60vh with scroll** -- prevent the expanded row from pushing the entire list offscreen. After 60vh, the body content scrolls internally.

---

## 2. Smart Reply / Ghost Draft UX

### Research Findings

**Superhuman Instant Reply** generates three full draft replies overnight. They appear under each conversation, ready to send or edit. Unlike Gmail's short chip suggestions, these are complete emails in the user's voice.

**Gmail Smart Reply** (2025+) now uses Gemini with Personal Context -- it pulls from your inbox history, Drive files, and tone preferences to generate contextual replies. The replies appear as small chips below the message body.

**GitHub Copilot ghost text** renders suggestions as dimmed/greyed text inline at the cursor position. Tab accepts the full suggestion. Ctrl+Right accepts word-by-word. The suggestion disappears if the user types anything different.

### Recommendations for BitBit

Implement a **ghost draft** model that blends Copilot's ghost text with Superhuman's full-reply approach:

**Interaction model:**

1. When the expanded row opens, the reply composer shows a **greyed-out draft** as placeholder text (not in the placeholder attribute -- rendered as a styled overlay on top of an empty textarea)
2. The ghost text is generated from `extractSummaryInline()` (existing function) or a future LLM call
3. Visual treatment: `color: rgba(255, 255, 255, 0.25)`, `fontStyle: italic`, positioned absolutely over the textarea
4. **Tab key** accepts the full draft into the textarea as editable text (color changes to normal, cursor goes to end)
5. **Any typing** dismisses the ghost text and shows what the user types instead
6. If the user clears the textarea, the ghost text reappears after 500ms
7. A subtle hint below: `Tab to use suggested reply` in dim text (11px, rgba(255,255,255,0.2))

**Why this works:**

- It feels like autocomplete, not AI. Users already understand Tab-to-accept from code editors and browser autofill
- No "AI wrote this" announcement -- the draft just appears as a suggestion
- The user is always in control -- any keystroke dismisses it
- It does not require a separate "Draft Reply" button or panel

**What NOT to do:**

- Do not show multiple draft options (Superhuman-style). One ghost draft keeps it simple
- Do not label it "AI Draft" or "Smart Reply". Just show the text
- Do not auto-send. Tab inserts; Cmd+Enter sends. Always two steps

---

## 3. Invisible AI Integration

### Research Findings

**Arc Browser** renames pinned tabs, renames downloads, and generates link previews -- all without any AI label. These feel like native browser intelligence.

**Superhuman** auto-summarizes threads with a one-liner in the list view. Auto Labels classify emails silently. Auto Drafts appear as if you wrote them. The 2025-2026 trend is "AI as ambient layer, not feature."

**Linear** embeds intelligence into natural workflows -- issue suggestions, smart grouping -- without calling it out.

**Industry trend (2026)**: "The chat box is no longer the default solution. Designers now treat AI as an invisible layer that powers the entire application, not just a feature within it."

### Recommendations for BitBit

**Remove the "AI Summary" labeled box entirely.** Instead:

1. **The first paragraph of the expanded row IS the summary.** When an AI summary exists (`message.aiSummary`), render it as the body's opening paragraph in a slightly different (but not announced) style:
   - Font size: 14px (same as body text)
   - Color: `rgba(255, 255, 255, 0.82)` (same as body text)
   - Line height: 1.6
   - Followed by a `1px solid rgba(255, 255, 255, 0.04)` divider, then the full body text below it
   - No sparkle icon, no "AI Summary" header, no purple border

2. **Action items render as a tight checklist** below the summary paragraph, using a simple `>` prefix (current design) but without the purple/indigo coloring. Use `rgba(255, 255, 255, 0.6)` for the text and `rgba(255, 255, 255, 0.3)` for the chevron prefix. They look like the message's key points, not an "AI feature."

3. **The "Create Task" button moves to the action bar** at the bottom, alongside Reply/Archive/Done. It only appears when action items are detected.

4. **Remove the shimmer loading animation** for the AI summary. If the summary is not yet ready, just show the body text. When the summary arrives (700ms later), smoothly prepend it with a fade-in (`opacity 0 to 1, 300ms`). No skeleton, no shimmer -- those announce "AI is thinking."

**The test**: If a user cannot tell which content was AI-generated and which was from the original message, the integration is invisible.

---

## 4. Attachment Pills

### Research Findings

**Material Design chips**: Small, rounded containers with an icon, label, and optional action (close/download). States: default, hover (brighter bg), active, disabled.

**Gmail** shows attachments as rounded rectangles below the message body with file type icon (PDF red, Sheet green, Doc blue), filename truncated with ellipsis, and file size.

**Superhuman** displays attachments inline and caches them locally via CacheStorage.

### Recommendations for BitBit

**Pill design:**

```
[FileIcon] filename.pdf  2.4 MB  [DownloadIcon]
```

**Specifications:**

- Height: 32px
- Border radius: 8px
- Background: `rgba(255, 255, 255, 0.04)`
- Border: `1px solid rgba(255, 255, 255, 0.06)`
- Hover: `background: rgba(255, 255, 255, 0.08)`, `border-color: rgba(255, 255, 255, 0.1)`
- Font size: 12px for filename, 11px for size (dimmer color)
- Icon: 14px, colored by file type:
  - PDF: `#EF4444` (muted red)
  - Image (jpg/png/gif): `#8B5CF6` (muted purple)
  - Spreadsheet (xlsx/csv): `#22C55E` (muted green)
  - Document (docx): `#3B82F6` (muted blue)
  - Archive (zip/tar): `#EAB308` (muted amber)
  - Other: `rgba(255, 255, 255, 0.4)` (neutral)
- Filename: truncate at 24 characters with ellipsis
- Download icon: hidden by default, appears on hover (replaces file size text)

**Grouping:**

- If 1-3 attachments: show individually in a horizontal flex row with `gap: 8px`, wrapping allowed
- If 4+ attachments: show first 3 pills + a "+N more" pill that expands the rest on click
- Position: below the body text, above the thread view (if any)

**Hover preview:**

- Images: show a 200x200 thumbnail popup (position: absolute, above the pill, with a subtle shadow)
- PDF: show first-page thumbnail if available, otherwise just the pill
- Other files: no preview, just the pill

---

## 5. Bulk Action Bar (Non-Intrusive)

### Research Findings

**Gmail** replaces the toolbar content with action icons when items are selected. The bar stays at the top and does not push content.

**Linear** uses a floating contextual bar that appears when items are selected.

**Best practice (Eleken, UX Movement)**: "When users click on a checkbox, a bulk-action bar slides into view. The bar must stay persistent while users scroll. It should expand or contract based on selection count."

**Soul Design System**: The bulk-action bar is a floating overlay that appears at the bottom of the viewport.

### Recommendations for BitBit

**Replace the current inline bar with a floating bottom bar:**

```
 ┌─────────────────────────────────────────────────────┐
 │  3 selected   [Archive] [Done] [Snooze] [Spam]  [X] │
 └─────────────────────────────────────────────────────┘
```

**Specifications:**

- Position: `fixed`, bottom: `24px`, centered horizontally (`left: 50%, transform: translateX(-50%)`)
- Width: auto (content-driven), max-width: `560px`
- Background: `rgba(15, 20, 30, 0.95)`
- Backdrop filter: `blur(20px) saturate(1.2)`
- Border: `1px solid rgba(255, 255, 255, 0.1)`
- Border radius: `12px`
- Box shadow: `0 8px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3)`
- Padding: `10px 16px`
- Z-index: `50`
- Entry animation: slide up + fade in (`transform: translateY(12px) to translateY(0)`, `opacity 0 to 1`, `200ms ease-out`)
- Exit animation: reverse of entry

**Button style inside the bar:**

- Same ghost button style as the expanded row action pills
- Compact: `padding: 5px 10px`, `fontSize: 12`, `borderRadius: 6`

**Selection count:**

- `"3 selected"` in `fontSize: 12, fontWeight: 600, color: rgba(255, 255, 255, 0.8)`
- The [X] at the end clears selection and dismisses the bar

**Why floating bottom bar, not replacing toolbar:**

- The toolbar has category pills and stats that the user may still want to see while selecting
- A floating bar at the bottom is closer to the selected rows (user does not have to move cursor to the top)
- It stays visible during scrolling without needing sticky positioning hacks
- Matches the pattern in Figma, Notion, and modern design tools

---

## 6. Toolbar / Category Design

### Research Findings

**Superhuman splits**: 2 default splits (Important, Other) + custom user splits. Each shows total message count (not unread). Tab/Shift+Tab to cycle.

**Gmail tabs**: 5 categories (Primary, Social, Promotions, Updates, Forums). Most users only enable 2-3.

**Hey.com**: 3 zones (Imbox, Feed, Paper Trail). Fully consent-based -- new senders go through Screener.

**Apple Mail**: 4 categories (Primary, Transactions, Updates, Promotions). Badge counts only on Primary by default.

**Research (Miller's Law)**: 4-7 categories is optimal. Beyond 7, categorization overhead exceeds time saved.

### Recommendations for BitBit

**Keep the current 5 pills** (All, Priority, Updates, Feed, Receipts) but refine their behavior and styling:

**Styling changes:**

1. **Active pill** gets a subtle background fill, not just an outline change:
   - Active: `background: rgba(255, 255, 255, 0.08)`, `color: rgba(255, 255, 255, 0.95)`, `fontWeight: 600`
   - Inactive: `background: transparent`, `color: rgba(255, 255, 255, 0.45)`, `fontWeight: 500`
   - No count badges on the pills themselves -- counts add clutter and anxiety (Superhuman's "total count" model is better)

2. **Remove count badges from pills.** Instead, show a single summary line above the pill row:
   ```
   4 priority  ·  12 updates  ·  3 feed  ·  2 receipts
   ```
   This is the stat row -- keep the existing StatPill components but move them above the category pills.

3. **"Priority" pill gets a subtle pulse/dot indicator** when there are unread actionable messages (the existing `hasUnreadPriority` logic). Use a 6px dot with `background: var(--bb-orange)` to the left of the "Priority" label, not a count badge.

4. **Keyboard shortcut: 1-5** to switch categories (already wired via `onCategorySwitch`). Add a tooltip on hover showing the shortcut: `title="Priority (2)"`.

**Focused view behavior:**

- Default to "All" on first load (current behavior -- correct)
- If the user switches to "Priority" and processes all messages, show a completion state: "All priority messages handled" with a subtle check icon, and a "Show all" link to switch back
- Remember the last-active pill in `localStorage` and restore it on return

---

## Key UX Principles

1. **Read first, act second.** Content flows top-down; actions live at the bottom of the expanded row. The user should never have to scroll past buttons to reach content.

2. **AI is the content, not a feature.** Summaries, draft replies, and action items appear as natural parts of the message -- never boxed, labeled, or sparkled.

3. **Progressive disclosure at every level.** List row shows subject + sender + preview. Expanded row shows full body + thread + reply. Drawer (future) shows attachments, history, contact context. Each level reveals only what that level needs.

4. **Non-intrusive selection.** Bulk actions float above the content, never push it. Selection state is communicated through the floating bar and row highlights, not toolbar changes.

5. **Speed as UX.** Animations are functional (200ms expand, 150ms hover transitions) not decorative. Ghost drafts appear fast (within 700ms). No loading spinners in the expanded row -- show what you have, fade in what arrives later.

6. **Keyboard-native.** Every action in the expanded row should be reachable via keyboard. R for reply, E for archive, D for done, Escape to close. Tab to accept ghost draft. J/K to navigate between messages. This is already partially implemented via `use-inbox-keyboard.ts`.

---

## Layout: Expanded Row (Final Specification)

```
┌─ Collapsed Message Row ─────────────────────────────────────────┐
│ [ChannelIcon] Subject line truncated...           12m  [Dots]   │
│              Sender Name                               [Star]   │
│              Preview text in dim...                              │
└─────────────────────────────────────────────────────────────────┘
┌─ Expanded Content (inline, rounded bottom) ─────────────────────┐
│                                                                  │
│  [ChannelIcon 13px]  Sender Name (14px, 600)                     │
│                      sender@email.com (12px, dim)                │
│                                        Tue 4 Mar, 2:15 PM       │
│                                                                  │
│  Subject Line (16px, 600, near-white)                            │
│                                                                  │
│  AI summary rendered as body text (14px, 82% white, 1.6 lh)     │
│  with natural tone. No label, no box, no sparkle.                │
│  ─ ─ ─ ─ ─ ─ ─ ─ (thin divider, 4% white) ─ ─ ─ ─ ─ ─ ─      │
│  Full message body text continues here...                        │
│                                                                  │
│  > Action item detected from content                             │
│  > Second action item                                            │
│                                                                  │
│  [PDF icon] report.pdf  2.4MB   [IMG] mockup.png  890KB         │
│                                                                  │
│  ┌─ Thread (3 messages) ─────────────────────────────────────┐   │
│  │ [S] Sarah Chen      Preview of older message...   5d ago  │   │
│  │ [Y] You             Your reply text visible...    4d ago  │   │
│  │ [S] Sarah Chen      Latest message expanded...    12m ago │   │
│  │    Full body of the latest thread message here.           │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ Hi Sarah, thanks for the update. I'll adjust the CTA    │    │
│  │ colour to match the brand guide and send it over...      │    │
│  │                        (ghost text, 25% white, italic)   │    │
│  │                                          Tab to accept   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  [Reply] [Archive] [Done] [Snooze] [Forward] [Create Task] [X]  │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Smart Reply Interaction Model (State Machine)

```
                    ┌─────────────┐
                    │   LOADING   │ (expanded row just opened)
                    │  no ghost   │
                    └──────┬──────┘
                           │ AI draft ready (700ms)
                           v
                    ┌─────────────┐
                    │   GHOST     │ ghost text visible
                    │  VISIBLE    │ textarea empty
                    └──┬───┬──────┘
                       │   │
              Tab key  │   │ User types any character
                       │   │
                       v   v
              ┌────────┐  ┌──────────┐
              │ DRAFT  │  │ USER     │
              │ACCEPTED│  │ TYPING   │ ghost text dismissed
              │ (edit) │  │          │
              └────┬───┘  └─────┬────┘
                   │            │
                   │            │ User clears textarea
                   │            │ (500ms debounce)
                   │            v
                   │     ┌─────────────┐
                   │     │   GHOST     │ ghost text reappears
                   │     │  VISIBLE    │
                   │     └─────────────┘
                   │
                   v
              ┌─────────────┐
              │  Cmd+Enter  │ ── send reply
              └─────────────┘
```

**Implementation notes:**

- Ghost text is a `<div>` overlay with `pointer-events: none`, positioned absolutely over the textarea
- When Tab is pressed and ghost text is visible, call `setReplyText(ghostDraft)` and focus the textarea
- The ghost draft comes from the existing `extractSummaryInline()` function's `draftReply` field
- No new API call needed -- the draft generation already exists

---

## Implementation Priority

| Order | Change | Effort | Impact |
|-------|--------|--------|--------|
| 1 | Move actions to bottom of expanded row | Small | High -- fixes content-first hierarchy |
| 2 | Remove AI Summary box, inline the content | Small | High -- invisible AI integration |
| 3 | Ghost draft overlay on reply composer | Medium | High -- smart reply without announcement |
| 4 | Floating bulk action bar | Medium | Medium -- non-intrusive selection |
| 5 | Attachment pills | Medium | Medium -- missing feature |
| 6 | Category pill refinements | Small | Low -- visual polish |

---

## Files to Modify

| File | Changes |
|------|---------|
| `personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx` | `ExpandedMessageRow` layout restructure, `CategoryPillsBar` refinements, bulk action bar repositioning |
| `personal-assistant/src/components/dashboard/inbox-drawer.tsx` | Mirror the invisible AI pattern (remove "AI Summary" header), add ghost draft |
| `personal-assistant/src/components/dashboard/inbox-feed.tsx` | No changes needed for this sprint |
| `personal-assistant/src/hooks/use-inbox-keyboard.ts` | Add Tab key handler for ghost draft acceptance |

---

## References

- [Superhuman Instant Reply](https://help.superhuman.com/hc/en-us/articles/38458397554963-Instant-Reply)
- [Superhuman AI Instant Reply (blog)](https://blog.superhuman.com/superhuman-ai-instant-reply/)
- [GitHub Copilot inline suggestions](https://code.visualstudio.com/docs/copilot/ai-powered-suggestions)
- [Gmail Smart Reply (Google Workspace)](https://workspace.google.com/features/smart-reply/)
- [Gmail Gemini AI 2026](https://blog.google/products-and-platforms/products/gmail/gmail-is-entering-the-gemini-era/)
- [Arc Max AI](https://arc.net/max)
- [Invisible UX: AI Seamless UX (2025)](https://itmunch.com/invisible-ux-ai-seamless-user-journeys/)
- [Linear UI Redesign](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Linear Design System (Figma)](https://www.figma.com/community/file/1222872653732371433/linear-design-system)
- [Bulk action UX: 8 guidelines (Eleken)](https://www.eleken.co/blog-posts/bulk-actions-ux)
- [Bulk-action bar (Soul Design System)](https://soul.emplifi.io/latest/components/components/bulk-action-bar/usage-UJL5kHLb)
- [Material Design Chips](https://m3.material.io/components/chips)
- [Accordion UI Examples (BricxLabs)](https://bricxlabs.com/blogs/accordion-ui-examples)
- [Notion UX Design Pattern Analysis](https://medium.com/@yolu.x0918/a-breakdown-of-notion-how-ui-design-pattern-facilitates-autonomy-cleanness-and-organization-84f918e1fa48)
- [Spark email: Customize your Inbox](https://sparkmailapp.com/help/manage-your-inbox/customize-your-inbox)
