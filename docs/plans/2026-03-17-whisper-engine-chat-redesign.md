# Whisper Engine & Chat Redesign

**Date:** 2026-03-17
**Status:** Approved design — ready for implementation

---

## Product Decision

BitBit eliminates conversation history as a user-facing feature. The chat becomes a single, always-fresh interface. Users don't browse past conversations — they just talk to BitBit, and it remembers. Conversation history is a crutch for weak AI memory. BitBit's context pipeline, RAG layer, and Total Recall architecture make it unnecessary.

**Core principle:** The conversation UI is ephemeral. The knowledge is permanent.

### Why no history?

Every reason a user would look back at a conversation is handled natively:

1. **"What did we decide?"** — Ask BitBit. It remembers.
2. **"What happened with X?"** — Ask BitBit. It knows.
3. **"Show me that thing you made"** — Artifacts live on their native pages (invoices, leads, contacts).
4. **"Pick up where we left off"** — BitBit's context is continuous. Just start talking.

---

## The Whisper Engine

When the user opens the chat tab, BitBit surfaces 2-3 contextual "whispers" — short, ambient thoughts about the most important things right now. Not a dashboard. Not notifications. Thoughts materializing beneath the avatar.

The feel: like walking into a room where your assistant glances up and says "Oh — before you ask, Steve still hasn't replied and that invoice is due today."

### Pre-Session Visual Spec

Layout (vertically centered in viewport, top to bottom):

1. **BitBit face avatar** — 120px, breathing animation, cursor-tracking eyes
2. **Greeting** — "Good morning" / "Good afternoon" / "Good evening" — 38px, weight 500, Inter
3. **Whitespace** — 32px gap
4. **Whispers** — 0-3 lines of text:
   - Font size: 14px
   - Weight: 400
   - Color: `var(--text-secondary, #94A3B8)`
   - Line height: 28px between whispers
   - Max width: 340px, center-aligned
   - Text align: center

No suggestion chips. If zero whispers, nothing appears below the greeting. Silence is the design.

### Whisper Animation

- **Enter:** Each whisper fades in and floats up 8px, staggered 200ms apart. Easing: `[0.25, 1, 0.5, 1]`
- **Exit (on type or tap):** All whispers fade out together over 150ms with 4px downward drift

### Whisper Interaction

**Tap a whisper:** The text becomes the user's first message. The whisper's `context` payload is sent as hidden metadata to the API — BitBit responds immediately with full context. No re-fetching.

**Type instead:** Whispers fade out on input focus or first character. Discarded. Normal pipeline handles the message.

**Zero whispers:** Avatar and greeting only. User types when ready.

---

## Whisper Engine Architecture

### Core Interface

```typescript
interface Whisper {
  text: string
  score: number
  source: string
  context: Record<string, unknown>
}

async function generateWhispers(
  supabase: SupabaseClient,
  userId: string,
  orgId: string,
): Promise<Whisper[]>
```

### Signal Sources

Six independent async functions, run in parallel via `Promise.allSettled`:

| Source | What it detects | Example whisper |
|--------|----------------|-----------------|
| `whisperStaleContacts` | People who haven't replied beyond typical window | "Steve West hasn't replied in 3 days" |
| `whisperDueItems` | Invoices, tasks, follow-ups with deadlines | "Maya's invoice is 2 days overdue" |
| `whisperUnfinishedMomentum` | Last conversation topic left unresolved | "You were working on the tender yesterday" |
| `whisperCalendarAwareness` | Upcoming meetings, prep needed | "Meeting with Steve in 20 minutes" |
| `whisperAnomalies` | Error spikes, unexpected events, leads going cold | "Unusual spike in checkout errors" |
| `whisperProactiveCompletions` | Things BitBit did autonomously | "I sent that follow-up to Maya" |

### Scoring Dimensions

Each dimension scores 0-1, multiplied together for composite:

- **Urgency** — Time-sensitivity. Overdue invoice: 0.9. Contact 1 day slow: 0.4.
- **Staleness** — Has this whisper been shown recently? Decay by 0.4x if shown in last 24h.
- **User relevance** — Interaction frequency and recency. Hot lead outranks archived contact.
- **Actionability** — Can the user act on it now? Time-of-day aware.

### Selection Rules

1. Sort by composite score descending
2. Enforce diversity — no two whispers from the same signal source
3. Minimum threshold — nothing below 0.3 score. Some days: zero whispers.
4. Maximum 3 — a good assistant triages, doesn't dump

### Staleness Tracking

```sql
create table whisper_impressions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  org_id uuid not null,
  source text not null,
  entity_key text not null,
  shown_at timestamptz not null default now()
);
```

Row inserted when whispers render. Queried during scoring. Auto-prune rows older than 7 days.

### API Route

```
GET /api/whispers
```

Called on chat tab mount. Returns `{ whispers: Whisper[] }`. No LLM calls — database queries and scoring arithmetic only. Target: under 500ms.

### Text Templates

No LLM for whisper text. Templated but natural:

- `"{name} hasn't replied in {n} days"`
- `"{item} is due today"` / `"{item} is {n} days overdue"`
- `"You were working on {topic} yesterday"`
- `"Meeting with {name} in {n} minutes"`
- `"I sent that follow-up to {name}"`

Short, plain, human. No exclamation marks, no urgency language.

---

## Chat Tab Lifecycle

1. **Mount** — Whisper Engine runs. Pre-session state renders: avatar, greeting, whispers fade in staggered
2. **User taps whisper or types** — Whispers dissolve, conversation begins. BitBit's first response is fully context-loaded
3. **User navigates away** — Conversation state held in memory for the session. Coming back to chat tab: conversation still there
4. **User closes app or refreshes** — Conversation is gone. Next visit starts fresh with new whispers. Memory persists in RAG layer, not chat history
5. **Messages still stored server-side** — Not for user browsing. For BitBit's memory pipeline to ingest, embed, and learn from

---

## Removal Scope

### Components to delete
- `conversation-drawer.tsx` — entire file
- Archive button in `chat-interface.tsx`
- All `.bb-chat__drawer-*` and `.bb-chat__history-btn` CSS rules

### State to remove from `chat-interface.tsx`
- `drawerOpen` / `conversationThreads` / `threadsLoading` state
- `fetchThreads` / `handleSelectThread` callbacks
- `AnimatePresence` block wrapping `ConversationDrawer`
- Thread ID localStorage persistence (`THREAD_STORAGE_KEY`)
- Thread history restore `useEffect` on mount
- `SUGGESTIONS` constant (replaced by whispers)

### What stays
- `threadId` state — needed for current session API continuity
- `handleNewConversation` logic — repurposed for fresh start on mount
- Server-side message storage — BitBit's memory pipeline still ingests them
- `/api/conversations/list` and `/api/agent/chat/history` — kept for internal/admin use, no longer called from UI

---

## Implementation Order

1. Build Whisper Engine backend (`lib/whispers/`) — signal sources, scoring, API route
2. Create `whisper_impressions` migration
3. Build whisper UI component — the pre-session whisper display with animations
4. Wire into `chat-interface.tsx` — replace suggestion chips, add whisper tap/dismiss behavior
5. Remove conversation drawer — component, CSS, state, localStorage
6. Remove suggestion chips
