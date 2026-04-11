# Inbox Intelligence Split — Design Spec

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Add binary "Inbox | Other" segmented control to the existing inbox tab, using pre-computed enrichment data to separate relevant messages from noise.

## Problem

The inbox renders all messages in a flat, visually uniform list. Newsletters, payment receipts, automated notifications, and genuine client requests all look identical. The enrichment pipeline already classifies every message at ingest time (category, urgency score, contact matching, action items), but the UI doesn't use this intelligence to separate signal from noise.

## Solution

A binary split inside the existing inbox tab — **Inbox** (relevant) and **Other** (noise) — controlled by a segmented pill in the toolbar. No new routes, no new API calls, no new tabs in the SPA shell. Just smarter filtering of data that already exists on every message.

## Research

Competitive analysis of 6 products (Gmail, Superhuman, Hey.com, Shortwave, Apple Mail, Outlook):

- **Binary split is the dominant pattern.** Shortwave, Outlook, and Superhuman all use two-bucket models (Important/Other or Focused/Other). Simpler than Gmail's 5 tabs, less build than Hey's 3 screens.
- **Inline AI summaries are consensus.** Superhuman, Shortwave, Apple Mail, and Hey show AI summaries directly in the message row. BitBit already does this (`aiSummary || bodyPreview` in MessageRow).
- **Sender recognition is the #1 triage signal.** Eye-tracking research confirms users look at sender first. Known contact = important is the strongest heuristic.

## Design

### Segmented Control

- **Location:** Inside the existing toolbar bar, right-aligned where `{displayed.length} messages` currently sits.
- **Style:** Pill-style segmented control with two options: `Inbox` (default, active) and `Other`.
- **Behavior:** Clicking switches the active filter applied to the message list. Defaults to `Inbox` on mount.
- **No badge count on Other.** The whole point is to not pull attention there.

### Filtering Heuristic

Uses existing fields from the ingest-time enrichment pipeline (`ingest-enrichment.ts` + `urgency-scorer.ts`). Zero additional API calls.

**Inbox** — messages that are relevant to the user:
- `enrichment_category` in `['billing', 'client_request', 'project_update', 'personal']`
- OR sender matches a known contact (`contactId !== null`)
- OR `urgency_score > 0.3`
- OR `threadStatus === 'waiting_on_you'`
- OR message has detected `action_items` (length > 0)

**Other** — everything else:
- Typically: `newsletter`, `notification`, `automated` categories from unknown senders with low urgency
- Existing `DEFAULT_FILTER` still applies — spam and marketing are hidden from both views

**Edge cases:**
- A newsletter from a known contact → goes to **Inbox** (contactId match overrides category)
- An automated Stripe payment notification → goes to **Other** unless urgency > 0.3 (payment failures trigger high urgency via the financial dimension scorer)
- A first-time unknown sender with action items → goes to **Inbox** (action_items override)

### Component Changes (`inbox-tab.tsx`)

**New state:**
```typescript
const [activeView, setActiveView] = useState<'inbox' | 'other'>('inbox');
```

**Filter function:**
```typescript
function isRelevantMessage(m: InboxMessage): boolean {
  const relevantCategories = ['billing', 'client_request', 'project_update', 'personal'];
  if (relevantCategories.includes(m.category)) return true;
  if (m.contactId) return true;
  if (m.significance > 3) return true; // maps to urgency_score > 0.3
  if (m.threadStatus === 'waiting_on_you') return true;
  // action_items not currently on InboxMessage — would need to be surfaced from metadata
  return false;
}
```

**Updated `displayed` memo:**
```typescript
const displayed = useMemo(() => {
  return messages.filter(m => {
    if (snoozedIds.has(m.id)) return false;
    if (!DEFAULT_FILTER(m)) return false;
    // Apply intelligence split
    const relevant = isRelevantMessage(m);
    if (activeView === 'inbox' && !relevant) return false;
    if (activeView === 'other' && relevant) return false;
    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const haystack = [m.senderName, m.senderEmail, m.subject, m.bodyPreview, m.aiSummary]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}, [messages, snoozedIds, searchQuery, activeView]);
```

**Segmented control in toolbar:**
Replaces the `{displayed.length} messages` span with a pill-style segmented control. Uses existing Tailwind/Radix patterns from the codebase.

### What Doesn't Change

- Message row layout (checkbox, channel icon, subject/sender, AI summary preview, timestamp)
- Search bar position and behavior
- Bulk action toolbar (checkbox, archive, flag, done, snooze, delete)
- Keyboard shortcuts (all operate on whichever view is active)
- Drawer behavior and thread display
- Notification grouping logic (Apple Intelligence-style groups still apply within each view)
- Realtime subscription for new messages
- Pagination (load more)

### Seed Data

The existing `SEED_MESSAGES` array already has varied categories and priorities. The split should naturally separate:
- **Inbox:** Sarah Chen (client_request), Andy Wu (action_required), Tom Bradley (fyi from known contact), Jess Reilly (conversation from known contact)
- **Other:** Asana notification (automated), Stripe receipt (automated, low urgency), Calendly booking (automated), LinkedIn notification (marketing — already filtered by DEFAULT_FILTER)

## Future Considerations

- **User corrections:** Allow dragging/moving messages between Inbox and Other to train per-user preferences (not in this build)
- **Hey-style Screener:** Gate unknown first-time senders before they reach either view (future phase)
- **Three-bucket evolution:** Split "Other" into "Feed" (newsletters) and "Paper Trail" (receipts) if the binary split proves too coarse

## Known Issues (Separate Tasks)

- Gmail body truncation — only preview text coming through (#9)
- Channel source icons not mapping correctly to logos (#10)
