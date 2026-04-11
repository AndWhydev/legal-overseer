# Inbox Drawer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the chrome-heavy inbox detail drawer with a minimal, AI-first interface: identity row → triage summary → thread → composer → subtle actions.

**Architecture:** Composition pattern — thin shell (`inbox-drawer.tsx`) orchestrates focused sub-components. Channel-adaptive rendering: email gets collapsible card threads + standard composer, chat gets bubble threads + simple input. All state managed by a single `useDrawerState` hook.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Tabler Icons, existing Supabase client, existing avatar resolver.

**Spec:** `docs/superpowers/specs/2026-04-04-inbox-drawer-redesign.md`

---

## File Map

```
src/components/dashboard/
  inbox-drawer.tsx                  ← REWRITE: thin shell, layout orchestration
  inbox-drawer-identity.tsx         ← CREATE: avatar + name + subject + time + close
  inbox-drawer-triage.tsx           ← CREATE: AI summary + Handle/Reply + delegated state
  inbox-drawer-email-thread.tsx     ← CREATE: collapsible card thread for email
  inbox-drawer-chat-thread.tsx      ← CREATE: bubble layout for chat channels
  inbox-drawer-email-composer.tsx   ← CREATE: To/CC/BCC, formatting, attachments
  inbox-drawer-chat-composer.tsx    ← CREATE: pill input + media + send
  inbox-drawer-actions.tsx          ← CREATE: subtle bottom action links
  use-drawer-state.ts               ← CREATE: consolidated state hook

src/components/dashboard/tabs/
  inbox-tab.tsx                     ← MODIFY: update drawer invocation (props changed)
```

---

### Task 1: Create the shared types and channel family mapping

**Files:**
- Create: `src/components/dashboard/use-drawer-state.ts`

This task creates the types and the channel family helper. The hook itself comes in Task 2.

- [ ] **Step 1: Write the type definitions and channel mapping**

```ts
// src/components/dashboard/use-drawer-state.ts
'use client'

import { useState, useCallback, useRef, useEffect } from 'react'

// --- Shared Types ---

export type MessageCategory = 'action_required' | 'fyi' | 'conversation' | 'automated' | 'marketing' | 'spam'
export type ThreadStatus = 'waiting_on_you' | 'waiting_on_them' | 'resolved' | 'new'
export type ChannelFamily = 'email' | 'chat' | 'notification'
export type SentimentDot = 'positive' | 'neutral' | 'negative' | 'urgent'
export type ReplyMode = 'none' | 'reply' | 'reply-all' | 'forward'
export type TriageState = 'idle' | 'loading' | 'ready' | 'delegated'

export interface InboxMessage {
  id: string
  channelType: string
  senderName: string | null
  senderEmail: string | null
  subject: string | null
  bodyPreview: string
  fullBody?: string
  aiSummary?: string | null
  category: MessageCategory
  priority: string
  significance: number
  contactId: string | null
  contactName: string | null
  threadStatus: ThreadStatus | null
  threadCount?: number
  deduplicatedWith: string | null
  receivedAt: string
  processedAt: string | null
  status: string
}

export interface ThreadMessageItem {
  id: string
  senderName: string
  receivedAt: string
  bodyPreview: string
  isLatest?: boolean
  isSelf?: boolean
  attachments?: AttachmentItem[]
}

export interface AttachmentItem {
  name: string
  size: string
  type: 'pdf' | 'image' | 'document' | 'other'
}

export interface DelegationAction {
  type: 'reply_drafted' | 'task_created' | 'reminder_set' | 'project_linked' | 'contact_linked'
  label: string
  targetId?: string
  targetRoute?: string
}

const CHANNEL_FAMILY: Record<string, ChannelFamily> = {
  gmail: 'email',
  outlook: 'email',
  imessage: 'chat',
  whatsapp: 'chat',
  slack: 'chat',
  facebook: 'chat',
  instagram: 'chat',
  asana: 'notification',
  calendly: 'notification',
  clickup: 'notification',
  stripe: 'notification',
  calendar: 'notification',
  reminders: 'notification',
}

export function getChannelFamily(channelType: string): ChannelFamily {
  return CHANNEL_FAMILY[channelType] ?? 'notification'
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit 2>&1 | grep use-drawer-state`
Expected: No output (no errors in our file)

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/use-drawer-state.ts
git commit -m "feat(inbox-drawer): add shared types and channel family mapping"
```

---

### Task 2: Implement the useDrawerState hook

**Files:**
- Modify: `src/components/dashboard/use-drawer-state.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/components/dashboard/use-drawer-state.test.ts
import { describe, it, expect } from 'vitest'
import { getChannelFamily } from './use-drawer-state'

describe('getChannelFamily', () => {
  it('maps gmail to email', () => {
    expect(getChannelFamily('gmail')).toBe('email')
  })
  it('maps outlook to email', () => {
    expect(getChannelFamily('outlook')).toBe('email')
  })
  it('maps imessage to chat', () => {
    expect(getChannelFamily('imessage')).toBe('chat')
  })
  it('maps whatsapp to chat', () => {
    expect(getChannelFamily('whatsapp')).toBe('chat')
  })
  it('maps slack to chat', () => {
    expect(getChannelFamily('slack')).toBe('chat')
  })
  it('maps stripe to notification', () => {
    expect(getChannelFamily('stripe')).toBe('notification')
  })
  it('defaults unknown to notification', () => {
    expect(getChannelFamily('unknown')).toBe('notification')
  })
})
```

- [ ] **Step 2: Run test to verify it passes** (function already exists from Task 1)

Run: `cd /home/claude/bitbit/personal-assistant && npx vitest run src/components/dashboard/use-drawer-state.test.ts`
Expected: All 7 tests pass

- [ ] **Step 3: Add the hook to use-drawer-state.ts**

Append to `src/components/dashboard/use-drawer-state.ts`:

```ts
// --- Triage Helpers ---

