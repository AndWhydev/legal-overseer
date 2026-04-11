# Inbox Collapse/Expand & Interaction Design Specification

**Date**: 2026-03-14
**Scope**: Collapse/expand mechanism, sidebar-to-full-inbox transitions, keyboard shortcuts, responsive behavior, accessibility, onboarding
**Status**: Authoritative design reference for all future inbox interaction work
**Supersedes**: Ad-hoc decisions made during Q15-Q18

---

## 1. Current State Audit

### 1.1 Collapse/Expand Architecture

The inbox sidebar lives within `dashboard-redesign.tsx` as a grid column alongside the kanban board. The state flow is:

```
localStorage('bb-inbox-collapsed')
       |
       v
  React.useEffect (init)
       |
       v
  inboxCollapsed (boolean state)
       |
       v
  handleInboxCollapse(collapsed: boolean)
       |  - sets state
       |  - persists to localStorage
       v
  Grid CSS: inboxCollapsed ? '1fr 36px' : '1fr 320px'
  Transition: 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)
```

**Grid layout behavior:**
- Expanded: `grid-template-columns: 1fr 320px` -- kanban takes remaining space, inbox fixed at 320px
- Collapsed: `grid-template-columns: 1fr 36px` -- 36px strip renders in place of the full sidebar

### 1.2 The Missing Collapse Button (CRITICAL GAP)

The `InboxFeed` component accepts `onCollapsedChange?: (collapsed: boolean) => void` as a prop, but **never calls it**. There is no UI element anywhere in the inbox feed header, body, or footer that invokes `onCollapsedChange(true)`.

**Consequence:** Users can expand the inbox (by clicking the collapsed strip) but cannot collapse it through any direct UI interaction. The only way to collapse is by modifying localStorage manually or via future keyboard shortcuts that do not yet exist.

This is a one-way door: once expanded, the inbox stays expanded until the page is refreshed with a manually-set localStorage value.

### 1.3 Edge-Knock Pattern

When the inbox is collapsed, a mousemove listener within `dashboard-redesign.tsx` detects proximity to the right viewport edge:

```
Proximity zone: 60px from right edge
Glow calculation: Math.min(1, (60 - distFromRight) / 60)
Throttling: requestAnimationFrame
Cleanup: removes listener when inbox is expanded
```

The collapsed strip renders:
- A 3px luminous vertical bar (`rgba(255, 255, 255, 0.06 + edgeGlow * 0.14)`)
- A chevron-left icon that fades in when `edgeGlow > 0.5`
- Both have glow box-shadows that intensify with proximity
- Click on the strip calls `handleInboxCollapse(false)` to expand

### 1.4 Sidebar-to-Full-Inbox Navigation

Navigation between inbox views uses a custom DOM event:

```typescript
window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'inbox' } }));
```

This event is fired from two places in `InboxFeed`:
1. Clicking the "Inbox" title text in the sidebar header
2. Clicking any message row in the sidebar feed

The event is consumed by the parent tab container to switch the active tab to the full inbox view (`inbox-tab.tsx`).

### 1.5 Keyboard Shortcuts Layer

`use-inbox-keyboard.ts` implements a comprehensive keyboard system:

**Chord system:** Two-key sequences with 500ms timeout (e.g., `g` then `i` = go to inbox)

**Current shortcut map:**
| Key | Action | Context |
|-----|--------|---------|
| j / ArrowDown | Next message | Non-editing |
| k / ArrowUp | Previous message | Non-editing |
| Enter / o | Open message | Non-editing |
| g then i | Go to inbox | Non-editing |
| e | Archive | Non-editing |
| d | Mark done | Non-editing |
| r | Reply | Non-editing |
| f | Forward | Non-editing |
| s | Snooze | Non-editing |
| * | Star/unstar | Non-editing |
| # | Delete | Non-editing |
| Shift+! | Mark spam | Non-editing |
| x | Toggle select | Non-editing |
| / | Search focus | Always |
| ? | Toggle shortcuts overlay | Non-editing |
| 1-5 | Switch category | Non-editing |
| Cmd+a | Select all | Always |
| Cmd+Shift+a | Deselect all | Always |
| Escape | Close/clear selection | Non-editing |

**Notable gaps:** No shortcut for collapse/expand panel. No shortcut for toggling between sidebar and full inbox. No shortcut for drawer open/close from the sidebar context.

### 1.6 Interaction Entry Points Map

A user currently interacts with the inbox through these pathways:

```
                    ┌──────────────────────────────────────┐
                    │        ENTRY POINTS                  │
                    └──────────┬───────────────────────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
          v                    v                    v
   [Sidebar Feed]       [Full Tab]          [Nav Bar]
   320px panel          Full width          Tab header
   on dashboard         inbox-tab.tsx       click/keyboard
          │                    │
          ├─ Title click ─────>│ (bb-navigate event)
          ├─ Message click ───>│ (bb-navigate event)
          ├─ Edge-knock ──── expand collapsed strip
          │
          v
   [Collapsed Strip]
   36px slim bar
   click -> expand
   NO collapse trigger <── THE GAP
```

---

## 2. Competitive Analysis

### 2.1 Slack Sidebar

**Trigger mechanisms:**
- Drag handle on the sidebar edge (resize + collapse at minimum width)
- Keyboard shortcut: `Cmd+Shift+D` (toggle sidebar)
- Menu: Preferences > Sidebar > Show/hide

**Visual affordance:** The sidebar has a visible resize handle (thin vertical line) that appears on hover at the right edge. Below a minimum width threshold (~120px), the sidebar snaps fully closed.

**Animation:** 200ms ease-out slide. Content in the main area smoothly expands to fill the freed space.

**Persistence:** Per-workspace preference, synced to Slack's server-side settings.

**Key insight:** Slack uses the resize handle as a dual-purpose affordance -- it communicates "you can adjust this" and "you can hide this" through a single interaction pattern. Users who drag it narrow enough discover collapse naturally.

### 2.2 VS Code Panel/Sidebar

