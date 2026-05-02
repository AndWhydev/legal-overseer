# 10x Analysis: Dashboard Mode Switcher

Session 1 | Date: 2026-04-23

## Current Value

BitBit's current dashboard is a flat 34-tab SPA shell. Every page is roughly equal-width, the sidebar shows the same nav tree regardless of what the user is doing, and context panels adapt per-tab but within a fixed chrome. Users today must mentally translate "I want to triage my messages" or "I want to check on invoices" into "click tab 7" or "click tab 12." The sidebar is a wayfinding tool, not a working surface.

The product-shaped ask is a header mode switcher (Chat / Inbox / Work / Money) with per-mode sidebar content and per-mode page width. This is 80% correct. But a mode switcher as *only* a UX reshuffle leaves 10x on the table.

## The Question

**What does a mode system unlock that pages alone can't?**

Answer: a **context-aware agent runtime**. Mode is not just a layout hint — it's a semantic signal the agent can consume. Once BitBit knows the user is "in Money mode," its retrieval, its proactive suggestions, its tool use, its tone, and its surfaced cards all re-target. The dashboard refactor becomes the user-visible tip of a deeper shift: *BitBit's brain operates in modes, and the UI finally matches*.

---

## Massive Opportunities

### 1. Mode as Agent Persona (agent-context feedback loop)

**What**: The active mode is injected into every agent call as a context signal. Chat mode → conversational, reflective. Inbox mode → triage-aggressive, decision-suggesting. Work mode → execution-focused, timebox-aware. Money mode → numeric, cash-flow-first. Same question ("what should I focus on?") returns materially different answers by mode.

**Why 10x**: Collapses the "please specify what you want" friction. The user's mode choice is already a disambiguation signal — use it. No agent app is doing this coherently today; Claude/ChatGPT have "projects" but those are scope-only, not persona-shifting. BitBit already has the Living Brain architecture (Phase 44/45) — modes become addressable sub-brains.

**Unlocks**: Mode-tuned system prompts, mode-weighted retrieval priors (in Money mode, bias Pinecone toward `invoice|payment|cost` namespaces), mode-scoped tool permissions (Money mode unlocks "draft invoice" tool, Inbox unlocks "triage reply" tool). Mode becomes a RAG filter.

**Effort**: Medium (agent-side) + Low (UI reads current mode from store)

**Risk**: Over-specialization; user in Chat mode asking about an invoice gets a worse answer. Mitigation: mode is a *prior*, not a wall. Agent can always cross-mode.

**Score**: 🔥 Must do

---

### 2. Mode Badge as Live Heartbeat (dashboard-in-a-tab)

**What**: Each mode tab in the header carries a live count/signal badge. Inbox `5` = 5 items need attention. Money `!2` = 2 overdue invoices. Work `⚡` = meeting starting in 10min. Chat is clean (no unread concept). Badges are driven by the same server signals that power notifications but rendered in the persistent chrome.

**Why 10x**: The header becomes a passive-awareness layer. A user can glance at BitBit for 200ms and know where their attention is needed — without opening a single view. This is what Superhuman does with its inbox split counts, what Linear does with its "My Issues" badge, but at *mode* level — a higher-altitude signal.

**Unlocks**: Ambient awareness. A user who docks BitBit in a side window gets a live status bar without interaction. Makes the app glanceable, which is a multiplier on "do I even need to open it right now?"

**Effort**: Medium — needs per-mode count queries (already exist for most via badge configs in `sidebar-nav.tsx:145`)

**Score**: 🔥 Must do

---

### 3. Auto-Mode Teleport from Agent Actions

**What**: When BitBit replies "I've drafted an invoice for you, want to review?" → clicking that card *auto-switches to Money mode* with the draft preloaded. Same for "I've queued 3 tasks from that meeting" → auto-jumps to Work with tasks highlighted. The agent orchestrates mode; the UI follows.

**Why 10x**: Invisible teleportation. The user never has to think "which mode does this live in?" — BitBit moves them there. This is what makes mode a runtime primitive, not just a nav primitive. Competitors with flat UIs can't do this because they have no modes to teleport between.

**Unlocks**: Chat mode becomes a universal launcher — "Draft invoice for Acme" in Chat → mode flips to Money mid-response, invoice renders in main canvas. Conversational deep-linking.

**Effort**: Medium — requires mode-transition API callable from agent response cards

**Score**: 🔥 Must do

---

### 4. Per-Mode Autonomy Levels

**What**: Per-user autonomy (Observer / Co-pilot / Autopilot) is already a concept (memory: v1.3 Agent Roles & Autonomy Engine). Extend it to per-mode. A user can be **Autopilot in Inbox** (let BitBit triage and auto-reply low-stakes) but **Co-pilot in Money** (BitBit drafts, user approves). Same brain, different hands per context.

