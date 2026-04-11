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