**Trigger mechanisms:**
- Activity bar icons: clicking an already-active icon toggles the panel
- Keyboard shortcut: `Cmd+B` (toggle sidebar), `Cmd+J` (toggle bottom panel)
- Menu: View > Appearance > Toggle Sidebar Visibility
- Drag-to-resize (sidebar snaps closed at minimum width)

**Visual affordance:** Activity bar icons serve as persistent indicators of panel state. The active panel's icon has a highlighted background. The sidebar's width is communicated through a visible vertical resize handle.

**Animation:** ~120ms transition, no spring/bounce. Strictly functional.

**Persistence:** Per-workspace, stored in `.vscode/` settings. Synced via Settings Sync.

**Key insight:** VS Code uses the same icon to both open AND close a panel. Clicking the active panel icon closes it. This is a toggle pattern that reduces UI surface area -- no separate close button needed.

### 2.3 Notion Sidebar

**Trigger mechanisms:**
- Hover-to-reveal: when sidebar is collapsed, moving cursor to the left edge reveals it as an overlay
- Pin/unpin toggle: a lock icon in the sidebar header toggles between "always visible" (pinned) and "hover-only" (unpinned)
- Keyboard shortcut: `Cmd+\` (toggle sidebar)
- Double-click the resize handle (collapses to minimum)

**Visual affordance:** When collapsed, a thin strip with a hamburger/menu icon persists at the left edge. On hover within ~50px of the edge, the sidebar slides out as a floating overlay (does not push content).

**Animation:** 200ms slide with slight ease-out. The overlay mode adds a subtle shadow to separate it from the main content.

**Persistence:** Per-workspace, synced to Notion's cloud settings.

**Key insight:** Notion separates "temporarily visible" (hover overlay) from "permanently visible" (pinned). This dual-mode approach acknowledges that sometimes you want the panel for one quick look, not permanently. The pin/unpin toggle is a sophistication that BitBit could adopt in a later phase.

### 2.4 Linear Sidebar

**Trigger mechanisms:**
- Sidebar items toggle sections via accordion collapse
- Keyboard shortcut: No dedicated sidebar toggle; `Cmd+K` command palette used for navigation
- The sidebar itself is always visible; individual sections collapse

**Visual affordance:** Section headers have subtle chevron indicators for collapse state. The sidebar background is slightly different from the main content area, creating a visual boundary without a hard border.

**Animation:** 150ms height transition for section collapse. Clean, no bounce.

**Persistence:** Per-user, stored server-side. Section collapse states remembered individually.

**Key insight:** Linear chose not to make the entire sidebar collapsible -- instead, sections within the sidebar collapse. This preserves navigation access while reducing visual noise. For BitBit, the inbox sidebar serves a different purpose (content preview, not navigation), so full collapse is appropriate.

### 2.5 Superhuman Split Pane

**Trigger mechanisms:**
- Keyboard shortcut: `Cmd+\` to toggle reading pane
- Menu: View > Split Pane > Off/Right/Bottom
- The split pane can be resized via drag handle

**Visual affordance:** A resize handle between the message list and reading pane. The handle becomes highlighted on hover (subtle blue line). No explicit collapse button -- users drag the handle to the edge to hide the pane.

**Animation:** Immediate resize (no transition during drag). 200ms snap animation when the handle reaches collapse threshold.

**Persistence:** Per-account, synced across devices.

**Key insight:** Superhuman makes the resize handle the primary interaction. There is no button -- the spatial metaphor (drag to edge = close) is the entire UI. This works because Superhuman's users are power users who discover drag handles through exploration. For BitBit, a more explicit affordance is needed alongside a drag handle.

### 2.6 macOS Finder Sidebar

**Trigger mechanisms:**
- Menu: View > Show/Hide Sidebar
- Keyboard shortcut: `Cmd+Opt+S`
- Drag resize handle to minimum width (snaps closed)

**Visual affordance:** A thin 1px vertical line separates the sidebar from the content area. The resize cursor appears when hovering over this line. No explicit toggle button in the toolbar.

**Animation:** ~250ms ease-in-out. Content area smoothly expands. No spring.

**Persistence:** Per-window, remembered across sessions via macOS window restoration.

**Key insight:** Finder relies heavily on the menu and keyboard shortcut for sidebar toggle -- the drag handle is a secondary discovery path. This works in a native app context where users expect menu-based controls, but in a web app, direct manipulation affordances are more important.

### 2.7 Pattern Synthesis

| Product | Primary trigger | Secondary trigger | Persistent affordance | Animation | Keyboard |
|---------|----------------|-------------------|----------------------|-----------|----------|
| Slack | Drag handle | Cmd+Shift+D | Resize handle visible | 200ms ease | Yes |
| VS Code | Icon toggle | Cmd+B | Activity bar icon | 120ms linear | Yes |
| Notion | Pin/unpin button | Cmd+\ | Hover-reveal strip | 200ms ease-out | Yes |
| Linear | Section chevrons | -- | Chevron indicators | 150ms ease | No |
| Superhuman | Drag to edge | Cmd+\ | Resize handle | 200ms snap | Yes |
| Finder | Menu/drag | Cmd+Opt+S | 1px resize line | 250ms ease | Yes |

**Universal patterns:**
1. Every product has a keyboard shortcut for toggle
2. Every product that supports full collapse has a persistent visual affordance in the collapsed state
3. Animation durations cluster at 150-250ms; no product uses spring/bounce for panel collapse
4. All products persist collapse state across sessions

---

## 3. Collapse/Expand Design Specification

### 3.A Collapse Trigger (Critical Fix)

**Recommended solution: Header chevron button**

Add a dedicated collapse button to the `InboxFeed` header bar, placed at the far right after the autopilot button.

```
┌─ InboxFeed Header ──────────────────────────────────┐
│ [Inbox icon]  Inbox  [3]         [Autopilot]  [>>]  │
└─────────────────────────────────────────────────────┘
                                                 ^^^
                                          Collapse button
