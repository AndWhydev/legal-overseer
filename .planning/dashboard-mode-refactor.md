# Dashboard Mode Refactor — Design Plan

**Date:** 2026-04-23
**Author:** Claude (planning session with Tor)
**Status:** Approved — 3 taste calls confirmed (monochrome accent, names as-listed, full 3-PR scope). Ready for PR 1.
**Companion doc:** `.claude/docs/ai/dashboard-mode-switcher/10x/session-1.md`

---

## 1. Executive Summary

Introduce a **4-mode workspace switcher** in the top header (Chat · Inbox · Work · Money) where each mode:

1. Swaps the sidebar content (not the chrome)
2. Animates the main-canvas max-width to a mode-appropriate constraint
3. Persists its own state (last page, scroll, unsaved drafts, selected item)
4. Is addressable by keyboard (⌘1–⌘4) and Cmd+K
5. Feeds its identity back to the agent as a context signal (persona + retrieval + tools)

The refactor is **incremental, not a rewrite**. Existing pages stay; each page gains `mode` and `maxWidth` metadata. The header gets a new component. The sidebar becomes mode-aware. No URL changes, no breaking deep links.

**Why this is worth doing:** The current flat 34-tab SPA has hit the wall — users can't hold "where do I go for X" in their heads. Modes are the cognitive grouping layer the product is missing. More importantly, *mode becomes the context signal the agent should have been consuming all along.*

---

## 2. Current State (from exploration)

**Route model:** Tab-based SPA at `src/app/dashboard/*`, orchestrated by `src/components/dashboard/spa-shell.tsx` (34 tabs defined lines 52–85). URL = `/dashboard/[tab]`, navigation via `bb-navigate` custom event + sessionStorage key `bitbit-tab`.

**Layout hierarchy:**
- `spa-shell.tsx` — master layout. `<SidebarProvider>` → `<SidebarNav>` + `<SidebarInset>` → `<header>` with `<Topbar>` + `<main>` with `<KeepAliveTabPanel>`
- `sidebar-nav.tsx` (762 lines) — already has "contextual panels" (lines 201–334) that render per-tab. **This is the germ of mode-specific sidebars; we formalize it.**
- `topbar.tsx` — config-driven per tab via `topbar-configs.tsx`

**Width:** No global `max-w-*` wrapper. Each page sets its own. Chat uses `max-w-[85%]` on bubbles only. Invoice tab uses `p-6` local padding. Uniformity is absent — easy to introduce variation.

**Module registry:** `src/lib/modules/registry.ts` already groups modules into categories `home | messages | business | intelligence | operations | settings`. **These categories map ~80% to our 4 modes.**

**Design system:** Shadcn Nova preset, Tailwind 4 `@theme inline` in `globals.css`, DM Sans + Libre Baskerville, Tabler icons, themes `midnight` + `light` in `src/styles/theme-*.css`. **No Framer Motion — CSS animations only.** (Memory says `motion` is installed, but codebase uses CSS today. Verify before adding.)

**Gaps to fill:** No `mode` concept. No max-width container system. Sidebar items are a flat list (collapsible groups not wired). No ⌘+digit shortcuts.

---

## 3. UX Research Synthesis (6 principles applied)

From the research brief on Claude Desktop, Arc, Linear, Raycast, Superhuman, Notion, Things 3, Fantastical, Slack, Discord:

1. **Top mode switchers work when modes reframe the task, not just the scope.** Chat ≠ Inbox ≠ Money — these are genuinely different interaction models. Correct pattern for BitBit. ✅
2. **Color accents for pre-attentive recognition — but subtle, not Arc's full chrome repaint.** A 2px accent stripe + tab highlight is enough. Productivity apps need predictability.
3. **State persistence per mode is non-negotiable.** Fantastical's silent Calendar Set failure is the cautionary tale. Every mode remembers its last page, scroll, selection.
4. **Command palette is mode-agnostic (teleport); shortcuts are mode-specific (scope).** Cmd+K searches everywhere. ⌘1–⌘4 jump between modes. Dual-axis.
5. **Animate the width transition (300ms ease-out) so users *see* the layout change.** Also anchor chrome (sidebar width, topbar height) so only content moves.
6. **URL is source of truth.** Every page is deep-linkable. Mode is derived from the page's metadata — users never navigate to `/mode/foo`, they navigate to `/page` and the mode follows.