function extractSummary(message: InboxMessage): { summary: string; sentiment: SentimentDot } {
  const text = (message.subject || '') + ' ' + message.bodyPreview
  const summary = message.aiSummary || message.bodyPreview.slice(0, 140).trim() + (message.bodyPreview.length > 140 ? '...' : '')

  let sentiment: SentimentDot = 'neutral'
  if (/urgent|asap|critical|error|crash|blocked|overdue/i.test(text)) sentiment = 'urgent'
  else if (/angry|disappointed|frustrated|complaint|unacceptable/i.test(text)) sentiment = 'negative'
  else if (/thanks|great|happy|pleased|appreciate|love/i.test(text)) sentiment = 'positive'

  return { summary, sentiment }
}

// --- Hook ---

export interface DrawerState {
  message: InboxMessage
  threadMessages: ThreadMessageItem[]
  channelFamily: ChannelFamily

  replyMode: ReplyMode
  draftText: string
  attachments: File[]
  ccRecipients: string[]
  bccRecipients: string[]
  isComposerFocused: boolean

  triageState: TriageState
  triageSummary: string
  sentimentDot: SentimentDot
  delegationActions: DelegationAction[]

  setReplyMode: (mode: ReplyMode) => void
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
  close: () => void
  navigate: (direction: 'prev' | 'next') => void
}

export function useDrawerState(
  message: InboxMessage,
  threadMessages: ThreadMessageItem[],
  callbacks: {
    onClose: () => void
    onArchive: (id: string) => void
    onDone: (id: string) => void
    onReply: (id: string, body: string) => void
    onNavigate: (direction: 'prev' | 'next') => void
  },
): DrawerState {
  const channelFamily = getChannelFamily(message.channelType)
  const { summary: triageSummary, sentiment: sentimentDot } = extractSummary(message)

  const [replyMode, setReplyMode] = useState<ReplyMode>('none')
  const [draftText, setDraftText] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [ccRecipients, setCc] = useState<string[]>([])
  const [bccRecipients, setBcc] = useState<string[]>([])
  const [isComposerFocused, setComposerFocused] = useState(false)
  const [triageState, setTriageState] = useState<TriageState>('ready')
  const [delegationActions, setDelegationActions] = useState<DelegationAction[]>([])

  // Reset state when message changes
  const prevIdRef = useRef(message.id)
  useEffect(() => {
    if (prevIdRef.current !== message.id) {
      prevIdRef.current = message.id
      setReplyMode('none')
      setDraftText('')
      setAttachments([])
      setCc([])
      setBcc([])
      setComposerFocused(false)
      setTriageState('ready')
      setDelegationActions([])
    }
  }, [message.id])

  const addAttachment = useCallback((file: File) => {
    setAttachments(prev => [...prev, file])
  }, [])

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }, [])

  const delegateToBitBit = useCallback(async () => {
    setTriageState('loading')
    try {
      const res = await fetch('/api/agent/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: message.id, channelType: message.channelType }),
      })
      if (res.ok) {
        const data = await res.json()
        setDelegationActions(data.actions ?? [])
      } else {
        // Fallback: show generic delegation
        setDelegationActions([
          { type: 'reply_drafted', label: 'Reply drafted', targetRoute: 'approvals' },
        ])
      }
    } catch {
      setDelegationActions([
        { type: 'reply_drafted', label: 'Reply drafted', targetRoute: 'approvals' },
      ])
    }
    setTriageState('delegated')
  }, [message.id, message.channelType])

  const undoDelegation = useCallback(() => {
    setTriageState('ready')
    setDelegationActions([])
    // TODO: call undo API when available
  }, [])

  const sendReply = useCallback(async () => {
    if (draftText.trim()) {
      callbacks.onReply(message.id, draftText)
      setDraftText('')
      setAttachments([])
      setReplyMode('none')
      setComposerFocused(false)
    }
  }, [draftText, message.id, callbacks])

  const markDone = useCallback(() => callbacks.onDone(message.id), [message.id, callbacks])
  const archive = useCallback(() => callbacks.onArchive(message.id), [message.id, callbacks])
  const markSpam = useCallback(() => {
    // Use archive as proxy for spam for now
    callbacks.onArchive(message.id)
  }, [message.id, callbacks])
  const close = useCallback(() => callbacks.onClose(), [callbacks])
  const navigate = useCallback((dir: 'prev' | 'next') => callbacks.onNavigate(dir), [callbacks])

  return {
    message,
    threadMessages,
    channelFamily,
    replyMode, draftText, attachments, ccRecipients, bccRecipients, isComposerFocused,
    triageState, triageSummary, sentimentDot, delegationActions,
    setReplyMode, setDraftText, addAttachment, removeAttachment, setCc, setBcc,
    setComposerFocused, delegateToBitBit, undoDelegation, sendReply,
    markDone, archive, markSpam, close, navigate,
  }
}
```

- [ ] **Step 4: Verify types compile**

Run: `cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit 2>&1 | grep use-drawer-state`
Expected: No output

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/use-drawer-state.ts src/components/dashboard/use-drawer-state.test.ts
git commit -m "feat(inbox-drawer): implement useDrawerState hook with triage + compose state"
```

---

### Task 3: Create the Identity Row component

