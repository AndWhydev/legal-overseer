# Inbox Detail Drawer — Redesign Spec

## Summary

Redesign the inbox detail drawer from a chrome-heavy, decision-laden panel into a minimal, AI-first interface where BitBit abstracts complexity and the user just flows. One decision per interaction: delegate to BitBit or handle it yourself.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Channel scope | Email + Messaging only (Gmail, Outlook, iMessage, WhatsApp, Slack, Facebook, Instagram) | Notification channels (Stripe, Asana, etc.) get read-only view, no composer |
| Thread rendering | Channel-adaptive — email gets collapsible cards, chat gets bubble layout | Forcing one pattern onto both always feels wrong |
| Email composer | Standard — To/CC/BCC (collapsible), basic formatting (B/I/link/list), attachments, reply/reply-all/forward | Chat channels get simple text input + media upload |
| AI triage | Full triage assistant — but radically consolidated | One sentence summary + "Let BitBit Handle" / "I'll reply" — no action menu |
| Architecture | Composition — thin shell + channel renderers + shared parts | Each file focused (~150-300 lines), testable, channel renderers evolve independently |

## Architecture

### File Structure

```
src/components/dashboard/
  inbox-drawer.tsx              ← shell: layout orchestration + useDrawerState hook
  inbox-drawer-identity.tsx     ← merged identity row (avatar + name + subject + time + close)
  inbox-drawer-triage.tsx       ← AI triage panel (summary + Handle/Reply + post-delegation state)
  inbox-drawer-email-thread.tsx ← collapsible card thread for email channels
  inbox-drawer-chat-thread.tsx  ← bubble layout for iMessage/WhatsApp/Slack/FB/IG
  inbox-drawer-email-composer.tsx ← To/CC/BCC, formatting toolbar, attachments (progressive disclosure)
  inbox-drawer-chat-composer.tsx  ← pill-shaped input + media upload + send
  inbox-drawer-actions.tsx      ← subtle bottom action links (Done/Archive/Forward/Spam)
  use-drawer-state.ts           ← hook: reply mode, draft text, attachments, CC/BCC, AI state, delegation
```

### State Hook: `useDrawerState`

Single hook manages all drawer state. Components consume it via context or props from the shell.

```ts
interface DrawerState {
  // Message
  message: InboxMessage
  threadMessages: ThreadMessageItem[]
  
  // Channel detection
  channelFamily: 'email' | 'chat'  // derived from channelType
  
  // Reply mode
  replyMode: 'none' | 'reply' | 'reply-all' | 'forward'
  draftText: string
  attachments: File[]
  ccRecipients: string[]    // email only
  bccRecipients: string[]   // email only
  isComposerFocused: boolean
  
  // AI triage
  triageState: 'idle' | 'loading' | 'ready' | 'delegated'
  triageSummary: string | null
  sentimentDot: 'positive' | 'neutral' | 'negative' | 'urgent'
  delegationActions: DelegationAction[]  // what BitBit did after delegation
  
  // Actions
  setReplyMode: (mode: DrawerState['replyMode']) => void
  setDraftText: (text: string) => void
  addAttachment: (file: File) => void
  removeAttachment: (index: number) => void
  setCc: (recipients: string[]) => void
  setBcc: (recipients: string[]) => void
  setComposerFocused: (focused: boolean) => void
  delegateToBitBit: () => Promise<void>
  undoDelegation: () => void
  sendReply: () => Promise<void>
  markDone: () => void
  archive: () => void
  markSpam: () => void
}

interface DelegationAction {
  type: 'reply_drafted' | 'task_created' | 'reminder_set' | 'project_linked' | 'contact_linked'
  label: string           // human-readable: 'Reply drafted — timeline + domain transfer steps'
  targetId?: string       // ID of created record (task ID, approval ID, etc.)
  targetRoute?: string    // 'approvals' | 'tasks' — for navigation
}
```

## Layout Zones (3 zones, down from 5)

### Zone 1: Identity Row (shrink-0)

Single row combining the old header actions + meta section:

- **Left:** Avatar (with channel icon overlay) + sender name + subject line (email) or phone (chat)
- **Right:** Relative timestamp + close button (✕)
- No badges, no category pills, no thread status — the AI triage handles context

### Zone 2: AI Triage (shrink-0, collapsible)

The intelligence layer. Two states:

**Ready state:**
- ✨ icon + one-sentence summary with **bolded key asks**
- Sentiment dot (colored circle: green/yellow/red)
- Two buttons: "🤖 Let BitBit Handle" (primary) | "I'll reply" (ghost)