---

## 4. The 4 Modes

| Mode | Icon | Max Width | Sidebar Content | Pages | Keyboard |
|------|------|-----------|-----------------|-------|----------|
| **Chat** | 💬 | `720px` centered | Chat history (pinned + recent), saved prompts, "New chat" | chat | ⌘1 |
| **Inbox** | 📥 | `1040px` (with 360px list sidebar → main canvas ~680px) | Live scrollable list of messages + approvals; filters by source/status | inbox, approvals, channels | ⌘2 |
| **Work** | 🎯 | `1800px` fluid | Views: Today/This Week/Someday · Projects · Filters | tasks, leads, contacts, companies, meetings, tenders, workflows | ⌘3 |
| **Money** | 💰 | `1600px` | Quick filters (Drafts/Overdue/Paid), billing summary, revenue mini-chart | invoices, costs, billing, reports | ⌘4 |

**Monochrome accent (confirmed).** Single brand accent (emerald, existing) on the active tab as an underline + subtle background tint. No per-mode hues. Mode differentiated by icon + label + position. Stays faithful to the T038 monochrome overhaul.

**Why 4, not 5:** A 5th mode (Brain/Insights for knowledge + reports + analytics) was considered. Rejected because it dilutes the "what am I doing right now" clarity the 4 strong verbs provide (Chat, Triage, Execute, Transact). Reports live in Money. Knowledge is accessed via Cmd+K, not a mode.

**Why Settings is not a mode:** Settings is a destination you visit occasionally, not a working mode. Cog icon in the bottom-left of the sidebar (current pattern) stays. Opens a full-width `/dashboard/settings` view that visually "exits" the mode system (neutral chrome).

**Why not Personal/Org as modes:** Org switcher is orthogonal — it's *whose* data, not *what* you're doing with it. Stays in the sidebar header (current location).

---

## 5. Architecture Model: Mode-as-Lens (not mode-as-route)