**Files:**
- Create: `src/components/dashboard/inbox-drawer-identity.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/dashboard/inbox-drawer-identity.tsx
'use client'

import { IconX } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { resolveAvatarSync, resolveAvatar, type AvatarResult } from '@/lib/avatar/resolver'
import { useState, useEffect } from 'react'
import type { InboxMessage, ChannelFamily } from './use-drawer-state'

// Channel icon SVGs — inlined for zero-dependency rendering
function GmailIcon() {
  return <svg width={9} height={9} viewBox="0 0 24 24" fill="currentColor"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
}
function OutlookIcon() {
  return <svg width={9} height={9} viewBox="0 0 24 24" fill="currentColor"><path d="M24 7.387v10.478c0 .23-.08.424-.238.576a.806.806 0 01-.588.236h-8.108v-8.07l2.727 1.903.312.125a.39.39 0 00.32-.118l.61-.595a.39.39 0 00.124-.3.4.4 0 00-.164-.32L15.2 8.417h7.974c.234 0 .434.082.59.23.157.148.236.344.236.58v.16z"/></svg>
}
function WhatsAppIcon() {
  return <svg width={9} height={9} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
}
function IMessageIcon() {
  return <svg width={9} height={9} viewBox="0 0 24 24" fill="currentColor"><path d="M11.916 0C5.335 0 0 4.434 0 9.904c0 3.098 1.746 5.862 4.479 7.63l-.727 2.905a.5.5 0 00.726.543l3.546-2.012c1.224.365 2.534.566 3.892.566 6.581 0 11.916-4.434 11.916-9.904-.004-5.466-5.339-9.632-11.916-9.632z"/></svg>
}
function SlackIcon() {
  return <svg width={9} height={9} viewBox="0 0 24 24" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313z"/></svg>
}

const CHANNEL_ICON: Record<string, React.FC> = {
  gmail: GmailIcon,
  outlook: OutlookIcon,
  whatsapp: WhatsAppIcon,
  imessage: IMessageIcon,
  slack: SlackIcon,
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

interface IdentityRowProps {
  message: InboxMessage
  channelFamily: ChannelFamily
  onClose: () => void
}

export function InboxDrawerIdentity({ message, channelFamily, onClose }: IdentityRowProps) {
  const senderDisplay = message.contactName || message.senderName || message.senderEmail || 'Unknown'
  const email = message.senderEmail ?? null
  const syncAvatar = resolveAvatarSync(senderDisplay, email)
  const [avatar, setAvatar] = useState<AvatarResult>(syncAvatar)

  useEffect(() => {
    if (!email && !senderDisplay) return
    let cancelled = false
    resolveAvatar(email, senderDisplay, null).then(r => { if (!cancelled) setAvatar(r) })
    return () => { cancelled = true }
  }, [email, senderDisplay])

  const ChannelIcon = CHANNEL_ICON[message.channelType]
  const subtitle = channelFamily === 'email'
    ? message.subject
    : message.senderEmail || message.senderName || null

  return (
    <div className="flex items-center gap-3 px-5 py-3.5 shrink-0">
      {/* Avatar with channel icon */}
      <div className="relative shrink-0">
        <Avatar size="default">
          {avatar?.url && <AvatarImage src={avatar.url} alt={senderDisplay} />}
          <AvatarFallback>{senderDisplay[0]?.toUpperCase() || '?'}</AvatarFallback>
        </Avatar>
        {ChannelIcon && (
          <div className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-sidebar text-sidebar-foreground/70">
            <ChannelIcon />
          </div>
        )}
      </div>

      {/* Name + subtitle */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate text-sidebar-foreground">
          {senderDisplay}
        </div>
        {subtitle && (
          <div className="text-xs text-sidebar-foreground/40 truncate mt-0.5">
            {subtitle}
          </div>
        )}
      </div>

      {/* Time + close */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-sidebar-foreground/25">
          {formatTimeAgo(message.receivedAt)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close drawer"
          className="text-sidebar-foreground/35 hover:text-sidebar-foreground/70"
        >
          <IconX className="size-4" />
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit 2>&1 | grep inbox-drawer-identity`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/inbox-drawer-identity.tsx
git commit -m "feat(inbox-drawer): add identity row component"
```

---

### Task 4: Create the AI Triage panel

**Files:**
- Create: `src/components/dashboard/inbox-drawer-triage.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/dashboard/inbox-drawer-triage.tsx
'use client'

import { IconSparkles, IconRobot } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import type { TriageState, SentimentDot, DelegationAction } from './use-drawer-state'

const SENTIMENT_COLORS: Record<SentimentDot, string> = {
  positive: 'bg-green-400',
  neutral: 'bg-zinc-400',
  negative: 'bg-red-400',
  urgent: 'bg-amber-400',
}

interface TriagePanelProps {
  summary: string
  sentiment: SentimentDot
  triageState: TriageState
  delegationActions: DelegationAction[]
  compact?: boolean // true for chat channels
  onDelegate: () => void
  onUndoDelegate: () => void
  onReplyManually: () => void
}

