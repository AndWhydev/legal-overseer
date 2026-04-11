# BitBit Unified Inbox Redesign — Product Design Document

**Version**: 1.0
**Date**: 2026-03-13
**Status**: Ready for implementation
**Scope**: Full inbox overhaul across 4 phases

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Information Architecture](#2-information-architecture)
3. [Card/Row Design Specification](#3-cardrow-design-specification)
4. [Email Reading Experience](#4-email-reading-experience)
5. [Action System](#5-action-system)
6. [Triage Pipeline Enhancement](#6-triage-pipeline-enhancement)
7. [Notification Fix](#7-notification-fix)
8. [Sidebar Cleanup](#8-sidebar-cleanup)
9. [Agent Email Access](#9-agent-email-access)
10. [Implementation Phases](#10-implementation-phases)

---

## 1. Design Philosophy

### Core Principles

1. **Agentic-first, not email-first.** BitBit is an AI operations platform. The inbox is one view into a unified message stream across email, WhatsApp, SMS, Slack, and service notifications. Every design decision should reinforce that messages are raw material for the AI agent to act on, not just items for the user to manually process.

2. **Zero-effort triage.** The system should classify, prioritize, and surface what matters without the user lifting a finger. Manual triage is a fallback, not the default. Inspired by Shortwave's AI bundles and Hey.com's Screener, but fully automated rather than rule-based.

3. **Progressive disclosure.** Show the minimum information needed at each level: category counts at the top, sender + subject + preview in the row, full content in the drawer. Never force the user to open a message to determine if it matters.

4. **Keyboard-native, touch-capable.** Power users navigate entirely by keyboard (Superhuman model). Mobile users swipe to triage (Triage app model). Both paths are first-class.

5. **Entity-aware, not message-aware.** Messages are organized around people and relationships, not folders or labels. A message from a client with an overdue invoice should look and feel different from a newsletter, even before the user opens it.

### Competitive Positioning

BitBit is NOT competing with Gmail, Outlook, or Hey as an email client. It competes with the *combination* of email client + CRM + project management + AI assistant. The inbox is a unified operations feed where:

- Email sits alongside WhatsApp and SMS conversations
- Service notifications (Stripe, Asana, Calendly) are first-class citizens with structured data extraction
- The AI agent can read, summarize, draft replies, and create tasks from any message
- Contact intelligence enriches every message row with relationship context

Key differentiators vs. pure email clients:
- **vs. Superhuman**: Multi-channel, AI triage is automatic not manual, entity graph integration
- **vs. Hey.com**: No manual Screener setup, AI handles sender classification automatically
- **vs. Spark**: Not just email categories, but cross-channel unified stream with structured data extraction
- **vs. Front/Missive**: Personal-first (not team-first), agentic automation replaces manual assignment

---

## 2. Information Architecture

### 2.1 Category Taxonomy

Four core categories, inspired by Apple Mail's proven model but enhanced with AI classification:

| Category | Internal Name | What Goes Here | Badge? | Color Token |
|----------|--------------|----------------|--------|-------------|
| **Priority** | `priority` | Messages from known contacts that need a response or action. Includes client emails, team messages, messages with questions/deadlines/requests. | Yes | `--bb-purple` |
| **Updates** | `updates` | Status changes, FYI messages, confirmations. "Waiting on them" threads. Stripe payments, Calendly bookings, shipping notifications. No action required but worth knowing about. | No | `--bb-blue` |
| **Feed** | `feed` | Newsletters, marketing emails, social notifications, product updates. Read when bored, archive in bulk. | No | `--bb-green` |
| **Receipts** | `receipts` | Transactional emails: order confirmations, password resets, 2FA codes, billing statements, terms updates. Auto-archive candidates. | No | `--bb-amber` |

**Mapping from current categories:**

| Current | New |
|---------|-----|
| `actionable` | `priority` |
| `informational` | `updates` or `receipts` (split by transactional detection) |
| `personal` | `priority` (personal messages from known contacts need responses) |
| `spam` | Filtered out entirely (not a visible category) |

### 2.2 Tab/Filter UI

The inbox uses a horizontal pill bar below the toolbar to switch between categories. This replaces the current dropdown filter approach.

```
[All (43)] [Priority (7)] [Updates (12)] [Feed (18)] [Receipts (6)]
```

- **"All"** shows everything except spam, sorted by time
- Each category pill shows its unread count
- Active pill is filled with category color, inactive pills are ghost/outline
- Clicking a pill filters instantly (client-side filter, no API call since all messages are already loaded)
- The "Priority" pill pulses gently if there are unread priority messages (uses existing `bb-inbox-pulse` keyframe)

### 2.3 Multi-Channel Coexistence

Messages from all channels appear in a single unified stream. Channel identity is shown via:

1. **Channel icon** (small, 14px) to the left of the sender avatar — not replacing the avatar
2. **Channel color** as a subtle left-border accent on the row (2px, using existing `CHANNEL_BRAND_COLORS`)

Channel filtering remains available via the existing filter dropdown but is secondary to category filtering. The mental model is: "I care about what needs my attention (category), not which pipe it came through (channel)."

For WhatsApp and SMS (conversational channels), the "subject" field displays the last message preview instead of being null. The row layout adapts: no subject line, just sender + preview.

---

## 3. Card/Row Design Specification

### 3.1 Row Layout

Each message row is a single horizontal strip, 56px tall (48px content + 8px vertical padding), with the following columns:

```
|2px|  Avatar  |  Sender Column  |  Content Column (flex)  |  Meta Column  |
|bdr|  40px    |  140px          |  remaining              |  80px         |
```

**Detailed anatomy:**

```
┌──┬──────┬──────────────────┬─────────────────────────────────────┬──────────┐
│▌ │ [AV] │ Sarah Chen       │ [Priority]  Website revision — fi… │ 12m  ••• │
│▌ │  GM  │                  │ Hey, the client loved the new he…  │          │
└──┴──────┴──────────────────┴─────────────────────────────────────┴──────────┘
```

Where:
- `▌` = 2px left border in channel brand color
- `[AV]` = 36px circular avatar (profile picture or generated initials)
- `GM` = 14px channel icon, positioned bottom-right of avatar as a badge overlay
- `Sarah Chen` = sender name, 13px, semibold for unread, normal for read
- `[Priority]` = category badge pill, 10px uppercase, colored background
- `Website revision...` = subject line, 13px, truncated with ellipsis
- `Hey, the client...` = body preview, 12px, secondary color, truncated
- `12m` = relative timestamp
- `•••` = hover-only action dots (replaced by action buttons on hover)

### 3.2 Avatar Specification

**Size**: 36px diameter circle, border-radius 50%

**Resolution chain** (in order of preference):

1. **Contacts DB avatar_url** — if the sender matches a known contact with a stored avatar
2. **Gravatar** — hash sender email, request `https://www.gravatar.com/avatar/{md5}?s=72&d=404`. If 404, fall through
3. **Clearbit Logo API** — for service senders (detected by domain), request `https://logo.clearbit.com/{domain}?size=72`. Useful for Stripe, Asana, Calendly, etc.
4. **Generated initials** — extract first letter of first name + first letter of last name. Render as text on a colored circle.

**Deterministic color for initials:**

```typescript
function avatarColor(name: string): string {
  const COLORS = [
    '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
    '#ec4899', '#f43f5e', '#ef4444', '#f97316',
    '#eab308', '#84cc16', '#22c55e', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}
```

**Channel badge overlay**: A 16px circle positioned at bottom-right of the avatar (offset: bottom -2px, right -2px), containing the channel SVG icon at 10px. Background matches channel brand color. Border: 2px solid var(--glass-card-bg) to create a "cutout" effect.

### 3.3 Visual States

| State | Visual Treatment |
|-------|-----------------|
| **Unread** | Sender name bold (font-weight: 700). Subject bold. Subtle left glow on the channel border. Background: `rgba(var(--bb-purple-rgb), 0.04)` |
| **Read** | Sender name normal weight (500). Subject normal. No background tint |
| **Archived** | Hidden from default view. Accessible via "Archived" filter |
| **Starred** | Small star icon (12px, `--bb-amber`) appears between sender and category badge |
| **Snoozed** | Row has reduced opacity (0.6). Clock icon replaces timestamp. Tooltip shows snooze-until time. Returns to full opacity and moves to top when snooze expires |
| **Priority: critical** | Left border pulses gently. Row background: `rgba(var(--bb-red-rgb), 0.06)` |
| **Priority: high** | Left border solid. Row background: `rgba(var(--bb-orange-rgb), 0.04)` |

### 3.4 Spacing and Typography

```css
/* Row */
--inbox-row-height: 56px;
--inbox-row-padding-x: 16px;
--inbox-row-padding-y: 8px;
--inbox-row-gap: 12px;

/* Avatar */
--inbox-avatar-size: 36px;
--inbox-channel-badge-size: 16px;

/* Typography */
--inbox-sender-size: 13px;
--inbox-sender-weight-unread: 700;
--inbox-sender-weight-read: 500;
--inbox-subject-size: 13px;
--inbox-preview-size: 12px;
--inbox-time-size: 11px;
--inbox-category-size: 10px;

/* Colors */
--inbox-sender-color: var(--text-primary);
--inbox-subject-color: var(--text-primary);
--inbox-preview-color: var(--text-secondary);
--inbox-time-color: var(--text-dim);
```

### 3.5 Responsive Behavior

**Desktop (>1024px)**: Full 4-column layout as described above.

**Tablet (768-1024px)**: Sender column shrinks to 100px. Category badge moves inline with subject.

**Mobile (<768px)**:
- Avatar + sender on first line
- Subject + preview on second line (stacked)
- Time appears right-aligned on first line
- Category badge pill appears after sender name
- Swipe gestures replace hover actions (see Section 5)

---

## 4. Email Reading Experience

### 4.1 Interaction Model: Slide-Out Drawer

**Recommendation: Right-side slide-out drawer at 55% viewport width.**

Rationale from competitor analysis:
- **Modal** (Front model): Blocks the inbox list, loses spatial context. Rejected.
- **Full-page navigation** (Gmail model): Loses inbox context entirely, requires back-button. Rejected.
- **Inline expand** (Spark model): Pushes rows down, causes layout jank. Rejected.
- **Slide-out drawer** (Missive/Superhuman model): Preserves inbox list on left for quick scanning. User can click other rows to switch without closing. Best of both worlds.

### 4.2 Drawer Specification

```
┌──────────────────────────────┬────────────────────────────────────────────┐
│                              │                                            │
│   Inbox List (45%)           │   Message Drawer (55%)                     │
│                              │                                            │
│   [Category Pills]           │   ┌─ Header ─────────────────────────┐    │
│                              │   │ [Avatar] Sarah Chen               │    │
│   [Selected Row ████████]    │   │ sarah@designstudio.co              │    │
│   [Other Row]                │   │ To: me  •  Mar 13, 10:48 AM       │    │
│   [Other Row]                │   │ [Reply] [Forward] [Archive] [•••] │    │
│   [Other Row]                │   └──────────────────────────────────-┘    │
│   [Other Row]                │                                            │
│   [Other Row]                │   Website revision — final round feedback  │
│                              │                                            │
│                              │   Hey, the client loved the new hero       │
│                              │   section but wants the CTA button colour  │
│                              │   changed to match their brand guide...    │
│                              │                                            │
│                              │   ┌─ AI Summary ─────────────────────┐    │
│                              │   │ Client wants CTA color changed.   │    │
│                              │   │ Suggested action: Update button   │    │
│                              │   │ to #2563EB per brand guide.       │    │
│                              │   └──────────────────────────────────-┘    │
│                              │                                            │
│                              │   ┌─ Reply ──────────────────────────┐    │
│                              │   │ Type a reply...                   │    │
│                              │   │                        [Send]     │    │
│                              │   └──────────────────────────────────-┘    │
│                              │                                            │
└──────────────────────────────┴────────────────────────────────────────────┘
```

### 4.3 Drawer Component Structure

**File**: `personal-assistant/src/components/dashboard/inbox-drawer.tsx` (new)

```typescript
interface InboxDrawerProps {
  message: InboxMessage | null;
  open: boolean;
  onClose: () => void;
  onArchive: (id: string) => void;
  onDone: (id: string) => void;
  onReply: (id: string, body: string) => void;
  onNavigate: (direction: 'prev' | 'next') => void;
}
```

**Behavior:**
- Opens with a 300ms slide-in from right (`transform: translateX(100%) -> translateX(0)`)
- Closes on Escape key, clicking outside, or clicking the close button
- Arrow up/down (or j/k) navigates to prev/next message without closing
- Drawer width is resizable via drag handle (min 40%, max 70%, persisted to localStorage key `bb-inbox-drawer-width`)
- On mobile (<768px), drawer becomes a full-screen overlay with swipe-down-to-close

### 4.4 Thread View

For multi-message conversations (same thread ID or same contact + subject):

- Messages are shown in chronological order, newest at bottom
- Each message in the thread shows a condensed header: sender + time
- Collapsed messages show first line only; click to expand
- The most recent message is auto-expanded
- Thread count badge shows in the inbox row: `(3)` after the subject

**Thread detection logic:**
1. Gmail/Outlook: Use thread_id from the API response (stored in `channel_messages.metadata.thread_id`)
2. WhatsApp/SMS: Group by contact_id + 24-hour window
3. Cross-channel: Same contact + similar subject (using existing `buildDedupeKey` logic from `channel-triage.ts`)

### 4.5 Reply Inline

The reply composer sits at the bottom of the drawer:

- Minimal textarea, auto-expanding, with placeholder "Type a reply..."
- Send button (primary accent color) appears only when text is entered
- Reply-all toggle when message has multiple recipients
- Supports Markdown formatting (bold, italic, links) via keyboard shortcuts
- Cmd+Enter to send
- For email: reply goes through the existing email transport (`src/lib/email/email-transport.ts`)
- For WhatsApp/SMS: reply routes through the appropriate channel adapter

### 4.6 AI Summary Panel

For messages with significance >= 5, an AI summary card appears between the header and body:

```
┌─ AI Summary ─────────────────────────────────────────┐
│ 🤖 Client wants CTA color changed to #2563EB.       │
│    Deadline mentioned: end of this week.              │
│    [Create Task] [Draft Reply]                        │
└──────────────────────────────────────────────────────-┘
```

- Generated on-demand when drawer opens (lazy, not pre-computed for all messages)
- Cached in `channel_messages.metadata.ai_summary` after first generation
- Action buttons: "Create Task" (pre-fills task from message), "Draft Reply" (opens reply with AI-suggested text)
- Styled with the existing `bb-card` glassmorphic treatment, purple-tinted border

---

## 5. Action System

### 5.1 Primary Actions

| Action | Icon | Keyboard | Swipe (mobile) | Behavior |
|--------|------|----------|-----------------|----------|
| **Archive** | `Archive` (lucide) | `e` | Swipe right (full) | Removes from inbox. Sets `status: 'archived'` in metadata. Reversible via undo toast |
| **Done** | `CheckCircle2` | `d` | Swipe right (short) | Marks as processed. Moves to "Done" filter. Sets `processed: true` |
| **Snooze** | `Clock` | `s` | N/A (menu) | Opens snooze picker: "Later today", "Tomorrow", "Next week", custom date/time. Stores `snoozed_until` in metadata |
| **Reply** | `Reply` | `r` | N/A | Opens reply composer in drawer. If drawer not open, opens drawer first |
| **Forward** | `Forward` | `f` | N/A | Opens forward composer with original message quoted |
| **Spam** | `Ban` | `Shift+!` | Swipe left (full) | Marks as spam. Trains the classifier. Removes from inbox |
| **Star** | `Star` | `*` | N/A | Toggles starred state. Starred messages appear in "Starred" filter |
| **Delete** | `Trash2` | `#` | Swipe left (short) | Permanently deletes. Confirmation dialog for messages less than 24h old |

### 5.2 Hover Actions on Row

On desktop, hovering a row reveals action buttons that replace the timestamp:

```
Before hover: [12m ago]
After hover:  [Archive] [Done] [Snooze] [Reply]
```

Transition: 150ms crossfade (existing `bb-inbox-row__meta-default` / `bb-inbox-row__hover-actions` pattern, extended with Snooze and Reply).

### 5.3 Keyboard Navigation

Full keyboard-driven workflow (Superhuman model):

| Key | Action |
|-----|--------|
| `j` / `↓` | Move selection to next message |
| `k` / `↑` | Move selection to previous message |
| `Enter` / `o` | Open selected message in drawer |
| `Escape` | Close drawer / clear selection |
| `e` | Archive selected message(s) |
| `d` | Mark as done |
| `r` | Reply |
| `f` | Forward |
| `s` | Snooze |
| `*` | Star/unstar |
| `#` | Delete |
| `Shift+!` | Mark as spam |
| `x` | Select/deselect current message (for batch) |
| `Cmd+a` | Select all visible messages |
| `Cmd+Shift+a` | Deselect all |
| `?` | Show keyboard shortcut overlay |
| `g i` | Go to inbox (from any tab) |
| `/` | Focus search |
| `1-4` | Switch to category tab (1=All, 2=Priority, 3=Updates, 4=Feed) |

**Implementation**: A `useInboxKeyboard` hook that registers a global keydown listener, scoped to when the inbox tab is active. Uses a `selectedIndex` state to track the currently focused row. Selected row gets a subtle highlight ring (`outline: 2px solid var(--bb-purple); outline-offset: -2px`).

**File**: `personal-assistant/src/hooks/use-inbox-keyboard.ts` (new)

### 5.4 Swipe Gestures (Mobile)

Using a touch gesture library (or custom pointer event handling):

| Gesture | Action | Visual |
|---------|--------|--------|
| Swipe right (>100px) | Archive | Green background reveals, Archive icon slides in |
| Swipe right (<100px) | Done | Blue background, checkmark icon |
| Swipe left (>100px) | Spam | Red background, ban icon |
| Swipe left (<100px) | Delete | Orange background, trash icon |

Haptic feedback on threshold crossing (if available via `navigator.vibrate`).

### 5.5 Batch Actions

When one or more messages are selected (via `x` key or checkbox):

- A batch action bar appears at the top of the inbox list, replacing the category pills
- Shows: "[N] selected — [Archive] [Done] [Move to...] [Spam] [Deselect all]"
- All actions apply to the full selection
- Progress indicator for large batches (>20 messages)

**Select UI**: A small checkbox (16px) appears at the far left of each row when any message is selected, or when the user holds Shift. Otherwise, the checkbox is hidden to keep the UI clean.

### 5.6 Undo Toast

After any destructive action (archive, delete, spam), a toast appears at the bottom:

```
┌────────────────────────────────────────┐
│ Message archived.              [Undo]  │
└────────────────────────────────────────┘
```

- Auto-dismisses after 5 seconds
- "Undo" reverses the action (restores message to inbox)
- Multiple toasts stack (max 3 visible)
- Implementation: extend existing toast system or add a minimal `useUndoToast` hook

---

## 6. Triage Pipeline Enhancement

### 6.1 Header-Based Human/Automated Classification

Before any LLM classification, apply deterministic header analysis to detect automated senders. This is fast, free, and highly accurate.

**File to modify**: `personal-assistant/src/lib/agent/classifier.ts`

**New function**: `classifyByHeaders(headers: Record<string, string>): SenderType`

```typescript
type SenderType = 'human' | 'automated' | 'transactional' | 'marketing';

function classifyByHeaders(headers: Record<string, string>): SenderType {
  // Marketing signals
  if (headers['list-unsubscribe'] || headers['list-unsubscribe-post']) return 'marketing';
  if (headers['precedence'] === 'bulk' || headers['precedence'] === 'list') return 'marketing';

  // Transactional signals
  if (headers['x-mailer']?.includes('postmark')) return 'transactional';
  if (headers['x-mailer']?.includes('sendgrid')) return 'transactional';
  if (headers['x-mailer']?.includes('mailchimp')) return 'marketing';
  if (headers['x-ses-outgoing']) return 'transactional';
  if (headers['feedback-id']) return 'marketing'; // Gmail feedback loop

  // Automated sender signals
  if (headers['auto-submitted'] && headers['auto-submitted'] !== 'no') return 'automated';
  if (headers['x-autoreply'] || headers['x-autorespond']) return 'automated';

  // No-reply senders
  const from = headers['from'] || '';
  if (/no-?reply|donotreply|notifications?@|mailer-daemon/i.test(from)) return 'automated';

  return 'human';
}
```

**Content-based signals** (supplement headers when unavailable):

```typescript
interface ContentSignals {
  htmlRatio: number;         // HTML length / text length — high ratio = likely automated
  linkDensity: number;       // links per 100 words — high = marketing
  hasUnsubscribeLink: boolean;
  hasTrackingPixels: boolean; // 1x1 images
  imageCount: number;
  personalGreeting: boolean; // starts with "Hi [name]" or "Dear [name]"
}
```

### 6.2 Category Assignment Logic

Enhanced `toMessageCategory` function that uses the new taxonomy:

```typescript
function toNewCategory(
  classification: ClassificationResult,
  senderType: SenderType,
  headers: Record<string, string>,
): InboxCategory {
  // Spam is filtered out, not a visible category
  if (classification.category === 'spam') return 'spam'; // hidden

  // Marketing/newsletters -> Feed
  if (senderType === 'marketing') return 'feed';

  // Transactional -> Receipts
  if (senderType === 'transactional') return 'receipts';

  // Automated but not transactional/marketing -> Updates
  if (senderType === 'automated') return 'updates';

  // Human senders with actionable content -> Priority
  if (classification.significance >= 4) return 'priority';
  if (classification.category === 'client' || classification.category === 'lead') return 'priority';

  // Human senders with low actionability -> Updates
  return 'updates';
}
```

### 6.3 LLM-Powered Actionability Scoring

For messages classified as `human` by headers, run a lightweight LLM pass to score actionability. This determines whether a human message is `priority` or `updates`.

**Signals to extract:**

| Signal | Weight | Detection |
|--------|--------|-----------|
| Contains a question | +2 | NLP: sentence ending in `?`, or starts with who/what/when/where/why/how/can/could/would/should |
| Contains a deadline | +3 | NLP: "by Friday", "end of week", "before March 15", date patterns |
| Contains a directive | +2 | NLP: imperative mood ("please review", "send me", "update the") |
| Contains urgency language | +2 | Keywords: "urgent", "ASAP", "time-sensitive", "critical", "immediately" |
| Contains @mention of user | +3 | Pattern: @username or user's name |
| Is a reply to user's message | +1 | Thread analysis: user sent previous message |
| Sender is a known client | +2 | Entity resolution: contact has `is_client: true` |
| Has outstanding invoice | +1 | Financial signals from triage pipeline |

**Score thresholds:**
- >= 4: `priority` category
- 2-3: `updates` category
- 0-1: `updates` category (but low significance)

### 6.4 Smart Contact Creation

**Current problem (Bug #4):** Every sender is auto-created as a contact, including `no-reply@1password.com`, `notifications@aws.amazon.com`, etc.

**New rules:**

```typescript
interface ContactCreationDecision {
  shouldCreate: boolean;
  reason: string;
}

function shouldCreateContact(
  senderEmail: string,
  senderName: string,
  senderType: SenderType,
  interactionHistory: { inboundCount: number; outboundCount: number; userInitiated: boolean },
): ContactCreationDecision {
  // NEVER create contacts for automated senders
  if (senderType !== 'human') {
    return { shouldCreate: false, reason: 'Automated sender' };
  }

  // NEVER create for no-reply addresses
  if (/no-?reply|donotreply|notifications?@|mailer-daemon|bounce/i.test(senderEmail)) {
    return { shouldCreate: false, reason: 'No-reply address' };
  }

  // CREATE if user emailed them first AND they replied
  if (interactionHistory.userInitiated && interactionHistory.inboundCount >= 1) {
    return { shouldCreate: true, reason: 'User-initiated conversation with reply' };
  }

  // CREATE if 2+ inbound messages from this sender
  if (interactionHistory.inboundCount >= 2) {
    return { shouldCreate: true, reason: 'Multiple inbound messages' };
  }

  // HOLD: keep as transient sender record, don't promote to contact
  return { shouldCreate: false, reason: 'Insufficient interaction history' };
}
```

**Transient sender records**: Store in `channel_messages.metadata.sender_info` rather than the `contacts` table. Only promote to a full contact when the creation threshold is met.

**File to modify**: `personal-assistant/src/lib/agent/channel-triage.ts` — the `resolveMessageSender` function (line ~168) should check creation rules before auto-creating.

### 6.5 Avatar Resolution Pipeline

**New file**: `personal-assistant/src/lib/avatar/resolver.ts`

```typescript
interface AvatarResult {
  url: string | null;
  type: 'contact' | 'gravatar' | 'clearbit' | 'initials';
  color?: string; // for initials fallback
  initials?: string;
}

async function resolveAvatar(
  senderEmail: string | null,
  senderName: string | null,
  contactAvatarUrl: string | null,
): Promise<AvatarResult> {
  // 1. Known contact avatar
  if (contactAvatarUrl) {
    return { url: contactAvatarUrl, type: 'contact' };
  }

  // 2. Gravatar (by email hash)
  if (senderEmail) {
    const hash = md5(senderEmail.toLowerCase().trim());
    const gravatarUrl = `https://www.gravatar.com/avatar/${hash}?s=72&d=404`;
    // Check with HEAD request, cache result
    const exists = await checkUrlExists(gravatarUrl);
    if (exists) {
      return { url: gravatarUrl, type: 'gravatar' };
    }
  }

  // 3. Clearbit Logo (by domain, for service senders)
  if (senderEmail) {
    const domain = senderEmail.split('@')[1];
    if (domain && !isPersonalEmailDomain(domain)) {
      const clearbitUrl = `https://logo.clearbit.com/${domain}?size=72`;
      const exists = await checkUrlExists(clearbitUrl);
      if (exists) {
        return { url: clearbitUrl, type: 'clearbit' };
      }
    }
  }

  // 4. Generated initials
  const name = senderName || senderEmail?.split('@')[0] || '?';
  const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const color = avatarColor(name);
  return { url: null, type: 'initials', initials, color };
}

const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'icloud.com', 'me.com', 'live.com', 'aol.com',
  'protonmail.com', 'fastmail.com',
]);

function isPersonalEmailDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.has(domain.toLowerCase());
}
```

**Caching**: Avatar resolution results are cached in a `Map<string, AvatarResult>` scoped to the inbox component lifecycle. For persistent caching, store resolved avatar URLs in `contacts.metadata.avatar_url` and `channel_messages.metadata.sender_avatar`.

**React component**: `personal-assistant/src/components/ui/message-avatar.tsx` (new)

```typescript
interface MessageAvatarProps {
  senderEmail: string | null;
  senderName: string | null;
  contactAvatarUrl: string | null;
  channelType: string;
  size?: number; // default 36
}
```

Renders the avatar circle with channel badge overlay. Uses `useSWR` or `useQuery` with stale-while-revalidate for the Gravatar/Clearbit checks.

---

## 7. Notification Fix

### 7.1 Current Problem (Bug #6)

Read state is client-only (`useState`). When the user reads a message, reloading the page resets the count to 43. The `useBadgeCounts` hook (file: `src/hooks/use-badge-counts.ts`) queries `channel_messages` for `processed: false`, but "processed" means "triaged by the AI", not "read by the user".

### 7.2 Solution: Persistent Read State

**Database change**: Add a `read_at` column to `channel_messages`:

```sql
-- Migration: 060_add_read_state.sql
ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ DEFAULT NULL;
CREATE INDEX idx_channel_messages_read_at ON channel_messages (org_id, read_at) WHERE read_at IS NULL;
```

**Semantic distinction:**
- `processed: boolean` = has the AI triage pipeline classified this message? (existing, keep as-is)
- `read_at: timestamp | null` = has the user seen/opened this message? (new)

### 7.3 Read State API

**New endpoint**: `PATCH /api/agent/inbox/[id]/read`

```typescript
// personal-assistant/src/app/api/agent/inbox/[id]/read/route.ts (new)
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  // Set read_at = now() for the message
  // Return updated message
}
```

**Batch read**: `PATCH /api/agent/inbox/read` with body `{ ids: string[] }`

- Called when user opens a message in the drawer (auto-marks as read)
- Called when user scrolls past a message (optional, configurable in settings)
- Called when user clicks "Mark all as read" in a category

### 7.4 Badge Count Update

Modify `useBadgeCounts` (file: `src/hooks/use-badge-counts.ts`, line 42):

```typescript
// Current (wrong):
.eq('processed', false)

// New (correct):
.is('read_at', null)
```

### 7.5 Category-Based Notification Counts

Extend `BadgeCounts` interface:

```typescript
export interface BadgeCounts {
  inbox: number;          // total unread across all categories
  inboxPriority: number;  // unread in Priority category only
  approvals: number;
  leads: number;
  invoices: number;
}
```

**Which categories generate badges:**
- **Priority**: Yes. Shows count on inbox sidebar icon and as a separate sub-count
- **Updates**: No badge. Users check when convenient
- **Feed**: No badge. Low urgency
- **Receipts**: No badge. Auto-archived

The sidebar badge shows `inboxPriority` count (not total `inbox`), since only priority messages warrant attention-grabbing badges.

---

## 8. Sidebar Cleanup

### 8.1 Remove "Advanced" Button (Bug #7)

**Current behavior**: A chevron toggle at the bottom of the sidebar nav that shows/hides "advanced" tabs (Analytics, Costs, Knowledge, Admin, Sentry). State persisted to `localStorage('bb-show-advanced')`.

**Problem**: Confusing UX. Users don't know what "Advanced" means. The tabs it hides are not consistently "advanced" (Analytics is useful for everyone).

**Solution**: Remove the toggle entirely. Instead, use the existing sidebar category rail (file: `src/components/dashboard/sidebar-rail.tsx`) which already groups tabs into categories (Dashboard, Communication, Business, Intelligence, Admin, Settings). The category-based organization provides natural progressive disclosure — users click a category to see its tabs, no separate "Advanced" toggle needed.

**Files to modify:**
- `personal-assistant/src/components/dashboard/sidebar-panel.tsx` — remove `showAdvanced` state and toggle button
- `personal-assistant/src/components/dashboard/sidebar-nav.test.tsx` — remove all "Progressive Disclosure" tests (they test removed functionality)
- `personal-assistant/src/styles/bitbit-design-system.css` — remove `.bb-sidebar__chevron-toggle` styles

### 8.2 Remove Duplicate "Settings" (Bug #8)

**Current behavior**: Settings appears both as a sidebar nav item AND in the profile dropdown (avatar menu).

**Solution**: Remove Settings from the sidebar nav items. Keep it only in the profile dropdown, which is the standard location users expect (GitHub, Linear, Notion all do this).

**File to modify**: `personal-assistant/src/lib/modules/registry.ts` — remove `settings` from the module registry's sidebar entries. Keep the Settings tab component itself for rendering when accessed via profile dropdown.

---

## 9. Agent Email Access

### 9.1 Current Problem (Bug #5)

The AI chat agent (`src/components/dashboard/tabs/chat-tab.tsx`) cannot access email content. When users say "summarize my emails" or "what did Sarah say?", the agent has no tools to read email data.

### 9.2 Required Agent Tools

Add the following tools to the agent's tool registry (file: `src/lib/conversation/unified-pipeline.ts` or wherever tools are defined):

#### Tool 1: `search_inbox`

```typescript
{
  name: 'search_inbox',
  description: 'Search the unified inbox for messages matching a query. Can filter by sender, channel, category, date range, and keywords.',
  parameters: {
    query: { type: 'string', description: 'Search query (matches subject, body, sender)' },
    channel: { type: 'string', optional: true, description: 'Filter by channel: gmail, whatsapp, sms, slack' },
    category: { type: 'string', optional: true, description: 'Filter by category: priority, updates, feed, receipts' },
    from: { type: 'string', optional: true, description: 'Filter by sender name or email' },
    since: { type: 'string', optional: true, description: 'ISO date string, only messages after this date' },
    limit: { type: 'number', optional: true, description: 'Max results, default 10' },
  },
  handler: async (params) => {
    // Query channel_messages via Supabase with full-text search
    // Return: array of { id, sender, subject, preview, channel, receivedAt, category }
  },
}
```

#### Tool 2: `read_email`

```typescript
{
  name: 'read_email',
  description: 'Read the full content of a specific email or message by ID. Returns the complete body, headers, and any attachments.',
  parameters: {
    message_id: { type: 'string', description: 'The message ID to read' },
  },
  handler: async (params) => {
    // Fetch full message from channel_messages
    // If body is truncated, fetch from Gmail/Outlook API using stored credentials
    // Return: { id, sender, senderEmail, subject, body, headers, attachments, receivedAt, threadMessages }
  },
}
```

#### Tool 3: `draft_reply`

```typescript
{
  name: 'draft_reply',
  description: 'Draft a reply to a message. The draft is saved but NOT sent until the user approves.',
  parameters: {
    message_id: { type: 'string', description: 'The message to reply to' },
    body: { type: 'string', description: 'The reply body text' },
    tone: { type: 'string', optional: true, description: 'Tone: professional, casual, friendly, formal' },
  },
  handler: async (params) => {
    // Create a draft in the Gmail/Outlook API
    // Store draft reference in channel_messages metadata
    // Return: { draft_id, preview, status: 'draft_saved' }
  },
}
```

#### Tool 4: `summarize_inbox`

```typescript
{
  name: 'summarize_inbox',
  description: 'Generate a summary of recent inbox activity. Groups by category and highlights important items.',
  parameters: {
    hours: { type: 'number', optional: true, description: 'Look back period in hours, default 24' },
  },
  handler: async (params) => {
    // Use existing generateDigest function from channel-triage.ts
    // Enhance with thread status and priority information
    // Return: structured digest with category counts and highlights
  },
}
```

### 9.3 Gmail API Integration for Full Message Reading

The existing Gmail adapter (`src/lib/channels/gmail.ts`) can fetch messages via the Gmail API. The `read_email` tool needs to:

1. Look up the message in `channel_messages` to get `metadata.external_id` (the Gmail message ID)
2. Look up OAuth credentials from `channel_connections` for the user's Gmail connection
3. Call `gmail.users.messages.get` with `format: 'full'` to get the complete message
4. Parse MIME content, extract plain text and HTML body
5. Return the structured result to the agent

**File to modify**: `personal-assistant/src/lib/channels/gmail.ts` — add a `readFullMessage(messageId: string)` function.

### 9.4 Security Considerations

- Agent tools execute server-side only (API routes, not client components)
- All tool calls are scoped to the user's `org_id` via the existing auth context
- Full message bodies are passed to the LLM only when explicitly requested (via `read_email`), not in bulk
- Draft replies require user approval before sending (stored as drafts, not auto-sent)
- Tool usage is logged in `entity_timeline` for audit

---

## 10. Implementation Phases

### Phase 1: Bug Fixes (1-2 days)

**Goal**: Fix the 5 most impactful bugs that don't require architectural changes.

| Task | File(s) | Scope |
|------|---------|-------|
| **P1-1: Fix toLowerCase crash (Bug #12)** | `src/lib/context/entity-resolver.ts` | Already guarded with `(query ?? '')` pattern at lines 35, 51, 83. Verify all call sites pass valid strings. Check `mention-extractor.ts` line 33 — `text` parameter could be null if message body is missing. Add guard: `const lowerText = (text ?? '').toLowerCase()` |
| **P1-2: Sidebar cleanup (Bugs #7, #8)** | `src/components/dashboard/sidebar-panel.tsx`, `src/lib/modules/registry.ts`, `src/styles/bitbit-design-system.css` | Remove "Advanced" chevron toggle and localStorage logic. Remove `settings` from sidebar module list. Remove `.bb-sidebar__chevron-toggle*` CSS. Update `sidebar-nav.test.tsx` to remove Progressive Disclosure tests |
| **P1-3: Notification persistence (Bug #6)** | New migration `060_add_read_state.sql`, `src/hooks/use-badge-counts.ts`, new route `src/app/api/agent/inbox/[id]/read/route.ts` | Add `read_at` column. Update badge query from `processed: false` to `read_at IS NULL`. Create PATCH endpoint for marking read |
| **P1-4: Fix triage defaults (Bug #1)** | `src/lib/agent/channel-triage.ts` line 676 | Change fallback from `'informational'` to derive from sender type. If `metadata` is empty AND `significance` is 0, classify as `'updates'` not `'informational'`. Add `classifyByHeaders` function for deterministic pre-classification |
| **P1-5: Fix category tag spacing (Bug #10)** | `src/styles/bitbit-design-system.css` `.bb-inbox-row__tag` | Add `margin-right: 8px` to create visual separation between tag and sender name |

### Phase 2: Core UX (3-5 days)

**Goal**: Make the inbox actually usable — clickable messages, action buttons, keyboard navigation.

| Task | File(s) | Scope |
|------|---------|-------|
| **P2-1: Email reading drawer (Bugs #2, #9)** | New `src/components/dashboard/inbox-drawer.tsx` | Build the slide-out drawer component. Click handler on `MessageRow` opens drawer. Drawer displays full message content. Close on Escape. j/k navigation between messages. See Section 4 for full spec |
| **P2-2: Fix action buttons (Bug #3)** | `src/components/dashboard/tabs/inbox-tab.tsx` lines 600-612 | Add Snooze and Reply buttons to hover actions. Wire up all handlers (archive, done, snooze, reply, spam). Create snooze picker dropdown. Add undo toast on archive/delete |
| **P2-3: Keyboard shortcuts** | New `src/hooks/use-inbox-keyboard.ts` | Implement full keyboard navigation per Section 5.3. Selected row state. Global key listener scoped to inbox tab. Shortcut overlay on `?` key |
| **P2-4: Card redesign** | `src/components/dashboard/tabs/inbox-tab.tsx` (MessageRow component), `src/styles/bitbit-design-system.css` | Redesign row layout per Section 3. Add avatar component. Add channel badge overlay. Update category taxonomy from 4-old to 4-new. Add category pills filter bar |
| **P2-5: Category filter pills** | `src/components/dashboard/tabs/inbox-tab.tsx` | Replace dropdown filters with horizontal pill bar. Pills show category counts. Client-side filtering. Animate active state transitions |
| **P2-6: Thread view** | `src/components/dashboard/inbox-drawer.tsx` | Group messages by thread_id or contact+subject. Show thread count in row. Expand/collapse messages within thread in drawer |

### Phase 3: Intelligence (3-5 days)

**Goal**: Make the inbox smart — automatic classification, avatars, contact intelligence.

| Task | File(s) | Scope |
|------|---------|-------|
| **P3-1: Avatar resolution** | New `src/lib/avatar/resolver.ts`, new `src/components/ui/message-avatar.tsx` | Implement the 4-tier avatar resolution chain (Contact DB, Gravatar, Clearbit, Initials). Cache results. Render avatar component with channel badge overlay |
| **P3-2: Smart contact creation (Bug #4)** | `src/lib/agent/channel-triage.ts` `resolveMessageSender` function | Implement `shouldCreateContact` rules. Track interaction counts per sender email. Only promote to contact when threshold met. Store transient senders in message metadata |
| **P3-3: Header-based classification** | `src/lib/agent/classifier.ts`, `src/lib/agent/channel-triage.ts` | Add `classifyByHeaders` function. Run as pre-classifier before LLM. Store `sender_type` in message metadata. Use sender_type to determine new category taxonomy |
| **P3-4: Actionability scoring** | `src/lib/agent/classifier.ts` | Add NLP-based actionability scoring for human senders. Extract question, deadline, directive, urgency signals. Score determines priority vs updates category |
| **P3-5: AI summary in drawer** | `src/components/dashboard/inbox-drawer.tsx` | For messages with significance >= 5, generate and display AI summary card. Cache in metadata. Add "Create Task" and "Draft Reply" action buttons |

### Phase 4: Agent Integration (2-3 days)

**Goal**: Give the AI chat agent full email access.

| Task | File(s) | Scope |
|------|---------|-------|
| **P4-1: search_inbox tool** | `src/lib/conversation/unified-pipeline.ts` (or agent tools registry) | Add `search_inbox` tool definition. Query `channel_messages` with full-text search and filters. Return structured results to agent |
| **P4-2: read_email tool** | Same + `src/lib/channels/gmail.ts` | Add `read_email` tool. Fetch full message from DB, or from Gmail API if body is truncated. Parse MIME. Return complete content |
| **P4-3: draft_reply tool** | Same + `src/lib/email/email-transport.ts` | Add `draft_reply` tool. Create draft via Gmail API. Store reference in metadata. Require user approval before sending |
| **P4-4: summarize_inbox tool** | Same | Add `summarize_inbox` tool. Wraps existing `generateDigest` function from `channel-triage.ts`. Enhanced with thread status and priority info |
| **P4-5: AI triage summaries** | `src/components/dashboard/tabs/inbox-tab.tsx` | Add an "AI Brief" button in the toolbar that generates a natural-language summary of the current inbox state. "You have 3 priority messages: Sarah needs the CTA color updated (due Friday), Andy reports checkout 500s, and Asana assigned you Q1 brand refresh." |

### Phase Summary

| Phase | Duration | Dependencies | Key Deliverable |
|-------|----------|-------------|-----------------|
| **Phase 1** | 1-2 days | None | Stable, non-crashing inbox with persistent notifications |
| **Phase 2** | 3-5 days | Phase 1 | Fully interactive inbox (open, read, reply, keyboard, actions) |
| **Phase 3** | 3-5 days | Phase 2 | Smart inbox (avatars, classification, contact intelligence) |
| **Phase 4** | 2-3 days | Phase 2 | AI agent can read/search/reply to emails |

**Total estimated effort**: 9-15 engineering days.

---

## Appendix A: File Index

All files referenced in this document:

| File | Status | Phase |
|------|--------|-------|
| `personal-assistant/src/components/dashboard/tabs/inbox-tab.tsx` | Modify | P1, P2 |
| `personal-assistant/src/components/dashboard/inbox-feed.tsx` | Modify | P2 |
| `personal-assistant/src/components/dashboard/inbox-drawer.tsx` | **New** | P2 |
| `personal-assistant/src/hooks/use-inbox-keyboard.ts` | **New** | P2 |
| `personal-assistant/src/hooks/use-badge-counts.ts` | Modify | P1 |
| `personal-assistant/src/lib/agent/channel-triage.ts` | Modify | P1, P3 |
| `personal-assistant/src/lib/agent/classifier.ts` | Modify | P3 |
| `personal-assistant/src/lib/avatar/resolver.ts` | **New** | P3 |
| `personal-assistant/src/components/ui/message-avatar.tsx` | **New** | P3 |
| `personal-assistant/src/lib/conversation/unified-pipeline.ts` | Modify | P4 |
| `personal-assistant/src/lib/channels/gmail.ts` | Modify | P4 |
| `personal-assistant/src/lib/email/email-transport.ts` | Modify | P4 |
| `personal-assistant/src/app/api/agent/inbox/route.ts` | Modify | P1 |
| `personal-assistant/src/app/api/agent/inbox/[id]/read/route.ts` | **New** | P1 |
| `personal-assistant/src/components/dashboard/sidebar-panel.tsx` | Modify | P1 |
| `personal-assistant/src/components/dashboard/sidebar-nav.test.tsx` | Modify | P1 |
| `personal-assistant/src/lib/modules/registry.ts` | Modify | P1 |
| `personal-assistant/src/styles/bitbit-design-system.css` | Modify | P1, P2 |
| `personal-assistant/src/lib/context/mention-extractor.ts` | Modify | P1 |
| `supabase/migrations/060_add_read_state.sql` | **New** | P1 |

## Appendix B: Category Migration

When deploying the new category taxonomy, existing messages need migration:

```sql
-- One-time migration: map old categories to new
UPDATE channel_messages
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb),
  '{category}',
  CASE
    WHEN metadata->>'category' = 'actionable' THEN '"priority"'::jsonb
    WHEN metadata->>'category' = 'personal' THEN '"priority"'::jsonb
    WHEN metadata->>'category' = 'informational' THEN '"updates"'::jsonb
    WHEN metadata->>'category' = 'spam' THEN '"spam"'::jsonb
    ELSE '"updates"'::jsonb
  END
)
WHERE metadata->>'category' IN ('actionable', 'informational', 'personal', 'spam');
```

## Appendix C: Snooze Implementation

Snooze requires a scheduled check to "un-snooze" messages when the time arrives.

**Storage**: `channel_messages.metadata.snoozed_until` (ISO timestamp)

**Un-snooze mechanism**: The existing Cloudflare Edge Cron worker (`bitbit-edge-cron.bitbit-edge.workers.dev`, runs every 5 minutes) adds a new check:

```typescript
// In cron handler
const { data: snoozed } = await supabase
  .from('channel_messages')
  .select('id, org_id')
  .lte('metadata->>snoozed_until', new Date().toISOString())
  .not('metadata->>snoozed_until', 'is', null);

for (const msg of snoozed ?? []) {
  await supabase
    .from('channel_messages')
    .update({
      read_at: null, // Mark as unread again
      metadata: supabase.rpc('jsonb_remove_key', { target: msg.id, key: 'snoozed_until' }),
    })
    .eq('id', msg.id);
}
```

**Snooze picker options:**
- Later today (3 hours from now, or 6 PM if after 3 PM)
- Tomorrow morning (9 AM next day)
- Tomorrow afternoon (2 PM next day)
- Next week (Monday 9 AM)
- Custom date and time (date picker + time picker)

---

*End of document. This specification is complete and self-contained for implementation.*