```

**Button specifications:**

```typescript
const collapseButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  padding: 0,
  borderRadius: 6,
  border: '1px solid transparent',
  background: 'transparent',
  color: 'var(--text-dim)',           // #8A8279 at rest
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  flexShrink: 0,
};

// Hover state:
// background: 'rgba(255, 255, 255, 0.06)'
// color: 'var(--text-secondary)'     // #B8B0A0
// border: '1px solid rgba(255, 255, 255, 0.06)'

// Active (pressed) state:
// background: 'rgba(255, 255, 255, 0.1)'
// transform: 'scale(0.95)'
```

**Icon:** Chevron-right-double (>>) or `PanelRightClose` from Lucide (16x16). The chevron points right, indicating "push this panel away to the right edge." On hover, a tooltip reads "Collapse inbox (])".

**Why not other options:**
- **Double-click on header:** Too hidden, conflicts with accessibility expectations, not discoverable
- **Drag handle:** Good secondary mechanism (Phase B), but insufficient alone because the sidebar has a fixed width (320px) with no existing resize behavior
- **X/close button:** Wrong mental model -- the inbox is not "closing," it is collapsing. X implies destruction/dismissal

**Placement rationale:** The button sits at the header's trailing edge, matching the position where Notion, Slack, and VS Code place their panel controls. It does not conflict with the "Inbox" title click (which navigates to full inbox tab) because it is a separate interactive element with distinct position and visual treatment.

**Implementation target:**
- File: `personal-assistant/src/components/dashboard/inbox-feed.tsx`
- Location: Inside the header `<div>`, after the autopilot button's container
- Action: `onClick={() => onCollapsedChange?.(true)}`

### 3.B Edge-Knock Evaluation

**Current 60px zone: Adequate but could be improved.**

The 60px proximity zone is comparable to macOS hot corners (~45px effective zone) and Notion's hover-reveal (~50px). It provides enough sensitivity for intentional approach without triggering on casual mouse movements across the screen.

**Recommended enhancements:**

1. **Persistent minimal affordance (always visible):**
   The current collapsed strip renders nothing visible until the cursor enters the 60px zone. This violates Shneiderman's "recognition over recall" principle -- users must remember the inbox exists there.

   Add a persistent 2px line at 20% opacity that is always visible in the collapsed strip:

   ```typescript
   // Always-visible base line (independent of edgeGlow)
   const baseLine: React.CSSProperties = {
     position: 'absolute',
     top: 24,
     bottom: 24,
     left: '50%',
     transform: 'translateX(-50%)',
     width: 2,
     borderRadius: 2,
     background: 'rgba(255, 255, 255, 0.04)',  // subtle but visible
     transition: 'all 0.3s ease',
   };
   ```

2. **Unread count badge on collapsed strip:**
   When the inbox has unread messages, show a small badge on the collapsed strip:

   ```
   ┌───┐
   │   │
   │ 3 │  <-- unread count badge
   │   │
   │ | │  <-- luminous line
   │   │
   │ < │  <-- chevron (on hover)
   │   │
   └───┘
   ```

   Badge specs:
   ```typescript
   const collapsedBadge: React.CSSProperties = {
     position: 'absolute',
     top: 12,
     left: '50%',
     transform: 'translateX(-50%)',
     minWidth: 18,
     height: 18,
     borderRadius: 9,
     background: 'var(--bb-orange)',       // #FF5A1F
     color: '#000',
     fontSize: 10,
     fontWeight: 700,
     display: 'flex',
     alignItems: 'center',
     justifyContent: 'center',
     padding: '0 4px',
     lineHeight: 1,
   };
   ```

3. **Edge-knock as secondary mechanism:**
   Edge-knock should remain as a secondary expand mechanism. The primary expand is clicking the collapsed strip (already implemented). Edge-knock provides a "hover to preview, click to commit" enhancement.

4. **Tooltip on hover (above threshold):**
   When `edgeGlow > 0.7`, show a tooltip: "Click to expand inbox" positioned to the left of the strip.

**Implementation target:**
- File: `personal-assistant/src/components/dashboard/dashboard-redesign.tsx`
- Location: The collapsed strip `<div>` (lines 215-257)
- Props needed: Pass `unreadCount` from `InboxFeed` up to `DashboardRedesign` via callback or context

### 3.C Keyboard Shortcut for Collapse/Expand

**Recommended shortcut: `]` (right bracket)**

Rationale:
- `]` is mnemonic for "push the panel right" (collapse)
- `[` is naturally associated with "pull the panel left" (expand)
- However, for simplicity, `]` should toggle (collapse if expanded, expand if collapsed)
- No conflict with existing shortcuts (checked against full shortcut map in section 1.5)
- Consistent with the bracket convention used in some text editors for panel toggling

**Alternative considered:** `Cmd+\` (used by Notion and Superhuman). Rejected because Cmd+key combinations are harder to discover and the inbox keyboard system already uses bare keys (no modifier required for most actions).

**Implementation approach:**

The shortcut must work at the dashboard level, not just within the inbox tab. It should be registered in a new `useEffect` in `dashboard-redesign.tsx`:

```typescript
// In dashboard-redesign.tsx
React.useEffect(() => {
  const handleToggle = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) return;
    if (e.key === ']' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      handleInboxCollapse(!inboxCollapsed);
    }
  };
  window.addEventListener('keydown', handleToggle);
  return () => window.removeEventListener('keydown', handleToggle);
}, [inboxCollapsed, handleInboxCollapse]);
```

**Update shortcuts overlay:** Add to `inbox-shortcuts-overlay.tsx`:
```typescript
{ keys: [']'], description: 'Toggle inbox panel', category: 'Navigation' },
```

### 3.D Animation and Transition Design

**Current animation evaluation:**

The current `cubic-bezier(0.34, 1.56, 0.64, 1)` is a spring curve that overshoots by approximately 15%. This creates a visible "bounce" as the grid columns settle. While playful, this is inappropriate for a panel resize operation for two reasons:

1. Panels should feel mechanical and precise, not springy. Springs suggest organic/living movement -- appropriate for notifications or toasts, not for structural layout changes.
2. The overshoot causes the kanban board content to momentarily compress beyond its target width, then snap back, which can cause visual artifacts (text reflow, column width flickering).

**Recommended animation:**

```css
/* Collapse: fast start, cushioned end */
transition: grid-template-columns 0.25s cubic-bezier(0.4, 0, 0.2, 1);