**Chosen:** Each page declares its mode via metadata. The header mode switcher is a lens — it filters the sidebar to mode-relevant pages. Navigating to a page outside the current mode *auto-switches the mode* (respecting the user's click).

**Rejected alternatives:**
- **Mode-first routing** (`/dashboard/[mode]/[page]`) — breaks every deep link. Big blast radius for no UX gain.
- **Mode as URL param** (`?m=inbox`) — clunky, doesn't persist across reloads cleanly, can be omitted.

### Page metadata shape (additive change to `src/lib/modules/registry.ts`)

```ts
// new fields on ModuleConfig
{
  id: 'invoices',
  title: 'Invoices',
  mode: 'money',          // NEW: which mode this page belongs to
  maxWidth: '1600px',     // NEW: page's preferred max-width
  sidebarVariant: 'money',// NEW: which sidebar renderer to use
  // ...existing fields
}
```

### State model

```ts
// new file: src/lib/dashboard/mode-store.ts (zustand or simple context)
type Mode = 'chat' | 'inbox' | 'work' | 'money';

interface ModeState {
  active: Mode;
  perMode: {
    [M in Mode]: {
      lastTab: string;           // which page user was on in this mode
      scrollY: number;           // last scroll position
      sidebarSelection?: string; // selected inbox item, selected project, etc.
      drafts?: Record<string, unknown>; // unsaved state per mode
    }
  };
  switchMode: (next: Mode) => void;
  restoreFromMode: (mode: Mode) => void;
}
```

**Persistence:** `localStorage` key `bitbit-mode-state`, scoped by `userId`. Server sync optional (Phase 2).

**Mode derivation on page change:** When user clicks a page via sidebar or Cmd+K, `spa-shell` reads `pageMeta.mode` and calls `switchMode(pageMeta.mode)` automatically. Mode is never out-of-sync with current page.

---

## 6. ASCII Mockups

### Chat Mode (⌘1)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ░░ BitBit  [💬 Chat] [📥 Inbox] [🎯 Work] [💰 Money]    🔍⌘K  🔔  ▢ Tor │ ← header, 2px emerald underline under active tab (same accent all modes)
├─────────┬────────────────────────────────────────────────────────────────┤
│ Chats   │                                                                │
│         │                                                                │
│ ★ Pins  │                 ╔══════════════════════════════╗               │
│  ┌──── │                 ║                              ║               │ ← 720px centered chat column
│  │Plan │                 ║  BitBit: Good morning Tor,   ║               │
│  │Fin  │                 ║  you have 5 overdue items…   ║               │
│  │2026 │                 ║                              ║               │
│  └──── │                 ╚══════════════════════════════╝               │
│         │                                                                │
│ Recent  │                 ╔══════════════════════════════╗               │
│  Today  │                 ║  Tor: What should I focus on ║               │
│  ├ 10:2 │                 ║  first?                      ║               │
│  └ 09:1 │                 ╚══════════════════════════════╝               │
│  Yesterday│                                                              │
│  ├ 18:4 │                                                                │
│  └ 14:0 │                 ┌─────────────────────────────┐                │
│         │                 │ Ask BitBit anything…      ⏎ │                │ ← mode-aware placeholder (text-only)
│ + New   │                 └─────────────────────────────┘                │
│ chat    │                                                                │
└─────────┴────────────────────────────────────────────────────────────────┘
          ← sidebar 288px →  ← main 720px centered (no per-mode accent — monochrome) →
```

### Inbox Mode (⌘2) — the breakout UX win

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ░░ BitBit  [💬 Chat] [📥 Inbox •5] [🎯 Work] [💰 Money]  🔍⌘K  🔔  ▢ Tor│ ← emerald underline moves to Inbox + live badge •5
├─────────────────────┬────────────────────────────────────────────────────┤
│ Inbox               │ ┌────────────────────────────────────────────────┐ │
│ ┌─ All (12) ─┐      │ │ From: amatorri123@gmail.com                    │ │ ← 680px centered
│ │ Needs attn │ ← 5 │ │ Subject: Invoice #INV-284 overdue               │ │   message detail
│ │ Snoozed    │     │ │ Received: 2h ago  ·  📧 Email                   │ │
│ │ Sent       │     │ │─────────────────────────────────────────────────│ │
│ │ Spam       │     │ │                                                 │ │
│ └──────────────┘    │ │ Hi Tor, following up on INV-284…                │ │
│                      │ │                                                 │ │
│ ━━━━━━━━━━━━━━━━━━━━│ │ (message body)                                  │ │
│                      │ │                                                 │ │
│ ▉ amatorri123@…      │ │                                                 │ │
│  Invoice overdue  2h │ │─────────────────────────────────────────────────│ │
│  📧 Email     ● NEW │ │                                                 │ │
│                      │ │  [Reply] [Snooze] [Archive]   BitBit: Draft 3…│ │
│ ▉ +61 400 xxx xxx    │ └────────────────────────────────────────────────┘ │
│  Can we meet Fri? 4h│                                                      │
│  💬 iMessage        │                                                      │
│                      │                                                      │
│ ▉ Daniel Taleb       │                                                      │
│  [Approval needed]  │                                                      │
│  🔔 Approval   1d   │                                                      │
│                      │                                                      │
│ ▉ ... 9 more         │                                                      │
│                      │                                                      │
│ ✎ Compose            │                                                      │
└─────────────────────┴────────────────────────────────────────────────────┘
   ← sidebar 360px (scrollable list) → ← main 680px detail pane →
```

**This is the pattern Tor intuited correctly.** Sidebar is the inbox list. Main is the detail. Superhuman for omnichannel (Email + WhatsApp + iMessage + Approvals unified).

### Work Mode (⌘3)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ░░ BitBit  [💬 Chat] [📥 Inbox] [🎯 Work ⚡] [💰 Money]  🔍⌘K  🔔  ▢ Tor│ ← emerald underline on Work + ⚡ (meeting soon)
├─────────┬────────────────────────────────────────────────────────────────┤
│ Views   │  Tasks · Leads · Contacts · Meetings                           │ ← secondary nav (page tabs)
│         │ ┌────────────────────────────────────────────────────────────┐ │
│ Today   │ │ Today                                   ⚡ Meeting in 8min  │ │ ← fluid up to 1800px
│ (3)     │ │ ┌──────────────┬──────────────┬──────────────┬───────────┐ │ │
│ Upcoming│ │ │ TODO (4)     │ DOING (2)    │ BLOCKED (1)  │ DONE      │ │ │ ← Kanban, room to breathe
│ Someday │ │ │              │              │              │           │ │ │
│         │ │ │ ▪ Invoice    │ ▪ Contract…  │ ▪ Await Acme │ ▪ …       │ │ │
│ ━━━━━━  │ │ │ ▪ Follow-up  │ ▪ Dashboard  │              │ ▪ …       │ │ │
│ Projects│ │ │ ▪ Call Dan   │              │              │ ▪ …       │ │ │
│ ▸ BitBit│ │ │ ▪ Review PR  │              │              │           │ │ │
│ ▸ Apollo│ │ │              │              │              │           │ │ │
│ ▸ Home  │ │ └──────────────┴──────────────┴──────────────┴───────────┘ │ │
│         │ └────────────────────────────────────────────────────────────┘ │
│ ━━━━━━  │                                                                  │
│ Filters │                                                                  │
│ @me     │                                                                  │
│ Overdue │                                                                  │
│         │                                                                  │
│ + Task  │                                                                  │
└─────────┴────────────────────────────────────────────────────────────────┘
          ← sidebar 288px → ← main fluid up to 1800px →
```

### Money Mode (⌘4)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ░░ BitBit  [💬 Chat] [📥 Inbox] [🎯 Work] [💰 Money !2]  🔍⌘K  🔔  ▢ Tor│ ← emerald underline on Money + !2 (overdue badge)
├─────────┬────────────────────────────────────────────────────────────────┤
│ Money   │ Invoices · Costs · Billing · Reports                            │ ← page tabs
│         │ ┌────────────────────────────────────────────────────────────┐ │
│ Quick   │ │ Revenue this month       $12,480  ▲ 18% vs Mar              │ │
│ ▪ All   │ │ Outstanding                $3,290  (2 overdue)               │ │
│ ▪ Drafts│ │───────────────────────────────────────────────────────────── │ │ ← 1600px
│ ▪ Sent  │ │ Invoice    Client          Amount   Status      Due         │ │
│ ▪ Paid  │ │ INV-284    Acme Ltd        $1,200   OVERDUE     3d ago      │ │
│ ! Overdue││ INV-283    Maya             $800    SENT        5d           │ │
│         │ │ INV-282    Andy Taleb      $1,290   OVERDUE     1w ago      │ │
│ ━━━━━━  │ │ INV-281    Steve West       $650    PAID        —           │ │
│ Clients │ │ …                                                            │ │
│ ▸ Acme  │ └────────────────────────────────────────────────────────────┘ │
│ ▸ Maya  │                                                                  │
│ ▸ Andy  │                                                                  │
│ ▸ Steve │                                                                  │
│         │                                                                  │
│ ━━━━━━  │                                                                  │
│ Summary │                                                                  │
│ ▁▂▃▅▇▆▄ │ ← revenue sparkline                                            │
│         │                                                                  │
│ + Invoice│                                                                 │
└─────────┴────────────────────────────────────────────────────────────────┘
          ← sidebar 288px → ← main 1600px →
```

---

## 7. Interaction Design

### Keyboard shortcuts

| Keys | Action |
|------|--------|
| `⌘1` | Switch to Chat |
| `⌘2` | Switch to Inbox |
| `⌘3` | Switch to Work |
| `⌘4` | Switch to Money |
| `⌘K` | Command palette (mode-agnostic search + "Switch to X" always in top results) |
| `⌘B` | Toggle sidebar (existing Radix Sidebar shortcut, preserve) |
| `⌘,` | Settings |
| `⌘/` | Focus chat input from any mode |
| `j` / `k` | In Inbox mode sidebar: next/prev item |
| `Esc` | Clear mode-local selection / close detail pane |

### Transitions

- **Mode switch:** `max-width` animates 300ms `ease-out`. Sidebar content cross-fades 200ms. Active-tab underline slides horizontally to new mode (200ms). Total under 350ms.
- **Reduced motion:** Snap instantly. Use `@media (prefers-reduced-motion: reduce)` in CSS.
- **Sidebar scroll:** When mode changes and the new sidebar has different scroll, restore last scroll for that mode (from persisted state).

### Persistence

Per-mode state stored in `localStorage` under `bitbit-mode-state` as JSON:

```json
{
  "userId": "02ce2616-...",
  "active": "inbox",
  "perMode": {
    "chat": { "lastTab": "chat", "scrollY": 0, "sidebarSelection": null },
    "inbox": { "lastTab": "inbox", "scrollY": 420, "sidebarSelection": "msg_xyz" },
    "work":  { "lastTab": "tasks", "scrollY": 180, "sidebarSelection": null },
    "money": { "lastTab": "invoices", "scrollY": 0, "sidebarSelection": null }
  }
}
```

Writes debounced 500ms.

---

## 8. Visual Design

### New CSS tokens (add to `src/app/globals.css` @theme block)

Monochrome: one accent (existing brand emerald) across all modes. Mode is differentiated by **icon, label, active-tab underline position, and background tint of the active pill** — not hue.

```css
/* mode max-widths (main canvas per mode) */
--mode-maxw-chat:  720px;
--mode-maxw-inbox: 1040px;
--mode-maxw-work:  1800px;
--mode-maxw-money: 1600px;

/* mode sidebar widths (Inbox gets a wider sidebar for the list) */
--mode-sidebar-chat:  288px;
--mode-sidebar-inbox: 360px;
--mode-sidebar-work:  288px;
--mode-sidebar-money: 288px;

/* transition timing */
--mode-transition: 300ms cubic-bezier(0.2, 0, 0, 1);
```

Activate per-mode layout vars via `data-mode` on the root shell (CSS vars for width/sidebar-size only; colors stay monochrome):

```css
[data-mode="chat"]  { --active-maxw: var(--mode-maxw-chat);  --active-sidebar: var(--mode-sidebar-chat); }
[data-mode="inbox"] { --active-maxw: var(--mode-maxw-inbox); --active-sidebar: var(--mode-sidebar-inbox); }
[data-mode="work"]  { --active-maxw: var(--mode-maxw-work);  --active-sidebar: var(--mode-sidebar-work); }
[data-mode="money"] { --active-maxw: var(--mode-maxw-money); --active-sidebar: var(--mode-sidebar-money); }
```

**Active-mode indicator** (in `mode-switcher.tsx`): a single animated 2px underline that slides between tabs using FLIP (measure old position → translate → transition to 0). Uses the existing brand emerald token — NOT per-mode hues. Respect `prefers-reduced-motion`.

### Typography

No changes. DM Sans + Libre Baskerville stay. Mode pills in header use `DM Sans 500 14/20`.

### Component additions

- `src/components/dashboard/mode-switcher.tsx` — the header tab bar (4 mode buttons + sliding underline indicator + live badges)
- `src/components/dashboard/sidebar-variants/chat-history.tsx`
- `src/components/dashboard/sidebar-variants/inbox-list.tsx` — the breakout list component, virtualized
- `src/components/dashboard/sidebar-variants/work-views.tsx`
- `src/components/dashboard/sidebar-variants/money-filters.tsx`
- `src/lib/dashboard/mode-store.ts` — state + keyboard shortcut provider

---

## 9. Implementation Plan (file-by-file)

Grouped into 3 shippable PRs.

### PR 1 — Mode scaffolding (no content changes)

Goal: introduce the mode primitive without changing what any page looks like. Proves the wiring.

- **NEW** `src/lib/dashboard/mode-store.ts` — zustand store for mode + per-mode state
- **NEW** `src/components/dashboard/mode-switcher.tsx` — header pill bar with sliding emerald underline indicator
- **EDIT** `src/lib/modules/registry.ts` — add `mode`, `maxWidth`, `sidebarVariant` to existing `ModuleConfig`. Map all 34 existing tabs to a mode (bulk mapping in one commit)
- **EDIT** `src/components/dashboard/spa-shell.tsx` lines 406–495 — mount `ModeSwitcher` in header, add `data-mode` attribute on root shell, wire keyboard shortcuts
- **EDIT** `src/app/globals.css` — add mode width tokens, sidebar width tokens, transition tokens (no new color tokens — monochrome)
- **TEST** vitest: mode-store reducer tests (switch, persist, restore)

Ships dark. No visible UI change yet; mode is always `chat` and nothing renders differently.

### PR 2 — Per-mode sidebars + max-widths + animations

Goal: the visible refactor.

- **NEW** `src/components/dashboard/sidebar-variants/chat-history.tsx`
- **NEW** `src/components/dashboard/sidebar-variants/inbox-list.tsx` (virtualized with `@tanstack/react-virtual`, if not already installed)
- **NEW** `src/components/dashboard/sidebar-variants/work-views.tsx`
- **NEW** `src/components/dashboard/sidebar-variants/money-filters.tsx`
- **EDIT** `src/components/dashboard/sidebar-nav.tsx` (762 lines) — refactor to accept `variant` prop; extract current nav list as `DefaultSidebar` (fallback/legacy); render variant component per active mode
- **EDIT** `src/components/dashboard/spa-shell.tsx` — add max-width container around `<main>`, driven by `--active-maxw` CSS var, with `transition: max-width var(--mode-transition)`
- **EDIT** `src/components/dashboard/topbar.tsx` — show mode-aware breadcrumb prefix (e.g., "Inbox · All items")
- **TEST** Playwright: mode switch preserves scroll, switches maxwidth, ⌘2 activates Inbox

### PR 3 — Agent integration (the 10x layer)

Goal: wire mode into the agent runtime as a context signal.

- **EDIT** `src/lib/agent/context-builder.ts` (or equivalent) — inject `currentMode` into agent system prompt
- **EDIT** `src/lib/agent/mode-personas.ts` (NEW) — per-mode system prompt fragments + tone + retrieval biases
- **EDIT** response-card schema — support `targetMode` field for "auto-switch on click"
- **EDIT** Cmd+K palette — scope current mode first, Tab to broaden, top-N always includes "Switch to X" actions
- **EDIT** `src/components/chat/chat-input.tsx` — mode-aware placeholder
- **TEST** vitest: mode persona injection, response-card teleport

### Deferred (Phase 2)

- Per-mode autonomy levels (schema + settings UI)
- Server-side sync of per-mode state (cross-device)
- User-customizable modes
- Menu-bar widget

---

## 10. Migration Path

- **Week 1:** PR 1 (scaffolding, behind-the-scenes)
- **Week 2:** PR 2 (visible UX shift) — announce to beta users with release notes; add a one-time tooltip on first load: *"New: press ⌘1–⌘4 to switch modes"*
- **Week 3:** PR 3 (agent integration) — silent upgrade; users notice responses feeling "more relevant."
- **Week 4:** measure — mode-switch frequency per user, time spent per mode, Cmd+K usage. Adjust mode defaults based on actual behavior.

### Rollback strategy

Mode switcher is feature-flagged via env var `BITBIT_DASHBOARD_MODES=1` (falsy = legacy flat nav). Each PR preserves the legacy shell path. If any PR ships bad, flip the flag.

### Risk register

| Risk | Mitigation |
|------|------------|
| Users disoriented by new structure | Tooltip on first load, ⌘K surfaces mode switching, legacy flat nav available via setting |
| Inbox-as-sidebar list performance on large inboxes | Virtualize (`@tanstack/react-virtual`), paginate server-side |
| Deep links break | URL unchanged — no breakage. Sidebar uses mode-inference from current page |
| Accessibility regression | A11y audit: mode switcher has ARIA tabs, ⌘1–⌘4 announced, monochrome design means color is never a signal (icon + label + underline position + background tint carry it) |
| Mobile is different beast | Mobile keeps current bottom-nav pattern initially; modes-on-mobile is Phase 2. Don't conflate. |

---

## 11. Decisions (confirmed 2026-04-23)

**Mode count:** 4. Chat, Inbox, Work, Money.
**Mode names:** Chat / Inbox / Work / Money (nouns — familiar, scannable, best for new-user discoverability).
**Accent strategy:** **Monochrome.** Single brand accent (existing emerald) on the active tab as a sliding underline + subtle background tint. No per-mode hues. Respects the T038 monochrome design overhaul.
**Width strategy:** Per-mode `max-width` on main canvas, animated on switch (300ms ease-out, snaps with `prefers-reduced-motion`).
**Routing:** Keep current URL shape. Mode is derived from page metadata, not URL structure. No broken deep links.
**Inbox pattern:** Sidebar-is-the-list — unified omnichannel triage (Email + WhatsApp + iMessage + Approvals).
**Agent integration:** Ships with the visual refactor (PR 3). Mode becomes a first-class context primitive the agent consumes for persona, retrieval, tools, and placeholder text.
**Shipping scope:** Full 3-PR plan over 3 weeks. Scaffolding → all 4 modes visible → agent integration.

---

## Appendix A — 10x moves this refactor unlocks

See companion doc: `.claude/docs/ai/dashboard-mode-switcher/10x/session-1.md`

Headlines:
- Mode as agent persona (context-aware retrieval, tools, tone)
- Mode badges as live glance-dashboard
- Auto-mode teleport from agent response cards
- Per-mode autonomy levels (graduated trust)
- Mode-scoped Cmd+K (cognitive proximity)
- Mode-tinted agent responses (visual context confirmation)

## Appendix B — Files touched (full list)

**New:**
- `src/lib/dashboard/mode-store.ts`
- `src/lib/dashboard/mode-personas.ts`
- `src/components/dashboard/mode-switcher.tsx`
- `src/components/dashboard/mode-accent-stripe.tsx`
- `src/components/dashboard/sidebar-variants/chat-history.tsx`
- `src/components/dashboard/sidebar-variants/inbox-list.tsx`
- `src/components/dashboard/sidebar-variants/work-views.tsx`
- `src/components/dashboard/sidebar-variants/money-filters.tsx`

**Edited:**
- `src/lib/modules/registry.ts`
- `src/components/dashboard/spa-shell.tsx`
- `src/components/dashboard/sidebar-nav.tsx`
- `src/components/dashboard/topbar.tsx`
- `src/components/dashboard/topbar-configs.tsx`
- `src/components/chat/chat-input.tsx`
- `src/app/globals.css`
- agent context-builder (location TBD — to locate in PR 3)

**Deleted:** none. Nothing ripped out. Current sidebar context-panel code (`sidebar-nav.tsx:201-334`) becomes the input for variant extraction; not discarded.