function ReadyState({
  summary,
  sentiment,
  compact,
  onDelegate,
  onReplyManually,
}: Pick<TriagePanelProps, 'summary' | 'sentiment' | 'compact' | 'onDelegate' | 'onReplyManually'>) {
  if (compact) {
    return (
      <div className="mx-3.5 mb-2 flex items-center gap-2 rounded-lg bg-purple-500/5 px-3 py-2 shrink-0">
        <IconSparkles className="size-3.5 text-purple-400/80 shrink-0" />
        <span className="flex-1 text-xs text-sidebar-foreground/45 truncate">{summary}</span>
        <span className={`size-1.5 rounded-full shrink-0 ${SENTIMENT_COLORS[sentiment]}`} />
        <button
          onClick={onDelegate}
          className="shrink-0 rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-400/80 hover:bg-blue-500/20 transition-colors"
        >
          🤖
        </button>
      </div>
    )
  }

  return (
    <div className="mx-3.5 mb-2 rounded-lg bg-purple-500/5 px-3.5 py-3 shrink-0">
      <div className="flex items-start gap-2 mb-2.5">
        <IconSparkles className="size-3.5 text-purple-400/80 shrink-0 mt-0.5" />
        <p className="flex-1 text-xs text-sidebar-foreground/50 leading-relaxed [&_strong]:text-sidebar-foreground/70">
          {summary}
        </p>
        <span className={`size-2 rounded-full shrink-0 mt-1 ${SENTIMENT_COLORS[sentiment]}`} />
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="xs"
          className="bg-blue-500/10 text-blue-400/90 hover:bg-blue-500/20 font-medium"
          onClick={onDelegate}
        >
          <IconRobot className="size-3" data-icon="inline-start" />
          Let BitBit Handle
        </Button>
        <span className="text-[10px] text-sidebar-foreground/20">or</span>
        <Button
          variant="ghost"
          size="xs"
          className="text-sidebar-foreground/40 hover:text-sidebar-foreground/60"
          onClick={onReplyManually}
        >
          I'll reply
        </Button>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="mx-3.5 mb-2 rounded-lg bg-blue-500/5 px-3.5 py-3 shrink-0">
      <div className="flex items-center gap-2">
        <IconRobot className="size-3.5 text-blue-400/80 animate-pulse" />
        <span className="text-xs text-blue-400/70">BitBit is thinking...</span>
      </div>
    </div>
  )
}