/* This is Material Design's "standard easing" -- feels responsive
   without overshoot. 250ms is fast enough to feel instant but
   slow enough to communicate the spatial change. */
```

**Sub-animations (staggered):**

1. **Content fade during collapse** (inbox feed content fades to 0 before the panel width reaches 36px):
   ```css
   /* InboxFeed wrapper */
   opacity: inboxCollapsed ? 0 : 1;
   transition: opacity 0.15s ease;
   /* 150ms opacity < 250ms width, so content fades before the panel finishes collapsing */
   ```

2. **Collapsed strip elements fade in after collapse completes:**
   ```css
   /* Collapsed strip badge + line */
   opacity: inboxCollapsed ? 1 : 0;
   transition: opacity 0.15s ease 0.1s; /* 100ms delay waits for collapse to progress */
   ```

3. **Expand: content fades in after panel reaches ~80% of target width:**
   ```css
   /* InboxFeed wrapper during expand */
   opacity: inboxCollapsed ? 0 : 1;
   transition: opacity 0.2s ease 0.1s; /* slight delay for panel to open first */
   ```

**State machine:**

```
                ┌──────────────┐
                │   EXPANDED   │ (default)
                │  width: 320px│
                │  opacity: 1  │
                └──────┬───────┘
                       │
          ] key / click collapse btn
                       │
                       v
                ┌──────────────┐
                │  COLLAPSING  │ (transient, 250ms)
                │  width: 320→36│
                │  opacity: 1→0│
                └──────┬───────┘
                       │ (after 250ms)
                       v
                ┌──────────────┐
                │  COLLAPSED   │
                │  width: 36px │
                │  strip: show │
                │  badge: show │
                └──────┬───────┘
                       │
          ] key / click strip / edge-knock click
                       │
                       v
                ┌──────────────┐
                │  EXPANDING   │ (transient, 250ms)
                │  width: 36→320│
                │  opacity: 0→1│
                └──────┬───────┘
                       │ (after 250ms)
                       v
                ┌──────────────┐
                │   EXPANDED   │
                └──────────────┘
```

### 3.E Collapsed State Enhancements

**1. Unread count badge** (specified in 3.B above):
- Show when `unreadCount > 0`
- Display format: `3` for counts 1-99, `99+` for higher
- Use `var(--bb-orange)` background, `#000` text
- Positioned at the top of the collapsed strip

**2. Latest message preview on hover:**
When hovering over the collapsed strip (edgeGlow > 0.5), display a tooltip-style preview card floating to the left of the strip:

```
                                    ┌──────────────────────────┐ ┌──┐
                                    │ Sarah Chen         12m   │ │  │
                                    │ Website revision...      │ │ 3│
                                    │ Andy Wu            5m    │ │  │
                                    │ Can you check Sentry...  │ │ |│
                                    └──────────────────────────┘ │  │
                                                                 │ <│
                                                                 │  │
                                                                 └──┘
```

**Preview card specs:**
```typescript
const previewCard: React.CSSProperties = {
  position: 'absolute',
  right: 44,                        // 36px strip + 8px gap
  top: 40,
  width: 260,
  maxHeight: 300,
  borderRadius: 12,
  background: 'var(--glass-bg-heavy)',  // rgba(15, 20, 30, 0.85)
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
  padding: '8px 0',
  overflow: 'hidden',
  pointerEvents: 'none',            // preview only, click goes to strip
};
```

Show the top 3 most recent messages, each as a compact 2-line entry (sender + time, subject/preview). This gives users a "peek" at their inbox without committing to expanding it.

**Phase:** This is a Phase B enhancement. Phase A focuses on the collapse button and keyboard shortcut.

**3. Mini notification pulse:**
When a new message arrives while the inbox is collapsed, briefly pulse the unread badge:

```css
@keyframes badgePulse {
  0%, 100% { transform: translateX(-50%) scale(1); }
  50% { transform: translateX(-50%) scale(1.2); }
}
/* Applied for 600ms when new message arrives while collapsed */
animation: badgePulse 0.3s ease 2;
```

---

## 4. Sidebar to Full Inbox Transition

### 4.1 The Three Inbox Surfaces