**Delegated state (after clicking Handle):**
- 🤖 "BitBit is handling this"
- Checklist of completed actions: ✓ Reply drafted (→ In Approvals), ✓ Task created, ✓ Reminder set, etc.
- Two buttons: "Review Draft →" | "Undo All"

**Chat variant:** Compressed to a single line — summary text + sentiment dot + 🤖 icon button.

### Zone 3: Thread Body (flex-1, scrollable)

The only scrollable area. Adaptive by channel family:

**Email (`channelFamily === 'email'`):**
- Collapsible message cards — older messages collapsed (avatar + name + preview + time)
- Latest message expanded with full body
- Attachments inline below message body (icon + filename + size)
- Click collapsed message to expand

**Chat (`channelFamily === 'chat'`):**
- Left-aligned bubbles (theirs) with rounded corners: `12px 12px 12px 4px`
- Right-aligned bubbles (yours) with: `12px 12px 4px 12px`
- Timestamp + delivery status below each bubble
- Media messages: image thumbnail with filename overlay
- iMessage bubbles use blue tint, WhatsApp uses default

### Zone 4: Composer (shrink-0, progressive disclosure)

**Default state (unfocused):** Single-line input with placeholder "Reply to {name}..." + 📎 attach + ↑ send.

**Focused state (email):** Expands to reveal:
- To: field (pre-filled), CC/BCC toggle links
- Formatting toolbar: B / I / 🔗 / • List
- Multi-line textarea (grows up to 50% drawer height)
- Attached files strip

**Focused state (chat):** Stays simple — pill input grows vertically, media button, send.

### Zone 5: Triage Actions (shrink-0)

Subtle text links below the composer: Done · Archive · Forward · Spam + keyboard shortcut hint (⌘↵ send).

These are de-emphasized because:
1. You act after reading/replying, not before
2. BitBit delegation handles most triage automatically
3. Power users use keyboard shortcuts (D/E/F/!)

## Channel Family Mapping

```ts
const CHANNEL_FAMILY: Record<ChannelType, 'email' | 'chat' | 'notification'> = {
  gmail: 'email',
  outlook: 'email',
  imessage: 'chat',
  whatsapp: 'chat',
  slack: 'chat',
  facebook: 'chat',
  instagram: 'chat',
  // Notification channels — read-only, no composer
  asana: 'notification',
  calendly: 'notification',
  clickup: 'notification',
  stripe: 'notification',
  calendar: 'notification',
  reminders: 'notification',
}
```

Notification channels render: Identity row + AI triage + body content. No composer, no triage actions.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Esc` | Close drawer |
| `j` / `k` | Next / previous message |
| `r` | Focus composer (reply mode) |
| `a` | Reply all (email only) |
| `f` | Forward |
| `d` | Mark done |
| `e` | Archive |
| `!` | Spam |
| `b` | Let BitBit Handle |
| `⌘+Enter` | Send reply |

## AI Triage Implementation

The triage panel calls an existing API route or uses client-side extraction:

1. **Summary:** Extract from `InboxMessage.bodyPreview` + `subject` — highlight key asks with `<strong>` tags
2. **Sentiment:** Derive from message tone keywords → green (positive/neutral), yellow (request/question), red (complaint/urgent)  
3. **Delegation:** On "Let BitBit Handle" click:
   - POST to `/api/agent/triage` with message context
   - BitBit determines: draft reply, create task, set reminder, link to project/contact
   - Reply draft → approval queue (`approval_queue` table)
   - Task → `tasks` table
   - All actions returned as `DelegationAction[]` and displayed in the panel
4. **Undo:** Rolls back all created records in one batch

## Styling

- Matches sidebar: no borders, `bg-sidebar` background, `text-sidebar-foreground` text
- No divider lines between zones — spacing alone creates separation
- Drawer container in `drawer-slot.tsx`: no border, rounded-lg, shadow-sm only
- AI triage panel: `bg-purple-500/5` with no border
- Sentiment dot: 7-8px circle, positioned after summary text
- Action links at bottom: `text-sidebar-foreground/20` default, brighten on hover
- Chat bubbles: theirs = `bg-white/7`, yours = `bg-indigo-500/20` (email) or `bg-blue-500/25` (iMessage)

## Mobile (Sheet variant)

On mobile, the drawer renders as a full-screen Sheet from the right. Same component tree — the shell detects mobile via `useIsMobile()` and the DrawerSlot already handles the Sheet wrapper. No changes needed to the drawer internals.

## Out of Scope

- Rich text editor (contentEditable) — plain textarea with markdown-style formatting for v1
- Inline image preview in composer — file chips only
- Voice message playback — display as attachment
- Read receipts / typing indicators — data not yet available from channel adapters
- Scheduled send — future enhancement
- Email signature insertion — future enhancement