**Why 10x**: Autonomy is trust, and trust is domain-specific. Nobody wants blanket "full autonomy." Per-mode autonomy maps to how humans actually delegate — "you handle my email, I handle the money." Makes the product safely trustable.

**Unlocks**: Graduated trust. Users start Observer everywhere, get comfortable, upgrade Inbox to Autopilot, leave Money in Co-pilot for years. Creates a long-tail engagement curve where the product keeps gaining trust-ground over years.

**Effort**: Medium — schema change + settings UI + autonomy-enforcement points per mode's tools

**Score**: 🔥 Must do

---

## Medium Opportunities

### 5. Inbox-as-Sidebar (the pattern the user intuited)

**What**: In Inbox mode, the left sidebar *is* the inbox list — scrollable, filterable, keyboard-navigable (j/k). The main canvas is the selected item's detail. Superhuman for omnichannel (Email + WhatsApp + iMessage + Approvals, unified).

**Why 10x**: No one has shipped a truly unified omnichannel triage surface. BitBit already ingests all these channels; the sidebar-as-list pattern is what lets that unification actually *feel* good. Main canvas gets its ~720px reading width for the selected message/thread.

**Impact**: Power-user retention hook. Triagers don't want a second app after they try this.

**Effort**: Medium — new InboxSidebar component, list virtualization (react-virtual), keyboard bindings

**Score**: 🔥 Must do

---

### 6. Mode-Scoped Cmd+K