```
┌─────────────────────────────────────────────────────────────────┐
│ SURFACE 1: INBOX SIDEBAR FEED                                   │
│ Location: dashboard-redesign.tsx > InboxFeed                    │
│ Width: 320px (fixed)                                            │
│ Purpose: PREVIEW -- recent messages at a glance                 │
│ Content density: 3-line rows (subject, sender, preview)         │
│ Actions available: None (click navigates to full tab)           │
│ State: isCollapsed, onCollapsedChange                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SURFACE 2: INBOX FULL TAB                                       │
│ Location: tabs/inbox-tab.tsx                                    │
│ Width: Full content area                                        │
│ Purpose: WORK -- triage, read, reply, organize                  │
│ Content density: Category pills, search, expandable rows        │
│ Actions: Archive, done, reply, forward, snooze, star, delete    │
│ State: messages[], expandedId, activePill, keyboard shortcuts   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SURFACE 3: INBOX DRAWER                                         │
│ Location: inbox-drawer.tsx                                      │
│ Width: 55% viewport (resizable 40-70%)                          │
│ Purpose: DEEP READ -- full message, threads, compose reply      │
│ Content: Full body, AI summary, thread view, reply composer     │
│ Actions: Reply, forward, archive, done, spam                    │
│ State: open, message, drawerWidth                               │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Transition: Sidebar Feed -> Full Tab

**Current behavior:** Clicking "Inbox" title or any message row in `InboxFeed` fires `bb-navigate` event with `{ tab: 'inbox' }`. The parent container switches the active tab.

**Problem:** The transition is abrupt -- the tab switches instantly with no spatial continuity. The user loses context of where they were on the dashboard.

**Recommended behavior:**

1. **Sidebar auto-collapse on full tab activation:**
   When `bb-navigate` fires to switch to the inbox full tab, automatically collapse the sidebar feed. Rationale: the sidebar is a preview -- once the user enters the full work surface, the sidebar is redundant and wastes screen space.

   Implementation:
   ```typescript
   // In the bb-navigate event handler (parent component)
   if (detail.tab === 'inbox') {
     handleInboxCollapse(true); // collapse sidebar
     setActiveTab('inbox');
   }
   ```

2. **Specific message deep-link:**
   When a message row in the sidebar is clicked, navigate to the full tab AND pre-expand that specific message:
   ```typescript
   // In InboxFeed message click handler
   window.dispatchEvent(new CustomEvent('bb-navigate', {
     detail: { tab: 'inbox', messageId: msg.id }
   }));
   ```
   The full tab should listen for `messageId` in the event detail and auto-expand that row.

3. **No visual transition animation between surfaces:**
   Tab switches should remain instant. Adding slide or crossfade animations between dashboard and inbox tab would feel sluggish and over-designed for a productivity tool. Speed is UX (Design Principle #5).

### 4.3 Transition: Full Tab -> Sidebar

**Current behavior:** When the user navigates away from the inbox tab (to dashboard or another tab), nothing happens to the sidebar collapse state.

**Recommended behavior:**

1. **Do NOT auto-expand the sidebar when leaving inbox tab.** The sidebar collapse state is a user preference, not a view-dependent state. If the user collapsed it (either manually or via the auto-collapse on tab switch), respect that choice.

2. **Exception: first-visit heuristic.** If the user has never explicitly collapsed the inbox (no `bb-inbox-collapsed` key in localStorage), default to expanded when on the dashboard tab. This ensures new users see the inbox feed.

### 4.4 Message Click in Sidebar

**Current behavior:** All message clicks in the sidebar navigate to the full inbox tab (via `bb-navigate`).

**Recommended behavior:**

The sidebar feed is a preview surface. All interactions from it should lead to a work surface. The current behavior (navigate to full tab) is correct.

**Modifier-click interactions (Phase C):**

| Click type | Action | Rationale |
|-----------|--------|-----------|
| Regular click | Navigate to full tab, expand that message | Primary flow |
| Cmd/Ctrl+click | Navigate to full tab, open message in drawer | Power user: deep read without losing list context |
| Middle click | No action (prevent new tab) | Web convention override |

### 4.5 Drawer vs Inline Expand Decision Criteria

The inbox has two ways to show message details: inline expanded row (in full tab) and the overlay drawer. The decision criteria should be:

| Criterion | Inline Expand | Drawer |
|-----------|--------------|--------|
| Context needed | Low -- quick triage | High -- extended reading, composing |
| Thread depth | Shallow (1-3 messages) | Deep (4+ messages) |
| Trigger | Single click on row | Enter/o key, or Cmd+click from sidebar |
| Screen estate | Uses list space | Overlay, preserves list position |
| Reply flow | Ghost draft, quick reply | Full composer with formatting |
| Attachment view | Pills inline | Full preview with thumbnails |

**Recommended trigger:**
- Click or Enter on a row: inline expand (current behavior)
- `Shift+Enter` or double-click: open in drawer for deep read
- Drawer should also be openable via an "Open in drawer" action in the inline expand's action bar

---

## 5. First-Time User Experience

### 5.1 Collapse Button Discovery

**One-time tooltip on first visit:**

When the collapse button is first rendered and the user has no `bb-inbox-seen-collapse-hint` in localStorage, show a subtle tooltip:

```
                          ┌──────────────────────────┐
                          │ Collapse the inbox panel  │
                          │ Shortcut: ]               │
                          └────────────────┬─────────┘
                                           │
  [Inbox icon]  Inbox  [3]  [Autopilot]  [>>]