function DelegatedState({
  delegationActions,
  onUndo,
}: {
  delegationActions: DelegationAction[]
  onUndo: () => void
}) {
  return (
    <div className="mx-3.5 mb-2 rounded-lg bg-blue-500/5 px-3.5 py-3 shrink-0">
      <div className="flex items-center gap-2 mb-2">
        <IconRobot className="size-3.5 text-blue-400/80" />
        <span className="text-xs font-medium text-blue-400/90">BitBit is handling this</span>
      </div>
      <div className="flex flex-col gap-1.5 pl-1 mb-3">
        {delegationActions.map((action, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="text-green-400/80">✓</span>
            <span className="text-sidebar-foreground/50">{action.label}</span>
            {action.targetRoute === 'approvals' && (
              <span className="ml-auto text-[10px] rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-400/80">
                In Approvals
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="xs"
          className="bg-blue-500/10 text-blue-400/90 hover:bg-blue-500/20"
        >
          Review Draft →
        </Button>
        <Button
          variant="ghost"
          size="xs"
          className="text-sidebar-foreground/35 hover:text-sidebar-foreground/60"
          onClick={onUndo}
        >
          Undo All
        </Button>
      </div>
    </div>
  )
}

export function InboxDrawerTriage(props: TriagePanelProps) {
  switch (props.triageState) {
    case 'loading':
      return <LoadingState />
    case 'delegated':
      return <DelegatedState delegationActions={props.delegationActions} onUndo={props.onUndoDelegate} />
    default:
      return <ReadyState {...props} />
  }
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit 2>&1 | grep inbox-drawer-triage`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/inbox-drawer-triage.tsx
git commit -m "feat(inbox-drawer): add AI triage panel with ready/loading/delegated states"
```

---

### Task 5: Create the Email Thread view

**Files:**
- Create: `src/components/dashboard/inbox-drawer-email-thread.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/dashboard/inbox-drawer-email-thread.tsx
'use client'

import { useState } from 'react'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { ThreadMessageItem, AttachmentItem } from './use-drawer-state'

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

const ATTACHMENT_ICONS: Record<AttachmentItem['type'], string> = {
  pdf: '📄',
  image: '🖼',
  document: '📝',
  other: '📎',
}

function AttachmentChip({ attachment }: { attachment: AttachmentItem }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md bg-sidebar-foreground/[0.03] px-2.5 py-1.5">
      <span className="text-sm">{ATTACHMENT_ICONS[attachment.type]}</span>
      <span className="text-[11px] text-sidebar-foreground/45">{attachment.name}</span>
      <span className="text-[9px] text-sidebar-foreground/20">{attachment.size}</span>
    </div>
  )
}

interface EmailThreadProps {
  messages: ThreadMessageItem[]
}

export function EmailThreadView({ messages }: EmailThreadProps) {
  const latestId = messages[messages.length - 1]?.id
  const [expanded, setExpanded] = useState<Set<string>>(new Set(latestId ? [latestId] : []))

  if (!messages.length) {
    return <p className="text-sm text-sidebar-foreground/30 italic px-5">No messages</p>
  }

  const toggle = (id: string) => {
    setExpanded(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  return (
    <div className="flex flex-col gap-1 px-5 py-3">
      {messages.length > 1 && (
        <span className="text-[10px] uppercase tracking-widest text-sidebar-foreground/25 mb-1">
          {messages.length} messages
        </span>
      )}

      {messages.map(msg => {
        const isLatest = msg.id === latestId
        const isOpen = expanded.has(msg.id)
        const name = msg.isSelf ? 'You' : (msg.senderName || 'Unknown')

        return (
          <div
            key={msg.id}
            className="rounded-lg bg-sidebar-foreground/[0.02]"
          >
            {/* Header row — always visible */}
            <div
              className={`flex items-center gap-2 px-2.5 py-2 ${isLatest ? '' : 'cursor-pointer'} select-none`}
              onClick={() => !isLatest && toggle(msg.id)}
            >
              <Avatar size="xs">
                <AvatarFallback className={msg.isSelf ? 'bg-primary/20 text-primary text-[9px]' : 'text-[9px]'}>
                  {name[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>

              <span className="text-[11px] font-medium text-sidebar-foreground/60 shrink-0">
                {name}
              </span>

              {!isOpen && (
                <span className="text-[10px] text-sidebar-foreground/25 flex-1 truncate">
                  {msg.bodyPreview.slice(0, 70)}
                </span>
              )}

              <span className="text-[9px] text-sidebar-foreground/20 shrink-0 ml-auto">
                {formatTimeAgo(msg.receivedAt)}
              </span>

              {!isLatest && (
                <span className="text-sidebar-foreground/20 shrink-0">
                  {isOpen ? <IconChevronDown className="size-3" /> : <IconChevronRight className="size-3" />}
                </span>
              )}
            </div>

            {/* Body — expanded */}
            {isOpen && (
              <div className="px-2.5 pb-3 pl-9">
                <div className="text-[12px] text-sidebar-foreground/50 leading-relaxed whitespace-pre-wrap break-words">
                  {msg.bodyPreview}
                </div>

                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex gap-1.5 mt-2.5 flex-wrap">
                    {msg.attachments.map((a, i) => (
                      <AttachmentChip key={i} attachment={a} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit 2>&1 | grep inbox-drawer-email`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/inbox-drawer-email-thread.tsx
git commit -m "feat(inbox-drawer): add email thread view with collapsible cards + attachments"
```

---

### Task 6: Create the Chat Thread view

**Files:**
- Create: `src/components/dashboard/inbox-drawer-chat-thread.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/dashboard/inbox-drawer-chat-thread.tsx
'use client'

import type { ThreadMessageItem, AttachmentItem } from './use-drawer-state'

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

const BUBBLE_COLORS: Record<string, string> = {
  imessage: 'bg-blue-500/25',
  whatsapp: 'bg-indigo-500/20',
  default: 'bg-indigo-500/20',
}

interface ChatThreadProps {
  messages: ThreadMessageItem[]
  channelType: string
}

export function ChatThreadView({ messages, channelType }: ChatThreadProps) {
  const selfBubble = BUBBLE_COLORS[channelType] || BUBBLE_COLORS.default

  if (!messages.length) {
    return <p className="text-sm text-sidebar-foreground/30 italic px-5">No messages</p>
  }

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      {messages.map(msg => {
        const isSelf = msg.isSelf ?? false
        const hasMedia = msg.attachments && msg.attachments.length > 0

        return (
          <div
            key={msg.id}
            className={`flex max-w-[85%] ${isSelf ? 'self-end' : 'self-start'}`}
          >
            <div>
              {/* Media attachments */}
              {hasMedia && msg.attachments!.filter(a => a.type === 'image').map((a, i) => (
                <div
                  key={i}
                  className={`mb-1 rounded-xl overflow-hidden ${isSelf ? 'rounded-br-sm' : 'rounded-bl-sm'} bg-sidebar-foreground/[0.05]`}
                >
                  <div className="w-44 h-24 bg-gradient-to-br from-indigo-500/15 to-purple-500/10 flex items-center justify-center text-lg">
                    🖼
                  </div>
                  <div className="px-2.5 py-1.5 text-[10px] text-sidebar-foreground/40">
                    {a.name}
                  </div>
                </div>
              ))}

              {/* Text bubble */}
              {msg.bodyPreview && (
                <div
                  className={`px-3 py-2 text-xs leading-relaxed ${
                    isSelf
                      ? `${selfBubble} text-sidebar-foreground/80 rounded-xl rounded-br-sm`
                      : 'bg-sidebar-foreground/[0.06] text-sidebar-foreground/65 rounded-xl rounded-bl-sm'
                  }`}
                >
                  {msg.bodyPreview}
                  <div className={`text-[9px] mt-1 text-right ${
                    isSelf ? 'text-sidebar-foreground/30' : 'text-sidebar-foreground/20'
                  }`}>
                    {formatTime(msg.receivedAt)}
                  </div>
                </div>
              )}

              {/* Non-image attachments */}
              {hasMedia && msg.attachments!.filter(a => a.type !== 'image').map((a, i) => (
                <div key={i} className="mt-1 flex items-center gap-1.5 rounded-md bg-sidebar-foreground/[0.03] px-2.5 py-1.5 text-[10px] text-sidebar-foreground/40">
                  📎 {a.name} · {a.size}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit 2>&1 | grep inbox-drawer-chat`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/inbox-drawer-chat-thread.tsx
git commit -m "feat(inbox-drawer): add chat thread view with bubble layout"
```

---

### Task 7: Create the Email Composer

**Files:**
- Create: `src/components/dashboard/inbox-drawer-email-composer.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/dashboard/inbox-drawer-email-composer.tsx
'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import { IconPaperclip, IconSend, IconBold, IconItalic, IconLink, IconList, IconX } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import type { ReplyMode } from './use-drawer-state'

interface EmailComposerProps {
  recipientName: string
  recipientEmail: string | null
  replyMode: ReplyMode
  draftText: string
  attachments: File[]
  ccRecipients: string[]
  bccRecipients: string[]
  isComposerFocused: boolean
  onDraftChange: (text: string) => void
  onAddAttachment: (file: File) => void
  onRemoveAttachment: (index: number) => void
  onCcChange: (recipients: string[]) => void
  onBccChange: (recipients: string[]) => void
  onFocusChange: (focused: boolean) => void
  onSend: () => void
}

export function EmailComposer({
  recipientName,
  recipientEmail,
  replyMode,
  draftText,
  attachments,
  ccRecipients,
  bccRecipients,
  isComposerFocused,
  onDraftChange,
  onAddAttachment,
  onRemoveAttachment,
  onCcChange,
  onBccChange,
  onFocusChange,
  onSend,
}: EmailComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showCc, setShowCc] = useState(ccRecipients.length > 0)
  const [showBcc, setShowBcc] = useState(bccRecipients.length > 0)

  // Expose focus method via ref
  useEffect(() => {
    if (replyMode !== 'none' && textareaRef.current && !isComposerFocused) {
      textareaRef.current.focus()
      onFocusChange(true)
    }
  }, [replyMode])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      onSend()
    }
  }, [onSend])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      Array.from(files).forEach(f => onAddAttachment(f))
    }
    e.target.value = ''
  }, [onAddAttachment])

  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 300) + 'px'
  }, [])

  return (
    <div className="shrink-0 px-4 pb-2">
      {/* Collapsed state */}
      {!isComposerFocused && replyMode === 'none' ? (
        <div
          className="flex items-center gap-2 cursor-text"
          onClick={() => { onFocusChange(true); textareaRef.current?.focus() }}
        >
          <div className="flex-1 rounded-xl bg-sidebar-foreground/[0.04] px-3.5 py-2.5 text-xs text-sidebar-foreground/30">
            Reply to {recipientName}...
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-sidebar-foreground/25"
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
          >
            <IconPaperclip className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="bg-indigo-500/15 text-indigo-400/50"
            disabled
          >
            <IconSend className="size-3.5" />
          </Button>
        </div>
      ) : (
        /* Expanded state */
        <div className="flex flex-col gap-1.5">
          {/* To / CC / BCC row */}
          <div className="flex items-center gap-2 text-[11px] text-sidebar-foreground/35 px-1">
            <span>To: {recipientEmail || recipientName}</span>
            <span className="ml-auto flex gap-2">
              {!showCc && <button onClick={() => setShowCc(true)} className="hover:text-sidebar-foreground/60">CC</button>}
              {!showBcc && <button onClick={() => setShowBcc(true)} className="hover:text-sidebar-foreground/60">BCC</button>}
            </span>
          </div>

          {showCc && (
            <input
              className="rounded-md bg-sidebar-foreground/[0.03] px-2.5 py-1.5 text-[11px] text-sidebar-foreground/60 outline-none placeholder:text-sidebar-foreground/25"
              placeholder="CC: email addresses..."
              value={ccRecipients.join(', ')}
              onChange={e => onCcChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            />
          )}

          {showBcc && (
            <input
              className="rounded-md bg-sidebar-foreground/[0.03] px-2.5 py-1.5 text-[11px] text-sidebar-foreground/60 outline-none placeholder:text-sidebar-foreground/25"
              placeholder="BCC: email addresses..."
              value={bccRecipients.join(', ')}
              onChange={e => onBccChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            />
          )}

          {/* Formatting toolbar */}
          <div className="flex gap-0.5 px-0.5">
            {[
              { icon: IconBold, label: 'Bold' },
              { icon: IconItalic, label: 'Italic' },
              { icon: IconLink, label: 'Link' },
              { icon: IconList, label: 'List' },
            ].map(({ icon: Icon, label }) => (
              <button
                key={label}
                className="rounded p-1 text-sidebar-foreground/25 hover:text-sidebar-foreground/50 hover:bg-sidebar-foreground/[0.04]"
                title={label}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
            <button
              className="ml-auto rounded p-1 text-sidebar-foreground/25 hover:text-sidebar-foreground/50"
              onClick={() => fileInputRef.current?.click()}
            >
              <IconPaperclip className="size-3.5" />
            </button>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={draftText}
            onChange={e => { onDraftChange(e.target.value); autoResize(e.target) }}
            onKeyDown={handleKeyDown}
            onFocus={() => onFocusChange(true)}
            placeholder={`Reply to ${recipientName}...`}
            className="min-h-16 max-h-[300px] w-full resize-none rounded-lg bg-sidebar-foreground/[0.04] px-3 py-2.5 text-xs leading-relaxed text-sidebar-foreground/70 outline-none placeholder:text-sidebar-foreground/25"
          />

          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {attachments.map((file, i) => (
                <div key={i} className="flex items-center gap-1 rounded-md bg-sidebar-foreground/[0.04] px-2 py-1 text-[10px] text-sidebar-foreground/45">
                  📎 {file.name}
                  <button onClick={() => onRemoveAttachment(i)} className="text-sidebar-foreground/25 hover:text-sidebar-foreground/60">
                    <IconX className="size-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Send row */}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="xs"
              className="bg-indigo-500/15 text-indigo-400/80 hover:bg-indigo-500/25"
              onClick={onSend}
              disabled={!draftText.trim()}
            >
              <IconSend className="size-3" data-icon="inline-start" />
              Send
            </Button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit 2>&1 | grep inbox-drawer-email-composer`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/inbox-drawer-email-composer.tsx
git commit -m "feat(inbox-drawer): add email composer with progressive disclosure"
```

---

### Task 8: Create the Chat Composer

**Files:**
- Create: `src/components/dashboard/inbox-drawer-chat-composer.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/dashboard/inbox-drawer-chat-composer.tsx
'use client'

import { useRef, useCallback } from 'react'
import { IconPaperclip, IconArrowUp } from '@tabler/icons-react'

interface ChatComposerProps {
  recipientName: string
  draftText: string
  onDraftChange: (text: string) => void
  onAddAttachment: (file: File) => void
  onSend: () => void
  onFocusChange: (focused: boolean) => void
}

export function ChatComposer({
  recipientName,
  draftText,
  onDraftChange,
  onAddAttachment,
  onSend,
  onFocusChange,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      onSend()
    }
  }, [onSend])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) Array.from(files).forEach(f => onAddAttachment(f))
    e.target.value = ''
  }, [onAddAttachment])

  return (
    <div className="shrink-0 px-3.5 pb-3 flex items-end gap-2">
      <button
        className="rounded-full bg-sidebar-foreground/[0.04] p-2 text-sidebar-foreground/30 hover:text-sidebar-foreground/50 shrink-0"
        onClick={() => fileInputRef.current?.click()}
      >
        <IconPaperclip className="size-3.5" />
      </button>

      <div className="flex-1 min-h-9 rounded-2xl bg-sidebar-foreground/[0.04] px-3.5 py-2 flex items-center">
        <textarea
          ref={textareaRef}
          value={draftText}
          onChange={e => {
            onDraftChange(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          placeholder={`Message ${recipientName}...`}
          className="w-full min-h-5 max-h-[120px] resize-none border-none bg-transparent text-xs leading-normal text-sidebar-foreground/70 outline-none placeholder:text-sidebar-foreground/30"
          rows={1}
        />
      </div>

      <button
        className={`rounded-full p-2 shrink-0 transition-colors ${
          draftText.trim()
            ? 'bg-indigo-500/20 text-indigo-400/80 hover:bg-indigo-500/30'
            : 'bg-sidebar-foreground/[0.04] text-sidebar-foreground/20'
        }`}
        onClick={onSend}
        disabled={!draftText.trim()}
      >
        <IconArrowUp className="size-3.5" />
      </button>

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
    </div>
  )
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit 2>&1 | grep inbox-drawer-chat-composer`
Expected: No output

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/inbox-drawer-chat-composer.tsx
git commit -m "feat(inbox-drawer): add chat composer with pill input"
```

---

### Task 9: Create the Actions bar

**Files:**
- Create: `src/components/dashboard/inbox-drawer-actions.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/dashboard/inbox-drawer-actions.tsx
'use client'

import type { ChannelFamily } from './use-drawer-state'

interface ActionsBarProps {
  channelFamily: ChannelFamily
  onDone: () => void
  onArchive: () => void
  onForward?: () => void
  onSpam: () => void
}

export function InboxDrawerActions({ channelFamily, onDone, onArchive, onForward, onSpam }: ActionsBarProps) {
  return (
    <div className="shrink-0 flex items-center gap-3 px-5 pb-3 pt-1 text-[10px] text-sidebar-foreground/20">
      <button onClick={onDone} className="hover:text-sidebar-foreground/50 transition-colors">✓ Done</button>
      <button onClick={onArchive} className="hover:text-sidebar-foreground/50 transition-colors">📦 Archive</button>
      {channelFamily === 'email' && onForward && (
        <button onClick={onForward} className="hover:text-sidebar-foreground/50 transition-colors">↪ Forward</button>
      )}
      <button onClick={onSpam} className="hover:text-sidebar-foreground/50 transition-colors">⚠ Spam</button>
      <span className="ml-auto">
        <kbd className="rounded bg-sidebar-foreground/[0.04] px-1 py-0.5 text-[9px] font-mono">⌘↵</kbd> send
      </span>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/inbox-drawer-actions.tsx
git commit -m "feat(inbox-drawer): add subtle bottom actions bar"
```

---

### Task 10: Rewrite the shell and wire everything together

**Files:**
- Rewrite: `src/components/dashboard/inbox-drawer.tsx`
- Modify: `src/components/dashboard/tabs/inbox-tab.tsx`

- [ ] **Step 1: Rewrite inbox-drawer.tsx as a thin shell**

Replace the entire contents of `src/components/dashboard/inbox-drawer.tsx` with:

```tsx
// src/components/dashboard/inbox-drawer.tsx
'use client'

import { useEffect } from 'react'
import { InboxDrawerIdentity } from './inbox-drawer-identity'
import { InboxDrawerTriage } from './inbox-drawer-triage'
import { EmailThreadView } from './inbox-drawer-email-thread'
import { ChatThreadView } from './inbox-drawer-chat-thread'
import { EmailComposer } from './inbox-drawer-email-composer'
import { ChatComposer } from './inbox-drawer-chat-composer'
import { InboxDrawerActions } from './inbox-drawer-actions'
import {
  useDrawerState,
  type InboxMessage,
  type ThreadMessageItem,
} from './use-drawer-state'

// Re-export types for consumers
export type { InboxMessage, ThreadMessageItem }

export interface InboxDrawerProps {
  message: InboxMessage
  onClose: () => void
  onArchive: (id: string) => void
  onDone: (id: string) => void
  onReply: (id: string, body: string) => void
  onNavigate: (direction: 'prev' | 'next') => void
  threadMessages?: ThreadMessageItem[]
}

export default function InboxDrawer({
  message,
  onClose,
  onArchive,
  onDone,
  onReply,
  onNavigate,
  threadMessages = [],
}: InboxDrawerProps) {
  const state = useDrawerState(message, threadMessages, {
    onClose,
    onArchive,
    onDone,
    onReply,
    onNavigate,
  })

  const senderName = message.contactName || message.senderName || message.senderEmail || 'Unknown'
  const isNotification = state.channelFamily === 'notification'

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT') return
      if (tag === 'TEXTAREA' && e.key !== 'Escape' && !(e.metaKey || e.ctrlKey)) return

      switch (e.key) {
        case 'Escape': e.preventDefault(); state.close(); break
        case 'j': e.preventDefault(); state.navigate('next'); break
        case 'k': e.preventDefault(); state.navigate('prev'); break
        case 'r': e.preventDefault(); state.setReplyMode('reply'); break
        case 'a': if (state.channelFamily === 'email') { e.preventDefault(); state.setReplyMode('reply-all') } break
        case 'f': e.preventDefault(); state.setReplyMode('forward'); break
        case 'd': e.preventDefault(); state.markDone(); break
        case 'e': e.preventDefault(); state.archive(); break
        case '!': e.preventDefault(); state.markSpam(); break
        case 'b': e.preventDefault(); state.delegateToBitBit(); break
        case 'Enter':
          if ((e.metaKey || e.ctrlKey) && tag === 'TEXTAREA') {
            e.preventDefault()
            state.sendReply()
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [state])

  return (
    <>
      {/* Zone 1: Identity */}
      <InboxDrawerIdentity
        message={message}
        channelFamily={state.channelFamily}
        onClose={state.close}
      />

      {/* Zone 2: AI Triage */}
      <InboxDrawerTriage
        summary={state.triageSummary}
        sentiment={state.sentimentDot}
        triageState={state.triageState}
        delegationActions={state.delegationActions}
        compact={state.channelFamily === 'chat'}
        onDelegate={state.delegateToBitBit}
        onUndoDelegate={state.undoDelegation}
        onReplyManually={() => state.setReplyMode('reply')}
      />

      {/* Zone 3: Thread (scrollable) */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {state.channelFamily === 'email' ? (
          <EmailThreadView messages={threadMessages} />
        ) : (
          <ChatThreadView messages={threadMessages} channelType={message.channelType} />
        )}
      </div>

      {/* Zone 4: Composer (skip for notifications) */}
      {!isNotification && (
        state.channelFamily === 'email' ? (
          <EmailComposer
            recipientName={senderName}
            recipientEmail={message.senderEmail}
            replyMode={state.replyMode}
            draftText={state.draftText}
            attachments={state.attachments}
            ccRecipients={state.ccRecipients}
            bccRecipients={state.bccRecipients}
            isComposerFocused={state.isComposerFocused}
            onDraftChange={state.setDraftText}
            onAddAttachment={state.addAttachment}
            onRemoveAttachment={state.removeAttachment}
            onCcChange={state.setCc}
            onBccChange={state.setBcc}
            onFocusChange={state.setComposerFocused}
            onSend={state.sendReply}
          />
        ) : (
          <ChatComposer
            recipientName={senderName}
            draftText={state.draftText}
            onDraftChange={state.setDraftText}
            onAddAttachment={state.addAttachment}
            onSend={state.sendReply}
            onFocusChange={state.setComposerFocused}
          />
        )
      )}

      {/* Zone 5: Actions */}
      {!isNotification && (
        <InboxDrawerActions
          channelFamily={state.channelFamily}
          onDone={state.markDone}
          onArchive={state.archive}
          onForward={() => state.setReplyMode('forward')}
          onSpam={state.markSpam}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Update inbox-tab.tsx — the drawer invocation**

The `InboxDrawerProps` interface changed slightly. The `message` prop is now non-nullable (the drawer is only rendered when there's a message). Find the `useEffect` that calls `setDrawerSlot` (around line 576-590) — no changes needed to the props being passed because the interface names and shapes are preserved:

- `message` → same
- `onClose` → same
- `onArchive` → same
- `onDone` → same
- `onReply` → same
- `onNavigate` → same
- `threadMessages` → same

The inbox-tab.tsx import stays the same: `import InboxDrawer, { type ThreadMessageItem } from '@/components/dashboard/inbox-drawer'`

Verify the import still works:

Run: `cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit 2>&1 | grep -E 'inbox-tab|inbox-drawer' | head -10`
Expected: No errors (or only the pre-existing `weekly-operations-summary` error)

- [ ] **Step 3: Verify the full build compiles**

Run: `cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit 2>&1 | grep -v weekly-operations-summary | tail -5`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/inbox-drawer.tsx
git commit -m "feat(inbox-drawer): rewrite shell — identity/triage/thread/composer/actions composition"
```

---

### Task 11: Verify dev server works end-to-end

**Files:** None (verification only)

- [ ] **Step 1: Restart dev server and verify no runtime errors**

```bash
pkill -f 'next dev' 2>/dev/null
rm -f /home/claude/bitbit/personal-assistant/.next/dev/lock
cd /home/claude/bitbit/personal-assistant && nohup npm run dev > /tmp/bitbit-dev.log 2>&1 &
sleep 10
head -25 /tmp/bitbit-dev.log
```

Expected: `✓ Ready` with no compilation errors

- [ ] **Step 2: Check for TypeScript errors**

Run: `cd /home/claude/bitbit/personal-assistant && npx tsc --noEmit 2>&1 | grep -v weekly-operations-summary`
Expected: No errors

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `cd /home/claude/bitbit/personal-assistant && npx vitest run 2>&1 | tail -10`
Expected: All tests pass (including the new `use-drawer-state.test.ts`)

- [ ] **Step 4: Final commit — delete old inbox-drawer backup if any**

```bash
git add -A
git status
# Only commit if there are uncommitted changes
```