**What**: Cmd+K opens a palette. Default scope = current mode (searches Money items if you're in Money). Press Tab or `>` to broaden scope to global. Always includes "Switch to Mode X" as top results.

**Why powerful**: Respects the cognitive proximity of the user's current focus. Search for "Acme" in Money = finds Acme invoices. Same query globally = finds Acme conversations, tasks, contacts, invoices. Two-level search without two palettes.

**Impact**: Power-user retention, keyboard-first muscle memory, accessibility win.

**Effort**: Medium — Cmd+K exists likely, needs mode-scoping layer + scope toggle

**Score**: 🔥 Must do

---

### 7. Mode-Tinted Agent Responses

**What**: When the agent responds in a given mode, the response card has a subtle 1px left border and icon in the mode's accent color. Visual confirmation the agent "heard you in Money mode."

**Why powerful**: Makes mode-as-context tangible. User sees the agent operating in their frame. Also makes transcript history readable at a glance — "that was a Work answer, that was a Money answer."

**Impact**: Trust signal + skimmability

**Effort**: Low — tokenized accent colors already feasible in Tailwind 4 `@theme`

**Score**: 👍 Strong

---

### 8. Mode-Remembered Everything

**What**: Per-mode persisted state: last active sub-page, scroll position, sidebar expansion state, selected item, unsaved drafts. Switching modes and back preserves everything. Keyed by `(userId, mode)` in localStorage + server for cross-device.

**Why powerful**: Eliminates the "where was I?" tax on mode switching. Research shows state loss is the #1 mode-confusion failure mode.

**Impact**: Invisible but felt. Switches become free.

**Effort**: Medium — unified state shape, localStorage persistence layer, selective server sync

**Score**: 🔥 Must do

---

## Small Gems

### 9. Mode Keyboard Shortcuts (⌘1–⌘4)

**What**: Persistent, unreassignable. ⌘1 Chat, ⌘2 Inbox, ⌘3 Work, ⌘4 Money.

**Why powerful**: 200ms switch time vs. ~1.5s mouse. For a daily tool, that compounds. Muscle memory sticks in a week.

**Effort**: Low — one keyboard hook

**Score**: 🔥 Must do

---

### 10. Mode Animation Tells You What Changed

**What**: On mode switch, animate the max-width (300ms ease-out) so the user sees the canvas physically resize. Sidebar content cross-fades (200ms). The *motion itself* is confirmation.

**Why powerful**: No "is this the same page?" confusion. Eliminates the silent-mode-switch failure mode that hurt Fantastical Calendar Sets.

**Effort**: Low — `transition: max-width 300ms ease-out` + `motion-safe` guards

**Score**: 🔥 Must do

---

### 11. "You Are Here" Top Accent Stripe

**What**: A 2px stripe at the very top of the page body in the active mode's accent color. Persistent while in that mode.

**Why powerful**: Pre-attentive recognition. User's peripheral vision knows the mode without reading the tab label. Arc's whole-chrome repaint is too aggressive; a stripe is the minimal viable signal.

**Effort**: Very Low — one CSS var swap per mode

**Score**: 🔥 Must do

---

### 12. Empty-State as Onboarding

**What**: Inbox mode with zero connections shows "Connect a channel to start triaging" with one-click add. Money mode empty = "Import your first invoice or let BitBit draft one." Mode-contextual onboarding, no separate flow.

**Why powerful**: Reduces "what do I do here" moments to zero. Each mode teaches itself.

**Effort**: Low — per-mode empty state components

**Score**: 👍 Strong

---

### 13. Mode Indicator in Chat Input Placeholder

**What**: Chat input placeholder changes by mode. Chat: "Ask BitBit anything." Inbox: "Ask about your messages." Money: "Ask about your money." Work: "Ask about your work." Persistent chat surface, mode-aware hint.

**Why powerful**: Tiny nudge that reminds users of the agent's contextual lens. Reinforces #1 above.

**Effort**: Very Low — one string map

**Score**: 👍 Strong

---

### 14. Mode Switcher = Status Widget in Menu Bar (future)

**What**: macOS/Windows menu bar widget that shows the 4 mode badges. Click a mode → deep-links into the desktop app (if installed) or opens web.

**Why powerful**: Extends BitBit's presence into the OS layer. You never have to open the app to know if something needs attention.

**Effort**: Very High — native app or Tauri wrapper. Deferred.

**Score**: 🤔 Maybe (future)

---

## Recommended Priority

### Do Now (ships with the mode refactor)
1. **Mode keyboard shortcuts** (⌘1–⌘4) — table stakes, 30 lines of code
2. **Max-width animation + accent stripe** — the UI signals of mode
3. **Per-mode state persistence** — the UX that makes switching painless
4. **Mode live-heartbeat badges** — the glance-value layer
5. **Inbox-as-sidebar** — the breakout UX win (user intuited this correctly)

### Do Next (shipped in the 2 weeks after)
6. **Mode as agent persona** — wire mode into agent context; mode-specific system prompts
7. **Auto-mode teleport from agent actions** — agent cards can carry `targetMode` directive
8. **Mode-scoped Cmd+K** — respects cognitive proximity
9. **Mode-tinted agent responses** — visual confirmation of context carry

### Explore (strategic bets, 1-3 month horizon)
10. **Per-mode autonomy levels** — schema change + settings UI; trust ratcheting
11. **Mode-weighted RAG retrieval** — Pinecone namespace priors by mode
12. **Mode-scoped tool permissions** — security + context-appropriate tools

### Backlog (good but not now)
13. **User-remixable modes** — custom mode creation for power users
14. **Menu bar widget** — native app territory
15. **Shared mode-state links** — `?mode=inbox&item=xyz` for support/pair work

---

## Why This Is 10x, Not Just a Facelift

A mode switcher that *only* changes layout is a UX polish — maybe 1.5x better ergonomics. The 10x move is making mode a **first-class runtime primitive** that:

1. The **agent consumes** as a context signal (persona + retrieval + tools)
2. The **UI renders** as layout + sidebar + width
3. The **notification system** targets (mode-scoped badges)
4. The **trust system** respects (per-mode autonomy)
5. The **command palette** scopes to
6. The **onboarding flow** uses for contextual teaching

Same primitive, 6 product surfaces getting smarter. That's the compounding move. The mode switcher isn't a feature — it's the handle that lets the whole assistant finally become context-aware at the user's level of intent.

---

## Questions

### Answered
- **Q**: Is "mode" just nav, or something deeper? **A**: It's a context primitive the agent should consume. UI is the surface-level manifestation.
- **Q**: Should we do all 4 modes at once or phase? **A**: Phase. Ship Chat + Inbox first (the two modes with clearest UX wins). Work + Money follow.

### Blockers (need user input)
- **Q**: Accept mode names as Chat / Inbox / Work / Money, or prefer different (e.g., Chat / Triage / Do / Books)?
- **Q**: Accept mode count = 4, or add a 5th (Brain/Insights for knowledge + reports)?
- **Q**: Accept Settings remains a cog icon (not a mode)?
- **Q**: Per-mode accent palette — confirm the 4-color scheme (emerald / amber / indigo / teal) or prefer single-accent monochrome?

## Next Steps

- [ ] Present mode design to user with ASCII mockups
- [ ] Confirm mode names, count, and color scheme
- [ ] Kick off implementation plan (see `.planning/dashboard-mode-refactor.md`)
- [ ] First PR: mode switcher scaffolding + ⌘1–⌘4 shortcuts + accent stripe (scaffolding only, no content changes)
- [ ] Second PR: Chat mode width + Inbox mode split-pane