```

**Tooltip specs:**
```typescript
const tooltipStyle: React.CSSProperties = {
  position: 'absolute',
  top: -40,
  right: 0,
  padding: '6px 12px',
  borderRadius: 8,
  background: 'var(--glass-bg-heavy)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
  fontSize: 12,
  color: 'var(--text-secondary)',
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
  animation: 'fadeIn 0.3s ease',
};
```

**Dismissal:** Auto-dismiss after 5 seconds or when the user clicks anywhere. Set `localStorage.setItem('bb-inbox-seen-collapse-hint', 'true')` on dismissal.

### 5.2 Keyboard Shortcut Discoverability

**Problem:** The `?` key opens the shortcuts overlay, but users must know to press `?` in the first place. This is a bootstrap problem -- the discovery mechanism itself needs to be discovered.

**Strategy: Progressive hints**

1. **Footer hint (always visible on first 5 visits):**
   At the bottom of the inbox full tab, show a dim hint:
   ```
   Press ? for keyboard shortcuts
   ```
   Specs: `fontSize: 11, color: 'var(--text-dim)', opacity: 0.5`, centered, padding 8px. Auto-hide after the user has visited the inbox tab 5 times (tracked in localStorage as `bb-inbox-visit-count`).

2. **Contextual shortcut hints (after manual actions):**
   After a user performs 5+ manual navigations (clicking message rows instead of using j/k), show an inline hint next to the navigation area:
   ```
   Tip: use j/k to navigate
   ```
   This hint appears once, fades after 3 seconds, and is tracked with `bb-inbox-seen-jk-hint`.

3. **Action shortcut hints in expanded row:**
   When a user clicks the Archive button in an expanded row's action bar, show a transient hint:
   ```
   [Archive button clicked]  →  "Next time, press E"
   ```
   Show this hint exactly twice per action, then never again. Track per-action hints independently.

**Key principle:** All hints are:
- Dismissable (click or wait)
- Non-blocking (do not overlay content or require interaction)
- Limited (each hint shows a maximum number of times, then permanently hidden)
- Non-intrusive (per Design Principle #3: progressive disclosure)

### 5.3 Edge-Knock Discovery

The edge-knock pattern (collapsed strip) is inherently discoverable through spatial exploration -- users naturally move their cursor to screen edges. No explicit onboarding is needed for this pattern beyond the persistent visual affordance (2px line) recommended in section 3.B.

---

## 6. Responsive and Mobile Behavior

### 6.1 Breakpoint Strategy

```
Desktop (>1024px):   Kanban + Inbox sidebar, collapse/expand enabled
Tablet (768-1024px): Single column, inbox becomes bottom sheet
Mobile (<768px):     Inbox is a separate full-screen page
```

### 6.2 Desktop (>1024px)

Current behavior is correct:
- Grid: `1fr 320px` (expanded) or `1fr 36px` (collapsed)
- All collapse/expand features active
- Edge-knock active
- Keyboard shortcuts active

### 6.3 Tablet (768-1024px)

**Current behavior:** `@media (max-width: 1024px)` forces `grid-template-columns: 1fr !important`, which completely removes the inbox sidebar from the dashboard layout.

**Recommended behavior:**

1. **Remove inbox from dashboard grid entirely at this breakpoint.** The 320px sidebar is too narrow for a tablet's reduced viewport -- it would take ~40% of the screen.

2. **Replace with a bottom-sheet inbox accessible from a floating action button (FAB):**

   ```
   ┌─────────────────────────────────────────┐
   │                                         │
   │           Dashboard Content             │
   │          (KPIs + Kanban only)            │
   │                                         │
   │                                         │
   │                                         │
   │                                    ┌──┐ │
   │                                    │ 3│ │  <- Inbox FAB with
   │                                    └──┘ │     unread count
   └─────────────────────────────────────────┘
   ```

   FAB specs:
   ```typescript
   const inboxFab: React.CSSProperties = {
     position: 'fixed',
     bottom: 20,
     right: 20,
     width: 48,
     height: 48,
     borderRadius: 16,
     background: 'var(--glass-card-bg)',
     backdropFilter: 'var(--glass-card-blur)',
     WebkitBackdropFilter: 'var(--glass-card-blur)',
     border: '1px solid rgba(255, 255, 255, 0.08)',
     boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
     display: 'flex',
     alignItems: 'center',
     justifyContent: 'center',
     cursor: 'pointer',
     zIndex: 40,
   };
   ```

3. **Bottom sheet on FAB click:**
   Slides up from the bottom, covering 60% of the viewport. Contains the `InboxFeed` component. Drag handle at the top for dismiss (swipe down) or expand to full screen (swipe up).

   ```
   ┌─────────────────────────────────────────┐
   │           Dashboard Content             │
   ├─────────────────────────────────────────┤
   │  ──── (drag handle) ────                │
   │                                         │
   │  [Inbox icon]  Inbox  [3]               │
   │                                         │
   │  Sarah Chen           12m               │
   │  Website revision...                    │
   │                                         │
   │  Andy Wu              5m                │
   │  Can you check Sentry...               │
   │                                         │
   └─────────────────────────────────────────┘
   ```

### 6.4 Mobile (<768px)

1. **Inbox is a full-screen page** accessible via the bottom navigation tab bar (which should include an Inbox tab with badge).
2. The collapsed strip and edge-knock do not exist on mobile.
3. Keyboard shortcuts do not apply on mobile.
4. The full inbox tab renders in single-column mode with expanded rows taking full width.

### 6.5 Touch Gesture Mapping

| Desktop action | Touch equivalent | Gesture |
|---------------|------------------|---------|
| j/k navigation | Scroll | Native scroll |
| Click to expand | Tap | Native tap |
| e (archive) | Swipe left | 50% threshold, spring back if released early |
| s (snooze) | Swipe right | 50% threshold, reveal snooze options |
| Shift+click (range select) | Long press | 300ms hold activates selection mode |
| ? (shortcuts) | Not available | Touch users do not need shortcut reference |

**Swipe gesture specs:**
```typescript
// Swipe-to-archive
const SWIPE_THRESHOLD = 0.5;     // 50% of row width
const SWIPE_VELOCITY = 0.3;      // px/ms -- fast flick bypasses threshold

// Visual feedback during swipe:
// Row slides, revealing action color underneath:
// Left swipe (archive): rgba(34, 197, 94, 0.15) with Archive icon
// Right swipe (snooze): rgba(99, 102, 241, 0.15) with Clock icon
```

### 6.6 Collapsed Strip on Tablet

The collapsed strip (36px) should NOT exist on tablet. At tablet viewport widths, the 36px strip is disproportionately large relative to the reduced content area, and the edge-knock pattern does not translate well to touch screens (no hover state).

---

## 7. Accessibility

### 7.1 ARIA Roles and States

**Collapsed strip:**
```html
<div
  role="button"
  aria-label="Expand inbox"
  aria-expanded="false"
  tabIndex={0}
>
```

**Expanded sidebar:**
```html
<aside
  role="complementary"
  aria-label="Inbox feed"
>
  <div role="region" aria-label="Inbox messages">
    <!-- message list -->
  </div>
</aside>
```

**Collapse button:**
```html
<button
  aria-label="Collapse inbox panel"
  aria-controls="inbox-sidebar"
  aria-expanded="true"
  title="Collapse inbox (])"
>
```

### 7.2 Focus Management

**On collapse:**
1. Move focus to the collapsed strip (it receives `role="button"` and `tabIndex={0}`)
2. Announce via `aria-live="polite"`: "Inbox panel collapsed. Press ] or click to expand."

**On expand:**
1. Move focus to the first message in the inbox feed
2. Announce: "Inbox panel expanded. {N} messages."

**Implementation:**
```typescript
// After collapse animation completes
const stripRef = useRef<HTMLDivElement>(null);
React.useEffect(() => {
  if (inboxCollapsed && stripRef.current) {
    stripRef.current.focus();
  }
}, [inboxCollapsed]);

