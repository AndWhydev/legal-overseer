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