// Screen reader announcement
const [announcement, setAnnouncement] = React.useState('');
// <div role="status" aria-live="polite" className="sr-only">{announcement}</div>
```

### 7.3 Keyboard Trap Prevention

The inbox sidebar is NOT modal -- it is a complementary region. Users must be able to Tab out of the inbox feed into the kanban board or other dashboard elements without being trapped.

**Tab order:**
1. Dashboard KPI cards
2. Daily brief
3. Kanban board columns and cards
4. Inbox feed (if expanded): header, messages, collapse button
5. Inbox collapsed strip (if collapsed): single tab stop

The collapse button and collapsed strip must both be reachable via Tab and activatable via Enter/Space.

### 7.4 Reduced Motion

Respect `prefers-reduced-motion: reduce`:

```css
@media (prefers-reduced-motion: reduce) {
  .dashboard-main-grid {
    transition: none !important;
  }
  /* Collapsed strip pulse animation */
  .inbox-badge-pulse {
    animation: none !important;
  }
}
```

In React, check:
```typescript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Use in transition styles:
transition: prefersReducedMotion ? 'none' : 'grid-template-columns 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
```

When reduced motion is active:
- Panel collapse/expand is instant (no transition)
- Badge pulse does not animate
- Edge-knock glow still responds to proximity (it is informational, not decorative)
- Content fade transitions are instant

### 7.5 Screen Reader Considerations

**Collapsed strip:**
- Must announce unread count: `aria-label="Expand inbox. 3 unread messages."`
- Must be announced in landmark navigation as a button within complementary region

**Message list in sidebar:**
- Each message row should have `role="listitem"` within a `role="list"` container
- Messages should announce: sender, subject, time, and processed state
- Example: `aria-label="Email from Sarah Chen: Website revision, 12 minutes ago, unread"`

---

## 8. State Management Recommendations

### 8.1 Current State: localStorage Only

The collapse state is persisted in `localStorage` under key `bb-inbox-collapsed`. This has limitations:

- No synchronization across browser tabs
- No persistence across devices
- Lost on localStorage clear/incognito

### 8.2 Cross-Tab Sync via BroadcastChannel

**Recommendation: Implement in Phase B.**

When a user has multiple BitBit tabs open, collapsing the inbox in one tab should reflect in all tabs.

```typescript
// In dashboard-redesign.tsx
const channel = React.useRef<BroadcastChannel | null>(null);

React.useEffect(() => {
  channel.current = new BroadcastChannel('bb-inbox-state');
  channel.current.onmessage = (event) => {
    if (event.data.type === 'inbox-collapse') {
      setInboxCollapsed(event.data.collapsed);
    }
  };
  return () => channel.current?.close();
}, []);

// In handleInboxCollapse:
const handleInboxCollapse = React.useCallback((collapsed: boolean) => {
  setInboxCollapsed(collapsed);
  localStorage.setItem('bb-inbox-collapsed', JSON.stringify(collapsed));
  channel.current?.postMessage({ type: 'inbox-collapse', collapsed });
}, []);
```

**Browser support:** BroadcastChannel is supported in all modern browsers (Chrome 54+, Firefox 38+, Safari 15.4+, Edge 79+). Fallback: do nothing (localStorage-only behavior).

### 8.3 Server-Side Preference Storage

**Recommendation: Phase C, only if user settings sync is implemented globally.**

Collapse state is a UI preference, not critical data. Storing it server-side is only worthwhile if BitBit implements a general user preferences system (theme, layout, etc.) that syncs across devices.

If implemented, store as a JSON column in the user's settings:
```json
{
  "inbox": {
    "collapsed": true,
    "drawerWidth": 55
  }
}
```

### 8.4 Unread Count Synchronization

**Problem:** The sidebar feed and full inbox tab both display unread counts, but they use different data sources. The sidebar fetches from `/api/agent/inbox?limit=30` while the full tab has its own fetch logic.

**Recommendation:** Introduce a shared React context for inbox state:

```typescript
interface InboxContextValue {
  unreadCount: number;
  totalCount: number;
  lastFetchedAt: number;
  refetch: () => void;
}

const InboxContext = React.createContext<InboxContextValue>({
  unreadCount: 0,
  totalCount: 0,
  lastFetchedAt: 0,
  refetch: () => {},
});
```

This context would live in the layout component that wraps both the dashboard and the inbox tab, ensuring a single source of truth for counts.

### 8.5 Message Read State Propagation

When a user reads a message in the full inbox tab (by expanding it), the sidebar feed should reflect this immediately. Currently, the sidebar would only update on its next fetch cycle.

**Recommendation:** Use Supabase realtime subscription (already wired in `InboxFeed`) to propagate read state changes. When the full tab marks a message as read, it updates the database, and the realtime subscription triggers a refetch in the sidebar.

This is already partially implemented -- `InboxFeed` subscribes to `channel_messages` INSERT events. Extend it to also subscribe to UPDATE events for read state changes.

---

## 9. Implementation Roadmap

### Phase A: Critical (Week 1)

**Fix the missing collapse button and add keyboard shortcut.**

| Task | File | Scope | Estimate |
|------|------|-------|----------|
| A1. Add collapse button to InboxFeed header | `inbox-feed.tsx` | Add button element, wire `onCollapsedChange(true)` | Small |
| A2. Add `]` keyboard shortcut in dashboard | `dashboard-redesign.tsx` | New useEffect for keydown listener | Small |
| A3. Update shortcuts overlay | `inbox-shortcuts-overlay.tsx` | Add ] to SHORTCUTS array | Trivial |
| A4. Fix animation curve | `dashboard-redesign.tsx` | Change cubic-bezier to standard easing, reduce to 250ms | Trivial |
| A5. Add content fade during collapse | `dashboard-redesign.tsx`, `inbox-feed.tsx` | Opacity transitions on InboxFeed wrapper | Small |

**Files modified:** 3
**Estimated total effort:** 1-2 hours
**Verification:** User can collapse inbox via button click, expand via strip click, toggle via `]` key. Animation is smooth without bounce.

### Phase B: Important (Week 2-3)

**Enhanced collapsed strip, transition polish, accessibility.**

| Task | File | Scope | Estimate |
|------|------|-------|----------|
| B1. Always-visible 2px line on collapsed strip | `dashboard-redesign.tsx` | Add persistent base line element | Trivial |
| B2. Unread count badge on collapsed strip | `dashboard-redesign.tsx` | Pass unread count, render badge | Small |
| B3. Sidebar auto-collapse on full tab navigation | Parent tab container | Add collapse call in bb-navigate handler | Small |
| B4. ARIA roles and focus management | `dashboard-redesign.tsx`, `inbox-feed.tsx` | Add roles, aria-labels, focus logic | Medium |
| B5. Screen reader announcements | `dashboard-redesign.tsx` | aria-live region for state changes | Small |
| B6. Reduced motion support | `dashboard-redesign.tsx` | Media query check, conditional transitions | Small |
| B7. Cross-tab sync via BroadcastChannel | `dashboard-redesign.tsx` | BroadcastChannel setup and handlers | Small |
| B8. Message deep-link from sidebar click | `inbox-feed.tsx`, `inbox-tab.tsx` | Pass messageId in bb-navigate, auto-expand | Medium |

**Files modified:** 4-5
**Estimated total effort:** 4-6 hours
**Verification:** Collapsed strip shows unread count. Navigating to inbox tab auto-collapses sidebar. Screen readers announce state changes. Multiple tabs stay in sync.

### Phase C: Nice-to-Have (Week 4+)

**First-time onboarding, responsive touch gestures, preview card.**

| Task | File | Scope | Estimate |
|------|------|-------|----------|
| C1. One-time collapse button tooltip | `inbox-feed.tsx` | Tooltip component with localStorage tracking | Small |
| C2. Footer "Press ? for shortcuts" hint | `inbox-tab.tsx` | Conditional hint with visit counter | Small |
| C3. Contextual shortcut hints after manual actions | `inbox-tab.tsx` | Hint system with per-action tracking | Medium |
| C4. Hover preview card on collapsed strip | `dashboard-redesign.tsx` | Preview card component, data pass-through | Medium |
| C5. Tablet bottom-sheet inbox (768-1024px) | New component | FAB, bottom sheet with gesture support | Large |
| C6. Mobile swipe gestures (swipe to archive/snooze) | `inbox-tab.tsx` | Touch event handlers, swipe physics | Large |
| C7. Shared InboxContext for count sync | New context file | Context provider, refactor data flow | Medium |
| C8. Server-side preference storage | API route, DB | Only if user preferences system exists | Medium |

**Files modified:** 5-8 (includes new files)
**Estimated total effort:** 12-18 hours
**Verification:** New users see tooltip on collapse button. Tablet users access inbox via FAB + bottom sheet. Swipe gestures work on touch devices.

---

## Appendix A: Design Token Reference

All values used in this document reference the established glassmorphic design system:

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#0A0F1A` | Page background |
| `--glass-card-bg` | `rgba(15, 20, 30, 0.6)` | Glass card background |
| `--glass-bg-heavy` | `rgba(15, 20, 30, 0.85)` | Heavy glass (modals, tooltips) |
| `--glass-card-blur` | `blur(20px) saturate(1.2)` | Backdrop filter |
| `--glass-card-border` | `rgba(255, 255, 255, 0.03)` | Subtle card border |
| `--glass-divider` | `rgba(255, 255, 255, 0.04)` | Dividers and separators |
| `--text-primary` | `#F5F0E8` | Primary text |
| `--text-secondary` | `#B8B0A0` | Secondary/label text |
| `--text-dim` | `#8A8279` | Muted text |
| `--bb-orange` | `#FF5A1F` | Accent color (badges, CTAs) |
| `--hover-bg` | `rgba(255, 255, 255, 0.04)` | Hover background |
| `--hover-bg-strong` | `rgba(255, 255, 255, 0.08)` | Stronger hover background |
| `--bb-surface-hover` | `rgba(20, 28, 40, 0.7)` | Row hover background |

## Appendix B: Shortcut Conflict Check

Full conflict analysis for the proposed `]` shortcut:

| Existing shortcut | Key | Conflict? |
|-------------------|-----|-----------|
| Next message | j | No |
| Previous message | k | No |
| Open message | Enter / o | No |
| Go to inbox | g then i | No |
| Archive | e | No |
| Done | d | No |
| Reply | r | No |
| Forward | f | No |
| Snooze | s | No |
| Star | * | No |
| Delete | # | No |
| Spam | Shift+! | No |
| Select | x | No |
| Search | / | No |
| Shortcuts overlay | ? | No |
| Category switch | 1-5 | No |
| Select all | Cmd+a | No |
| Deselect all | Cmd+Shift+a | No |
| Close | Escape | No |

**Result:** `]` has zero conflicts with existing shortcuts. The `[` key is also available if a dedicated "expand" shortcut is desired (though `]` as toggle is preferred for simplicity).

## Appendix C: Previous Design Work Reference

This document builds upon and supersedes interaction decisions from:

| Quick task | Focus | Key decisions carried forward |
|-----------|-------|------------------------------|
| Q14 | Neutral icons, edge-knock | Edge-knock proximity pattern, channel icon system |
| Q15 | Modifier-key select, expandable rows | Shift+click range select, inline expand replaces drawer |
| Q16/DESIGN-BRIEF | Toolbar, expanded row UX | 6 design principles, ghost draft model, invisible AI, bottom action bar |
| Q18 | Polish (hover time, filter chips, reply) | Continuous card design, chat-style reply, icon actions |

The interaction patterns established in Q16's DESIGN-BRIEF.md remain authoritative for **content within the expanded row** (ghost draft, invisible AI, attachment pills, bulk actions). This document is authoritative for **structural interactions** (collapse/expand, sidebar-to-tab transitions, responsive behavior, onboarding).
