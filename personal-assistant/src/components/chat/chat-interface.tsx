'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MessageBubble } from './message-bubble'
import {
  IconChevronDown, IconSearch, IconCirclePlus, IconPencil, IconEye, IconFileText, IconMail,
  IconBrain, IconBolt, IconAlertCircle, IconWorld, IconBook, IconCalendar, IconReceipt,
  IconUsers, IconMessage, IconLoader2, IconCheck, IconX, IconMenu2,
} from '@tabler/icons-react'
import { ConversationDrawer, type Thread } from './conversation-drawer'
import { BitBitAsciiAvatar } from '@/components/ui/bitbit-ascii-avatar'
import { ClawdLoginFace } from '@/components/ui/clawd-login-face'
import { ChatBitBitFace } from './chat-bitbit-face'
import { useAvatarEmotion } from './use-avatar-emotion'
import { useSmoothStream } from './use-smooth-stream'
import { useSmartScroll } from './use-smart-scroll'
import { Whispers } from './whispers'
import { FollowUpChips } from './follow-up-chips'
import type { Whisper } from '@/lib/whispers/types'
import { Shimmer } from '@/components/ai-elements/shimmer'
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought'
import { Checkpoint, CheckpointIcon } from '@/components/ai-elements/checkpoint'
import { InvoiceArtifact } from './invoice-artifact'
import { ChatAttachmentList } from './chat-attachment'
import { CHAT_ATTACHMENTS_EVENT, CHAT_COMMAND_EVENT } from '@/components/dashboard/voice-pill'
import { useFileUpload } from '@/hooks/use-file-upload'
import { useArtifacts, type Artifact } from './use-artifacts'
import { ArtifactPanel } from './artifact-panel'
import { ExportMenu } from './export-menu'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SmoothText } from './smooth-text'

interface ToolCall {
  name: string
  input: unknown
  result?: unknown
  success?: boolean
  status: 'running' | 'done' | 'error'
}

export interface Citation {
  index: number
  url: string
  title: string
  description?: string
}

interface PendingApproval {
  id: string
  toolName: string
  input: unknown
  actionSummary: string
  status: 'pending' | 'approved' | 'rejected'
  resolving?: boolean
}

interface CheckpointMarker {
  messageIndex: number
  label: string
  afterMessageId: string
}

interface MessageAttachment {
  type: string       // MIME type
  name: string       // filename
  url: string        // storage_path
  size?: number      // file size in bytes
  attachmentId?: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
  citations?: Citation[]
  attachments?: MessageAttachment[]
  timestamp: Date
}

/** Chronologically ordered content segment during streaming.
 *  Tool segments reference indices into the flat toolCalls array
 *  so they stay in sync when tool_result updates status. */
type StreamSegment =
  | { type: 'tools'; startIdx: number; endIdx: number; narrations: string[] }
  | { type: 'text'; content: string }

function getGreeting(): string {
  const h = new Date().getHours()
  if (h >= 22) return 'Working late?'
  if (h >= 17) return 'Good evening'
  if (h >= 12) return 'Good afternoon'
  return 'Good morning'
}

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  create_task: 'Creating task',
  update_task: 'Updating task',
  search_tasks: 'Searching tasks',
  search_contacts: 'Searching contacts',
  get_contact: 'Looking up contact',
  find_messages: 'Searching messages',
  read_message: 'Reading message',
  log_activity: 'Logging activity',
  compose_creator_notification_mockup: 'Composing notification',
  search_memory: 'Searching memory',
  add_memory: 'Saving to memory',
  send_email: 'Sending email',
  search_leads: 'Searching leads',
  get_calendar: 'Checking calendar',
  create_invoice: 'Creating invoice',
  generate_invoice: 'Generating invoice',
  update_lead: 'Updating lead',
  browse_website: 'Browsing website',
  draft_reply: 'Drafting reply',
}

/** snake_case → Title Case fallback for unknown tools */
function formatToolName(name: string): string {
  if (TOOL_DISPLAY_NAMES[name]) return TOOL_DISPLAY_NAMES[name]
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/** Extract a descriptive detail from tool input/result for richer chain-of-thought steps */
function extractToolDetail(name: string, input: unknown, result?: unknown): string | null {
  const inp = (input && typeof input === 'object') ? input as Record<string, unknown> : {}
  const res = (result && typeof result === 'object') ? result as Record<string, unknown> : {}

  // Search tools — show what's being searched
  if (name === 'search_tasks' || name === 'search_contacts' || name === 'search_leads' || name === 'find_messages' || name === 'search_memory') {
    const query = inp.query || inp.search || inp.keyword || inp.q || inp.name
    if (typeof query === 'string' && query.length > 0) {
      return query.length > 60 ? query.slice(0, 57) + '...' : query
    }
  }

  // Read tools — extract subject/sender from result if available
  if (name === 'read_message') {
    // Try result first (has richer data after tool completes)
    const subject = res.subject || (res as Record<string, unknown>)?.subject
    if (typeof subject === 'string' && subject.length > 0) {
      return subject.length > 50 ? subject.slice(0, 47) + '...' : subject
    }
    const sender = res.sender || res.sender_name || res.from
    if (typeof sender === 'string' && sender.length > 0) {
      return sender.length > 40 ? sender.slice(0, 37) + '...' : sender
    }
    // Fall back to input subject
    const inputSubject = inp.subject
    if (typeof inputSubject === 'string') return inputSubject.length > 50 ? inputSubject.slice(0, 47) + '...' : inputSubject
    return null
  }

  // Contact lookup — show name
  if (name === 'get_contact') {
    const contactName = inp.name || inp.contact_name
    if (typeof contactName === 'string') return contactName
  }

  // Email — show recipient
  if (name === 'send_email') {
    const to = inp.to || inp.recipient
    if (typeof to === 'string') return `to ${to}`
  }

  // Task creation — show title
  if (name === 'create_task') {
    const title = inp.title
    if (typeof title === 'string') return title.length > 60 ? title.slice(0, 57) + '...' : title
  }

  // Memory — show what's being saved (key/category or content preview)
  if (name === 'add_memory') {
    const key = inp.key || inp.title || inp.category
    if (typeof key === 'string' && key.length > 0) {
      return key.length > 50 ? key.slice(0, 47) + '...' : key
    }
    const content = inp.content || inp.text || inp.value
    if (typeof content === 'string' && content.length > 0) {
      return content.length > 50 ? content.slice(0, 47) + '...' : content
    }
  }

  // Browse website — show URL
  if (name === 'browse_website') {
    const url = inp.url || inp.website || inp.href
    if (typeof url === 'string') {
      // Strip protocol for cleaner display
      return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
    }
  }

  return null
}

/** Extract a brief result summary from a completed tool call for inline display */
function extractResultSummary(name: string, result?: unknown, success?: boolean): string | null {
  if (success === false) return 'Failed'
  if (!result) return null

  const res = (typeof result === 'object') ? result as Record<string, unknown> : {}

  // Array results — show count
  if (Array.isArray(result)) {
    if (result.length === 0) return 'No results'
    return `Found ${result.length} result${result.length !== 1 ? 's' : ''}`
  }

  // Results with a data array
  if (Array.isArray(res.data)) {
    const count = res.data.length
    if (count === 0) return 'No results'
    return `Found ${count} result${count !== 1 ? 's' : ''}`
  }

  // Results with a results array
  if (Array.isArray(res.results)) {
    const count = res.results.length
    if (count === 0) return 'No results'
    return `Found ${count} result${count !== 1 ? 's' : ''}`
  }

  // Results with a count field
  if (typeof res.count === 'number') {
    if (res.count === 0) return 'No results'
    return `Found ${res.count} result${res.count !== 1 ? 's' : ''}`
  }

  // Specific tool result shapes
  if (name === 'send_email' || name === 'send_outlook' || name === 'send_gmail') return 'Sent'
  if (name === 'create_task') return 'Created'
  if (name === 'update_task' || name === 'update_lead') return 'Updated'
  if (name === 'add_memory') return 'Saved'
  if (name === 'log_activity') return 'Logged'
  if (name === 'create_invoice') return 'Invoice created'
  if (name === 'draft_reply') return 'Draft ready'

  // Read tools — generic success
  if (name === 'read_message' || name === 'get_contact') return 'Done'

  // Browse — generic
  if (name === 'browse_website') return 'Page loaded'

  // Calendar
  if (name === 'get_calendar' || name === 'schedule_event' || name === 'get_upcoming') return 'Done'

  // Generic success indicator for unknown tools with truthy result
  if (success === true) return 'Done'

  return null
}

/** Tool-specific icon based on name */
function getToolIcon(name: string): React.ElementType {
  // Exact matches first
  const ICON_MAP: Record<string, React.ElementType> = {
    browse_website: IconWorld,
    search_memory: IconBrain,
    add_memory: IconBrain,
    find_messages: IconSearch,
    read_message: IconMail,
    send_email: IconMail,
    compose_creator_notification_mockup: IconMail,
    search_contacts: IconUsers,
    get_contact: IconUsers,
    search_leads: IconUsers,
    update_lead: IconUsers,
    search_tasks: IconFileText,
    create_task: IconCirclePlus,
    update_task: IconPencil,
    get_calendar: IconCalendar,
    create_invoice: IconReceipt,
    generate_invoice: IconReceipt,
    log_activity: IconBook,
    draft_reply: IconPencil,
  }
  if (ICON_MAP[name]) return ICON_MAP[name]
  // Pattern fallbacks
  if (name.startsWith('search') || name.startsWith('find')) return IconSearch
  if (name.startsWith('browse') || name.includes('website') || name.includes('url')) return IconWorld
  if (name.startsWith('create')) return IconCirclePlus
  if (name.startsWith('update')) return IconPencil
  if (name.startsWith('get') || name.startsWith('look')) return IconEye
  if (name.startsWith('log')) return IconBook
  if (name.startsWith('compose') || name.startsWith('send')) return IconMail
  if (name.includes('memory')) return IconBrain
  if (name.includes('message') || name.includes('email')) return IconMessage
  return IconBolt
}

/** Build a human-readable action summary from a tool call for approval cards */
function buildActionSummary(toolName: string, input: unknown): string {
  const inp = (input && typeof input === 'object') ? input as Record<string, unknown> : {}

  if (toolName === 'send_email' || toolName === 'send_outlook') {
    const to = inp.to || inp.recipient || 'unknown'
    const subject = inp.subject || ''
    return subject ? `Send email to ${to}: ${subject}` : `Send email to ${to}`
  }

  if (toolName === 'send_sms' || toolName === 'send_whatsapp') {
    const to = inp.to || inp.phone || inp.recipient || 'unknown'
    const body = typeof inp.body === 'string' ? inp.body : typeof inp.message === 'string' ? inp.message : ''
    const preview = body.length > 60 ? body.slice(0, 57) + '...' : body
    const channel = toolName === 'send_sms' ? 'SMS' : 'WhatsApp'
    return preview ? `Send ${channel} to ${to}: ${preview}` : `Send ${channel} to ${to}`
  }

  if (toolName === 'create_invoice') {
    const contact = inp.contact_name || inp.client || ''
    const amount = inp.amount_formatted || inp.total || inp.amount || ''
    return contact ? `Create invoice for ${contact}${amount ? ` — ${amount}` : ''}` : 'Create invoice'
  }

  if (toolName === 'update_lead') {
    const name = inp.name || inp.lead_name || ''
    return name ? `Update lead: ${name}` : 'Update lead'
  }

  const label = formatToolName(toolName)
  const detail = extractToolDetail(toolName, input)
  return detail ? `${label}: ${detail}` : label
}

/** Inline approval card rendered inside chat message flow */
function InlineApprovalCard({
  approval,
  onApprove,
  onReject,
}: {
  approval: PendingApproval
  onApprove: (id: string) => void
  onReject: (id: string) => void
}) {
  const isPending = approval.status === 'pending' && !approval.resolving
  const isResolving = approval.resolving === true
  const isApproved = approval.status === 'approved'
  const isRejected = approval.status === 'rejected'

  const ToolIcon = getToolIcon(approval.toolName)

  const cardStyle: React.CSSProperties = {
    padding: '12px 16px',
    borderRadius: 12,
    background: 'var(--glass-bg, rgba(15, 20, 30, 0.35))',
    backdropFilter: 'var(--glass-blur, blur(24px) saturate(1.3) brightness(1.05))',
    WebkitBackdropFilter: 'var(--glass-blur, blur(24px) saturate(1.3) brightness(1.05))',
    border: isApproved
      ? '1px solid rgba(34, 197, 94, 0.3)'
      : isRejected
        ? '1px solid rgba(239, 68, 68, 0.25)'
        : '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
    boxShadow: 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3)), var(--card-inset, inset 0 1px 0 rgba(255,255,255,0.06))',
    transition: 'all 200ms',
    maxWidth: '100%',
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
  }

  const iconWrapStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 8,
    background: isApproved
      ? 'rgba(34, 197, 94, 0.12)'
      : isRejected
        ? 'rgba(239, 68, 68, 0.12)'
        : 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
    flexShrink: 0,
    marginTop: 1,
  }

  const iconColor = isApproved
    ? 'var(--bb-green, #22C55E)'
    : isRejected
      ? 'var(--bb-red, #EF4444)'
      : 'var(--text-secondary, #94A3B8)'

  const summaryStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-primary, #F1F5F9)',
    lineHeight: 1.4,
    flex: 1,
    minWidth: 0,
  }

  const toolLabelStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 8,
    background: 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: '0.02em',
    color: 'var(--text-secondary, #94A3B8)',
    marginTop: 8,
  }

  const buttonContainerStyle: React.CSSProperties = {
    display: 'flex',
    gap: 8,
    marginTop: 12,
  }

  const approveBtnStyle: React.CSSProperties = {
    flex: 1,
    height: 40,
    padding: '0 20px',
    borderRadius: 8,
    background: 'var(--btn-primary-bg, #F1F5F9)',
    border: 'none',
    color: 'var(--btn-primary-fg, #0a0f1a)',
    fontSize: 14,
    fontWeight: 500,
    cursor: isResolving ? 'not-allowed' : 'pointer',
    transition: 'all 200ms',
    opacity: isResolving ? 0.6 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  }

  const rejectBtnStyle: React.CSSProperties = {
    flex: 1,
    padding: '8px 16px',
    borderRadius: 12,
    background: 'transparent',
    border: '1px solid rgba(239, 68, 68, 0.35)',
    color: 'var(--bb-red, #EF4444)',
    fontSize: 14,
    fontWeight: 500,
    cursor: isResolving ? 'not-allowed' : 'pointer',
    transition: 'all 200ms',
    opacity: isResolving ? 0.6 : 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  }

  const resolvedBadgeCls = `mt-3 inline-flex items-center gap-1 rounded-lg px-3 py-1 text-sm font-medium ${isApproved ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <div style={iconWrapStyle}>
          {isApproved ? (
            <IconCheck size={14} color={iconColor} />
          ) : isRejected ? (
            <IconX size={14} color={iconColor} />
          ) : (
            <ToolIcon size={14} color={iconColor} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={summaryStyle}>{approval.actionSummary}</div>
          <div style={toolLabelStyle}>
            <ToolIcon size={10} />
            {formatToolName(approval.toolName)}
          </div>
        </div>
      </div>

      {isPending && (
        <div style={buttonContainerStyle}>
          <button
            style={rejectBtnStyle}
            disabled={isResolving}
            onClick={() => onReject(approval.id)}
          >
            Reject
          </button>
          <button
            style={approveBtnStyle}
            disabled={isResolving}
            onClick={() => onApprove(approval.id)}
          >
            Approve
          </button>
        </div>
      )}

      {isResolving && (
        <div className="mt-3 inline-flex items-center gap-1 rounded-lg bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
          <IconLoader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
          Resolving...
        </div>
      )}

      {isApproved && !isResolving && (
        <div className={resolvedBadgeCls}>
          <IconCheck size={12} />
          Approved. Sending...
        </div>
      )}

      {isRejected && !isResolving && (
        <div className={resolvedBadgeCls}>
          <IconX size={12} />
          Rejected.
        </div>
      )}
    </div>
  )
}

const CHAT_SEND_EVENT = 'bitbit-chat-send'
const CHAT_LAYOUT_EVENT = 'bitbit-chat-layout'
const THREAD_STORAGE_KEY = 'bb-active-thread'

export function ChatInterface({ userName }: { userName?: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [threadId, setThreadIdRaw] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem(THREAD_STORAGE_KEY)
    }
    return null
  })

  // Wrap setThreadId to sync with sessionStorage
  const setThreadId = useCallback((id: string | null) => {
    setThreadIdRaw(id)
    if (typeof window !== 'undefined') {
      if (id) sessionStorage.setItem(THREAD_STORAGE_KEY, id)
      else sessionStorage.removeItem(THREAD_STORAGE_KEY)
    }
  }, [])
  // Reasoning state
  const [thinkingContent, setThinkingContent] = useState('')
  const [isThinkingStreaming, setIsThinkingStreaming] = useState(false)
  const [thinkingDuration, setThinkingDuration] = useState<number | undefined>()
  const [showReasoning, setShowReasoning] = useState(false)
  const [narration, setNarration] = useState('')
  const narrationLockedRef = useRef(false) // Once actual content starts, stop capturing narration
  const narrationContentRef = useRef('') // Tracks ONLY pre-tool narration text, separate from assistantContent
  const interToolBufferRef = useRef('') // Buffers content between tool calls (inter-tool narration)
  const [interToolNarrations, setInterToolNarrations] = useState<string[]>([]) // Confirmed inter-tool narration steps
  // Chronologically ordered segments for the current streaming response
  const [streamSegments, setStreamSegments] = useState<StreamSegment[]>([])
  // Mutable ref mirroring streamSegments during SSE processing (avoids stale closures)
  const streamSegmentsRef = useRef<StreamSegment[]>([])
  // Tracks whether we've seen text content AFTER at least one tool segment
  const hasPostToolTextRef = useRef(false)
  const [activeCitations, setActiveCitations] = useState<Citation[]>([])
  const [checkpoints, setCheckpoints] = useState<CheckpointMarker[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [invoiceArtifacts, setInvoiceArtifacts] = useState<Array<{
    invoiceNumber: string; recipient: string; recipientEmail: string
    total: string; dueDate: string; description: string
    html: string; subject: string; afterMessageId: string
  }>>([])
  // Conversation drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerThreads, setDrawerThreads] = useState<Thread[]>([])
  const [drawerLoading, setDrawerLoading] = useState(false)
  // Whispers visible state (hides when typing or conversation starts)
  const [whispersVisible, setWhispersVisible] = useState(true)
  // Follow-up suggestions state
  const [followUps, setFollowUps] = useState<string[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const currentAssistantIdRef = useRef<string | null>(null)
  // Tracks which assistant message the smooth stream content belongs to.
  // Prevents stale content from a previous response leaking into a new message.
  const smoothStreamOwnerRef = useRef<string | null>(null)
  const requestGenRef = useRef(0) // Increments each handleSend to invalidate stale SSE processing
  const abortRef = useRef<AbortController | null>(null)
  // Reasoning chain state (controlled collapsible)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const prevReasoningActiveRef = useRef(false)
  const autoOpenedRef = useRef(false)

  // Attachment state: IDs and metadata dispatched from VoicePill via custom event
  const pendingAttachmentIdsRef = useRef<string[]>([])
  const pendingAttachmentItemsRef = useRef<MessageAttachment[]>([])
  // Drag-and-drop state
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  // File upload hook for drag-and-drop (VoicePill handles its own uploads)
  const dragUpload = useFileUpload(threadId)

  // Smooth streaming and smart scroll hooks
  const smoothStream = useSmoothStream()
  const smartScroll = useSmartScroll(scrollRef)

  // Artifact panel hook
  const { activeArtifact, addArtifact, closeArtifact } = useArtifacts()

  // Compute emotion state for face avatar
  const lastMsgForEmotion = messages[messages.length - 1]
  const isToolRunning = lastMsgForEmotion?.toolCalls?.some(tc => tc.status === 'running') ?? false
  const activeRunningTool = lastMsgForEmotion?.toolCalls?.find(tc => tc.status === 'running')?.name ?? null

  // Sticky tool name — holds the last active tool until a new one starts or loading ends.
  // This prevents the avatar from flickering to idle between tool calls.
  const stickyToolRef = useRef<string | null>(null)
  if (activeRunningTool) {
    stickyToolRef.current = activeRunningTool
  } else if (!isLoading) {
    stickyToolRef.current = null
  }
  const effectiveToolName = activeRunningTool ?? (isLoading ? stickyToolRef.current : null)

  const isContentStreaming = isLoading && !isThinkingStreaming && messages.some(m => m.role === 'assistant' && m.content.length > 0)
  const hasResponseError = lastMsgForEmotion?.role === 'assistant' && lastMsgForEmotion.content.startsWith('Something went wrong:')
  const avatarEmotion = useAvatarEmotion({
    isThinking: isThinkingStreaming,
    isToolRunning: isToolRunning || (isLoading && !!effectiveToolName),
    isStreaming: isContentStreaming,
    hasError: hasResponseError,
    activeToolName: effectiveToolName,
  })

  // Map active tool to avatar activity for prop overlays
  const avatarActivity = (() => {
    if (isThinkingStreaming) return 'thinking' as const
    const tool = effectiveToolName
    if (!tool) {
      // If still loading but no tool, show thinking
      if (isLoading && !isContentStreaming) return 'thinking' as const
      return 'idle' as const
    }
    if (tool.includes('search') || tool.includes('find')) return 'searching' as const
    if (tool.includes('read') || tool === 'get_contact') return 'reading' as const
    if (tool.includes('create') || tool.includes('draft')) return 'creating' as const
    if (tool.includes('send') || tool.includes('compose')) return 'sending' as const
    if (tool.includes('browse') || tool.includes('website')) return 'browsing' as const
    return 'thinking' as const
  })()

  // Update messages from smooth stream and auto-scroll.
  // Only apply content if it belongs to the current assistant message
  // (smoothStreamOwnerRef gates cross-request content leaking).
  useEffect(() => {
    if (!smoothStream.displayedContent || !currentAssistantIdRef.current) return
    // Reject stale smooth stream content from a previous request
    if (smoothStreamOwnerRef.current !== currentAssistantIdRef.current) return
    const aid = currentAssistantIdRef.current
    setMessages(prev => {
      const existing = prev.find(m => m.id === aid)
      if (existing) {
        return prev.map(m =>
          m.id === aid ? { ...m, content: smoothStream.displayedContent } : m
        )
      }
      return [
        ...prev,
        {
          id: aid,
          role: 'assistant' as const,
          content: smoothStream.displayedContent,
          timestamp: new Date(),
        },
      ]
    })
    smartScroll.onContentUpdate()
  }, [smoothStream.displayedContent, smartScroll])

  // Auto-scroll on thinking content changes
  useEffect(() => {
    smartScroll.onContentUpdate()
  }, [thinkingContent, isThinkingStreaming, smartScroll])

  const handleOpenArtifact = useCallback((content: string, lang: string) => {
    const isHtml = lang === 'html' || (content.includes('<!DOCTYPE') || content.includes('<html'))
    addArtifact({
      id: `art-${Date.now()}`,
      type: isHtml ? 'html' : 'code',
      title: isHtml ? 'HTML Preview' : `${lang || 'code'} snippet`,
      content,
      language: lang,
      messageId: currentAssistantIdRef.current || '',
    })
  }, [addArtifact])

  const handleSend = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    // Capture and consume pending attachment IDs and metadata BEFORE creating
    // the user message so we can include them for inline preview rendering.
    const attachmentIds = [
      ...pendingAttachmentIdsRef.current,
      ...dragUpload.readyAttachmentIds,
    ]
    const msgAttachments: MessageAttachment[] = [
      ...pendingAttachmentItemsRef.current,
      ...dragUpload.uploads
        .filter(u => u.status === 'ready')
        .map(u => ({ attachmentId: u.id, type: u.mimeType, name: u.filename, url: '', size: u.size })),
    ]
    pendingAttachmentIdsRef.current = []
    pendingAttachmentItemsRef.current = []
    if (dragUpload.readyAttachmentIds.length > 0) {
      dragUpload.clearUploads()
    }

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: trimmed,
      attachments: msgAttachments.length > 0 ? msgAttachments : undefined,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    setWhispersVisible(false)
    // Reset reasoning state
    setThinkingContent('')
    setIsThinkingStreaming(true)
    setThinkingDuration(undefined)
    setShowReasoning(true)
    setReasoningOpen(false)
    prevReasoningActiveRef.current = false
    autoOpenedRef.current = false
    setNarration('')
    narrationLockedRef.current = false
    narrationContentRef.current = ''
    interToolBufferRef.current = ''
    setInterToolNarrations([])
    setStreamSegments([])
    streamSegmentsRef.current = []
    hasPostToolTextRef.current = false
    setActiveCitations([])
    setPendingApprovals([])
    setFollowUps([])
    // Finalize previous message content if smooth stream was mid-drain.
    // This prevents content loss when the user sends before the typing
    // animation finishes, and stops stale content from leaking into the
    // next assistant message via the smooth-stream useEffect.
    const prevAid = currentAssistantIdRef.current
    const pendingContent = smoothStream.getFullContent()
    if (prevAid && pendingContent) {
      setMessages(prev => prev.map(m =>
        m.id === prevAid ? { ...m, content: pendingContent } : m
      ))
    }
    // Invalidate smooth stream ownership so stale content can't leak
    smoothStreamOwnerRef.current = null
    smoothStream.reset()
    smartScroll.scrollToBottom()

    const assistantId = `msg-${Date.now() + 1}`
    currentAssistantIdRef.current = assistantId
    const gen = ++requestGenRef.current // Capture generation for this request
    let assistantContent = ''
    const toolCalls: ToolCall[] = []
    const responseCitations: Citation[] = []

    // Abort any previous stream before starting a new one
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    let stallTimer: ReturnType<typeof setTimeout> | null = null

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          threadId,
          attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) throw new Error('Failed to connect')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      // Stall detection: show feedback if no events arrive for 30s
      const resetStallTimer = () => {
        if (stallTimer) clearTimeout(stallTimer)
        stallTimer = setTimeout(() => {
          if (requestGenRef.current === gen) {
            setThinkingContent(prev =>
              prev.includes('Taking longer') ? prev : prev + '\n\nTaking longer than expected\u2026'
            )
          }
        }, 30_000)
      }
      resetStallTimer()

      while (true) {
        // Stop processing if this request has been superseded
        if (controller.signal.aborted) break

        const { done, value } = await reader.read()
        if (done) break

        resetStallTimer()
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (controller.signal.aborted) break
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6)
          if (!raw) continue

          try {
            const event = JSON.parse(raw)

            // Discard events from superseded requests
            if (requestGenRef.current !== gen) break

            switch (event.type) {
              case 'thread': {
                const tid = event.data.threadId
                setThreadId(tid)
                // threadId kept in state only — no persistence
                break
              }

              case 'thinking':
              case 'thinking_start':
                setIsThinkingStreaming(true)
                break

              case 'thinking_delta':
                setThinkingContent(prev => prev + event.data)
                setIsThinkingStreaming(true)
                break

              case 'thinking_complete': {
                setIsThinkingStreaming(false)
                const durationMs = event.data?.duration_ms
                if (durationMs) {
                  setThinkingDuration(Math.ceil(durationMs / 1000))
                }
                break
              }

              case 'citation': {
                const newCitations = event.data?.citations || []
                if (newCitations.length > 0) {
                  responseCitations.push(...newCitations)
                  setActiveCitations(prev => [...prev, ...newCitations])
                }
                break
              }

              case 'checkpoint': {
                setCheckpoints(prev => [...prev, {
                  messageIndex: event.data.message_index,
                  label: event.data.label,
                  afterMessageId: assistantId,
                }])
                break
              }

              // Plan/stage events still processed for tool matching
              case 'stage':
              case 'plan':
              case 'plan_stage_update':
                break

              case 'sub_agent_start': {
                // Handled via chain of thought — the tool_call for spawn_agent already shows
                // "Working on sub-task". This event adds the description.
                // No state change needed — the tool_call UI handles the visual.
                break
              }

              case 'sub_agent_complete': {
                // Sub-agent finished — no special handling needed.
                // The tool_result for spawn_agent will carry the summary.
                break
              }

              case 'tool_call': {
                // Tools are running — stop thinking state so avatar switches to tool-specific activity
                setIsThinkingStreaming(false)
                // Lock narration — any content after this goes to chain of thought
                narrationLockedRef.current = true
                // Flush inter-tool buffer
                const flushedText = interToolBufferRef.current.trim()
                interToolBufferRef.current = ''
                const tc: ToolCall = {
                  name: event.data.name,
                  input: event.data.input,
                  status: 'running',
                }
                const newToolIdx = toolCalls.length  // index before push
                toolCalls.push(tc)

                // --- Stream segments: track chronological tool/text order ---
                const segs = streamSegmentsRef.current
                const lastSeg = segs[segs.length - 1]

                // If this is the very first tool and there's pre-tool narration,
                // inject it as the first text segment so it renders above the chain.
                if (segs.length === 0 && narrationContentRef.current) {
                  segs.push({ type: 'text', content: narrationContentRef.current })
                }

                // If we have buffered post-tool text AND another tool arrives,
                // split the text into a visible text segment between tool batches.
                const lastSegAfterNarration = segs[segs.length - 1]
                if (hasPostToolTextRef.current && flushedText) {
                  segs.push({ type: 'text', content: flushedText })
                  hasPostToolTextRef.current = false
                  // Start a fresh tools segment for this new batch
                  segs.push({ type: 'tools', startIdx: newToolIdx, endIdx: newToolIdx, narrations: [] })
                } else if (flushedText && lastSegAfterNarration?.type === 'tools') {
                  // Text between tools within the same batch — narration inside the segment
                  lastSegAfterNarration.narrations.push(flushedText)
                  // Also keep interToolNarrations in sync for the old rendering path
                  setInterToolNarrations(prev => [...prev, flushedText])
                  lastSegAfterNarration.endIdx = newToolIdx
                } else if (lastSegAfterNarration?.type === 'tools') {
                  // Extend existing tools segment
                  lastSegAfterNarration.endIdx = newToolIdx
                } else {
                  // First tools segment (or after a text segment)
                  segs.push({ type: 'tools', startIdx: newToolIdx, endIdx: newToolIdx, narrations: [] })
                }

                streamSegmentsRef.current = segs
                setStreamSegments([...segs])
                hasPostToolTextRef.current = false

                setMessages(prev => {
                  const existing = prev.find(m => m.id === assistantId)
                  if (existing) {
                    return prev.map(m =>
                      m.id === assistantId
                        ? { ...m, toolCalls: [...toolCalls] }
                        : m
                    )
                  }
                  return [
                    ...prev,
                    {
                      id: assistantId,
                      role: 'assistant' as const,
                      content: '',
                      toolCalls: [...toolCalls],
                      timestamp: new Date(),
                    },
                  ]
                })
                break
              }

              case 'tool_result': {
                const idx = toolCalls.findIndex(
                  tc => tc.name === event.data.name && tc.status === 'running'
                )
                if (idx !== -1) {
                  toolCalls[idx] = {
                    ...toolCalls[idx],
                    result: event.data.result,
                    success: event.data.success,
                    status: event.data.success ? 'done' : 'error',
                  }
                }

                // Capture invoice artifacts for inline rendering
                if (event.data.name === 'generate_invoice' && event.data.success && event.data.result) {
                  const r = event.data.result as Record<string, unknown>
                  console.log('[chat] generate_invoice result keys:', Object.keys(r), 'has html:', !!r.html, 'has invoice_number:', !!r.invoice_number)
                  if (r.html && r.invoice_number) {
                    setInvoiceArtifacts(prev => [...prev, {
                      invoiceNumber: r.invoice_number as string,
                      recipient: r.recipient as string,
                      recipientEmail: r.recipient_email as string,
                      total: r.total as string,
                      dueDate: r.due_date as string,
                      description: r.description as string,
                      html: r.html as string,
                      subject: r.subject as string,
                      afterMessageId: assistantId,
                    }])
                  }
                }

                if (event.data.queued && event.data.approvalId) {
                  const matchedInput = toolCalls.find(tc => tc.name === event.data.name)?.input
                  setPendingApprovals(prev => [...prev, {
                    id: event.data.approvalId,
                    toolName: event.data.name,
                    input: matchedInput,
                    actionSummary: event.data.action_summary || buildActionSummary(event.data.name, matchedInput),
                    status: 'pending',
                  }])
                }

                // Update stream segments with tool result status
                setStreamSegments([...streamSegmentsRef.current])

                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, toolCalls: [...toolCalls] }
                      : m
                  )
                )
                break
              }

              case 'content_delta': {
                setIsThinkingStreaming(false)
                assistantContent += event.data

                if (!narrationLockedRef.current && toolCalls.length === 0) {
                  // No tools yet — stream content directly into the message for smooth typing effect.
                  // Also track in narrationContentRef so it can be injected as the first text segment
                  // if tools arrive later (chronological ordering: text → tools → text → tools).
                  narrationContentRef.current = assistantContent
                  setMessages(prev => {
                    const existing = prev.find(m => m.id === assistantId)
                    if (existing) {
                      return prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m)
                    }
                    return [...prev, { id: assistantId, role: 'assistant' as const, content: assistantContent, timestamp: new Date() }]
                  })
                } else if (toolCalls.length > 0 && toolCalls.some(tc => tc.status === 'running')) {
                  // Content arriving while a tool is still running — inter-tool narration
                  interToolBufferRef.current += event.data
                } else if (toolCalls.length > 0 && toolCalls.every(tc => tc.status !== 'running')) {
                  // All tools done — this is real response content OR inter-tool narration
                  // Buffer it; it'll be flushed to narration if another tool_call comes,
                  // or flushed to smoothStream on 'done'
                  interToolBufferRef.current += event.data
                  // Mark that we've seen text after tools completed — this enables
                  // the tool_call handler to split it into a separate text segment
                  // if more tools arrive later
                  hasPostToolTextRef.current = true
                } else {
                  if (!narrationLockedRef.current) {
                    narrationLockedRef.current = true
                  }
                  smoothStream.feedContent(event.data)
                }
                break
              }

              case 'message':
                setIsThinkingStreaming(false)
                assistantContent = event.data
                // For tool-based responses, skip direct content write here —
                // the 'done' handler feeds interToolBuffer to smooth stream
                // which is the sole content writer (prevents dual-write race
                // where this full-text write gets overwritten by partial
                // smooth-stream content, causing stale text to leak).
                if (toolCalls.length > 0) break
                setMessages(prev => {
                  const existing = prev.find(m => m.id === assistantId)
                  if (existing) {
                    return prev.map(m =>
                      m.id === assistantId
                        ? { ...m, content: assistantContent }
                        : m
                    )
                  }
                  return [
                    ...prev,
                    {
                      id: assistantId,
                      role: 'assistant' as const,
                      content: assistantContent,
                      timestamp: new Date(),
                    },
                  ]
                })
                break

              case 'follow_ups': {
                const suggestions = event.data?.suggestions || event.data
                if (Array.isArray(suggestions)) {
                  setFollowUps(suggestions.slice(0, 3))
                }
                break
              }

              case 'error':
                setIsThinkingStreaming(false)
                setShowReasoning(false)
                setMessages(prev => [
                  ...prev.filter(m => m.id !== assistantId),
                  {
                    id: assistantId,
                    role: 'assistant' as const,
                    content: `Something went wrong: ${event.data}`,
                    timestamp: new Date(),
                  },
                ])
                break

              case 'done': {
                setIsThinkingStreaming(false)
                const responseContent = interToolBufferRef.current.trim()

                // Finalize stream segments: add trailing text as final segment
                if (toolCalls.length > 0 && responseContent) {
                  const segs = streamSegmentsRef.current
                  segs.push({ type: 'text', content: responseContent })
                  streamSegmentsRef.current = segs
                  setStreamSegments([...segs])
                }

                if (toolCalls.length > 0) {
                  // Tag smooth stream content as belonging to this assistant message
                  smoothStreamOwnerRef.current = assistantId

                  // Merge ALL text segments into the full content for persistence.
                  // The smooth stream only handles the trailing text for animation,
                  // but the full message (including intermediate narration) must be saved.
                  const allTextSegments = streamSegmentsRef.current
                    .filter(s => s.type === 'text')
                    .map(s => (s as { type: 'text'; content: string }).content.trim())
                    .filter(Boolean)
                  const fullContent = allTextSegments.join('\n\n')

                  if (fullContent) {
                    // Save full content to message immediately for persistence
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === assistantId ? { ...m, content: fullContent } : m
                      )
                    )
                    // Feed only the trailing response to smooth stream for animation
                    if (responseContent) {
                      smoothStream.feedContent(responseContent)
                    }
                    interToolBufferRef.current = ''
                  } else if (!assistantContent) {
                    // Tools ran but produced no response text — show fallback
                    setMessages(prev => {
                      const existing = prev.find(m => m.id === assistantId)
                      if (existing) {
                        return prev.map(m =>
                          m.id === assistantId
                            ? { ...m, content: 'I ran into an issue generating a response. Please try again.' }
                            : m
                        )
                      }
                      return [...prev, {
                        id: assistantId,
                        role: 'assistant' as const,
                        content: 'I ran into an issue generating a response. Please try again.',
                        timestamp: new Date(),
                      }]
                    })
                  }
                  // Attach citations separately (no content overwrite)
                  if (responseCitations.length > 0) {
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === assistantId
                          ? { ...m, citations: [...responseCitations] }
                          : m
                      )
                    )
                  }
                } else {
                  // No-tool response: smooth stream is unused, set content directly.
                  // Create the message if it doesn't already exist (covers edge
                  // case where server sends only content_delta + done, no message event).
                  const finalContent = assistantContent || 'I ran into an issue generating a response. Please try again.'
                  setMessages(prev => {
                    const existing = prev.find(m => m.id === assistantId)
                    if (existing) {
                      return prev.map(m =>
                        m.id === assistantId
                          ? {
                              ...m,
                              content: existing.content || finalContent,
                              ...(responseCitations.length > 0 ? { citations: [...responseCitations] } : {}),
                            }
                          : m
                      )
                    }
                    return [
                      ...prev,
                      {
                        id: assistantId,
                        role: 'assistant' as const,
                        content: finalContent,
                        ...(responseCitations.length > 0 ? { citations: [...responseCitations] } : {}),
                        timestamp: new Date(),
                      },
                    ]
                  })
                }

                // Generate client-side follow-up suggestions from response
                const contentToAnalyze = toolCalls.length > 0 ? responseContent : assistantContent
                if (contentToAnalyze.length > 100 && followUps.length === 0) {
                  // Strip markdown formatting before extracting topics
                  const cleaned = contentToAnalyze
                    .replace(/```[\s\S]*?```/g, '')   // remove code blocks
                    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold → plain
                    .replace(/\*([^*]+)\*/g, '$1')     // italic → plain
                    .replace(/`([^`]+)`/g, '$1')       // inline code → plain
                    .replace(/#{1,6}\s+/g, '')          // headers → plain
                    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text
                    .replace(/[[\]]/g, '')              // stray brackets
                    .replace(/[✅❌⚠️🔍📧💡]/g, '')   // emoji noise

                  // Extract meaningful sentences (not fragments)
                  const sentences = cleaned
                    .split(/(?<=[.!?])\s+/)
                    .map(s => s.trim())
                    .filter(s => s.length > 20 && s.length < 120 && !s.startsWith('-') && !s.startsWith('•'))
                    .slice(0, 6)

                  const suggestions: string[] = []

                  // Extract key nouns/topics from sentences for natural follow-ups
                  if (sentences.length > 0) {
                    // Find a sentence that mentions a person, thing, or action
                    const topicSentence = sentences.find(s => /[A-Z][a-z]+/.test(s)) || sentences[0]
                    // Extract the subject at a word boundary (max 45 chars)
                    const subject = topicSentence
                      .replace(/^(i |we |the |this |that |it |they |here |there )+/i, '')
                      .replace(/[.!?]+$/, '')
                    const truncated = subject.length > 45
                      ? subject.slice(0, subject.lastIndexOf(' ', 45)) || subject.slice(0, 45)
                      : subject
                    if (truncated.length > 5) suggestions.push(`Tell me more about ${truncated.toLowerCase()}`)
                  }
                  if (sentences.length > 2) {
                    const actionSentence = sentences.find(s => /\b(need|should|want|could|can|will)\b/i.test(s))
                    if (actionSentence) {
                      const action = actionSentence.replace(/[.!?]+$/, '')
                      const truncAction = action.length > 50
                        ? action.slice(0, action.lastIndexOf(' ', 50)) || action.slice(0, 50)
                        : action
                      if (truncAction.length > 10) suggestions.push(`${truncAction}?`)
                    }
                  }
                  if (contentToAnalyze.includes('```')) suggestions.push('Can you modify this code?')
                  if (suggestions.length > 0) setFollowUps(suggestions.slice(0, 3))
                }
                break
              }
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      // Silently ignore aborted or superseded requests
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (requestGenRef.current !== gen) return
      setShowReasoning(false)
      setMessages(prev => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: `Connection error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          timestamp: new Date(),
        },
      ])
    } finally {
      // Only clean up loading state if this is still the active request.
      if (stallTimer) clearTimeout(stallTimer)
      if (requestGenRef.current !== gen) return
      setIsLoading(false)
      setIsThinkingStreaming(false)
    }
  }, [isLoading, threadId, smoothStream, smartScroll])

  const handleEditMessage = useCallback((messageId: string, newContent: string) => {
    const idx = messages.findIndex(m => m.id === messageId)
    if (idx === -1) return
    // Truncate conversation at this message (remove it and everything after)
    setMessages(prev => prev.slice(0, idx))
    // Clear related artifacts
    setInvoiceArtifacts(prev => {
      const removedIds = new Set(messages.slice(idx + 1).map(m => m.id))
      return prev.filter(inv => !removedIds.has(inv.afterMessageId))
    })
    setFollowUps([])
    // Re-send with edited content
    handleSend(newContent)
  }, [messages, handleSend])

  const handleRegenerate = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUserMsg || isLoading) return
    // Remove the last assistant message
    setMessages(prev => {
      const lastAssistantIdx = [...prev].reverse().findIndex(m => m.role === 'assistant')
      if (lastAssistantIdx === -1) return prev
      const actualIdx = prev.length - 1 - lastAssistantIdx
      return prev.slice(0, actualIdx)
    })
    // Re-send the same user message
    handleSend(lastUserMsg.content)
  }, [messages, isLoading, handleSend])

  // Listen for attachment metadata dispatched from VoicePill before text submit
  useEffect(() => {
    const attachHandler = (e: Event) => {
      const detail = (e as CustomEvent<{ ids: string[]; items: MessageAttachment[] }>).detail
      if (detail?.ids && detail.ids.length > 0) {
        pendingAttachmentIdsRef.current = detail.ids
        pendingAttachmentItemsRef.current = detail.items ?? []
      }
    }
    window.addEventListener(CHAT_ATTACHMENTS_EVENT, attachHandler)
    return () => window.removeEventListener(CHAT_ATTACHMENTS_EVENT, attachHandler)
  }, [])

  // Listen for custom events from the docked pill
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent<string>).detail
      if (text) handleSend(text)
    }
    window.addEventListener(CHAT_SEND_EVENT, handler)
    return () => window.removeEventListener(CHAT_SEND_EVENT, handler)
  }, [handleSend])

  const handleWhisperTap = useCallback((whisper: Whisper) => {
    // Send whisper text as user message with context metadata
    handleSend(whisper.text)
  }, [handleSend])

  const handleApprovalDecision = useCallback(async (approvalId: string, decision: 'approved' | 'rejected') => {
    // Mark as resolving
    setPendingApprovals(prev =>
      prev.map(a => a.id === approvalId ? { ...a, resolving: true } : a)
    )

    try {
      const res = await fetch('/api/agent/approvals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, decision }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(data.error || `HTTP ${res.status}`)
      }

      // Mark as resolved
      setPendingApprovals(prev =>
        prev.map(a => a.id === approvalId ? { ...a, status: decision, resolving: false } : a)
      )
    } catch {
      // Revert to pending on error so the user can retry
      setPendingApprovals(prev =>
        prev.map(a => a.id === approvalId ? { ...a, resolving: false } : a)
      )
    }
  }, [])

  const hasMessages = messages.length > 0
  const chatStarted = hasMessages || isLoading

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(CHAT_LAYOUT_EVENT, { detail: { started: chatStarted } }))
  }, [chatStarted])

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent(CHAT_LAYOUT_EVENT, { detail: { started: false } }))
    }
  }, [])

  // Reasoning chain: unified thinking + tool calls display
  const currentResponseMsg = messages.find(m => m.id === currentAssistantIdRef.current) ?? null
  const currentToolCalls = currentResponseMsg?.toolCalls || []
  // Reasoning is active while: thinking is streaming, tools are running,
  // OR we're still loading and tools have been used (inter-tool narration phase)
  const isReasoningActive = isThinkingStreaming
    || currentToolCalls.some(tc => tc.status === 'running')
    || (isLoading && currentToolCalls.length > 0)
  const showReasoningChain = showReasoning && (
    isThinkingStreaming ||
    thinkingContent.length > 0 ||
    thinkingDuration !== undefined ||
    currentToolCalls.length > 0
  )

  // Auto-open when actual reasoning content arrives (thinking text or tool calls)
  useEffect(() => {
    if (!autoOpenedRef.current && showReasoningChain &&
        (thinkingContent.length > 0 || currentToolCalls.length > 0)) {
      autoOpenedRef.current = true
      setReasoningOpen(true)
    }
  }, [showReasoningChain, thinkingContent, currentToolCalls.length])

  // Auto-close when response is done loading — not on reasoning state changes
  useEffect(() => {
    const wasActive = prevReasoningActiveRef.current
    prevReasoningActiveRef.current = isReasoningActive
    if (!isReasoningActive && wasActive && !isLoading) {
      const timer = setTimeout(() => setReasoningOpen(false), 1200)
      return () => clearTimeout(timer)
    }
  }, [isReasoningActive, isLoading])

  // Build the reasoning chain JSX using chain-of-thought component
  const headerText = isReasoningActive ? (
    <Shimmer duration={1}>Thinking</Shimmer>
  ) : (() => {
    const parts: string[] = []
    if (thinkingDuration !== undefined && thinkingDuration > 0) {
      parts.push(`Thought for ${thinkingDuration}s`)
    } else {
      parts.push('Thought for a few seconds')
    }
    if (currentToolCalls.length > 0) {
      parts.push(`${currentToolCalls.length} tool${currentToolCalls.length !== 1 ? 's' : ''} used`)
    }
    return parts.join(' · ')
  })()

  // Strip markdown formatting from narration for clean chain-of-thought display
  const stripMarkdown = (text: string): string =>
    text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#+ /g, '').replace(/`/g, '').trim()

  const formatNarration = (raw: string): string => {
    const clean = stripMarkdown(raw)
    const firstSentence = clean.match(/^[^.!?\n]+[.!?]?/)?.[0] || clean
    return firstSentence.length > 100 ? firstSentence.slice(0, 97) + '...' : firstSentence
  }

  /** Build chain-of-thought steps JSX for a subset of tool calls with their narrations */
  const buildToolStepsJSX = (tools: ToolCall[], narrations: string[], keyPrefix: string): React.ReactNode[] => {
    // Group consecutive same-name tool calls into collapsed steps
    const groups: { name: string; calls: ToolCall[] }[] = []
    for (const tc of tools) {
      const last = groups[groups.length - 1]
      if (last && last.name === tc.name) {
        last.calls.push(tc)
      } else {
        groups.push({ name: tc.name, calls: [tc] })
      }
    }

    const elements: React.ReactNode[] = []
    groups.forEach((group, gIdx) => {
      const ToolIcon = getToolIcon(group.name)
      const count = group.calls.length
      const anyRunning = group.calls.some(tc => tc.status === 'running')
      const status = anyRunning ? 'active' as const : 'complete' as const

      const narrationAfter = gIdx < narrations.length
        ? formatNarration(narrations[gIdx])
        : null

      if (count === 1) {
        const tc0 = group.calls[0]
        const detail = extractToolDetail(group.name, tc0.input, tc0.result)
        elements.push(
          <ChainOfThoughtStep
            key={`${keyPrefix}-tool-${gIdx}`}
            icon={ToolIcon}
            label={formatToolName(group.name)}
            detail={detail ?? undefined}
            status={tc0.status === 'running' ? 'active' : 'complete'}
          >
            {narrationAfter && (
              <span className="block text-sm italic text-muted-foreground leading-5">
                {narrationAfter}
              </span>
            )}
          </ChainOfThoughtStep>
        )
      } else {
        const COLLAPSED_LABELS: Record<string, (n: number) => string> = {
          read_message: (n) => `Read ${n} messages`,
          find_messages: (n) => `Searched ${n} conversations`,
          search_tasks: (n) => `Searched ${n} tasks`,
          search_contacts: (n) => `Searched ${n} contacts`,
          search_memory: () => `Searched memory`,
          create_task: (n) => `Created ${n} tasks`,
          update_task: (n) => `Updated ${n} tasks`,
          send_email: (n) => `Sent ${n} emails`,
          draft_reply: (n) => `Drafted ${n} replies`,
          log_activity: (n) => `Logged ${n} activities`,
          browse_website: (n) => `Browsed ${n} sites`,
        }
        const labelFn = COLLAPSED_LABELS[group.name]
        const label = anyRunning
          ? `${formatToolName(group.name)} (${count})`
          : labelFn ? labelFn(count) : `${formatToolName(group.name)} (${count})`

        elements.push(
          <ChainOfThoughtStep
            key={`${keyPrefix}-tool-${gIdx}`}
            icon={ToolIcon}
            label={label}
            status={status}
            expandable
          >
            {group.calls.map((tc, cIdx) => {
              const detail = extractToolDetail(group.name, tc.input, tc.result)
              return (
                <div
                  key={`${keyPrefix}-sub-${gIdx}-${cIdx}`}
                  className="flex items-center gap-2 pb-1 text-sm text-muted-foreground"
                >
                  <div className={`size-1 shrink-0 rounded-full ${tc.status === 'running' ? 'bg-muted-foreground' : 'bg-muted-foreground/50'}`} />
                  <span>{detail || formatToolName(group.name)}</span>
                  {!detail && (
                    <span className="inline-flex rounded-lg bg-muted px-2 py-px text-sm text-muted-foreground">
                      {`#${cIdx + 1}`}
                    </span>
                  )}
                </div>
              )
            })}
            {narrationAfter && (
              <span style={{
                display: 'block',
                fontSize: 14,
                color: 'var(--text-muted)',
                fontStyle: 'italic',
                fontWeight: 400,
                lineHeight: '20px',
                marginTop: 2,
              }}>
                {narrationAfter}
              </span>
            )}
          </ChainOfThoughtStep>
        )
      }
    })

    return elements
  }

  // Determine if we truly have interleaved content (text segments between tool segments).
  // A trailing text segment (the final response) doesn't count since MessageBubble handles it.
  const hasInterleavedSegments = (() => {
    // Count non-trailing text segments (text that appears between tool batches)
    const nonTrailingTextSegments = streamSegments.filter(
      (seg, idx) => seg.type === 'text' && idx < streamSegments.length - 1
    )
    return nonTrailingTextSegments.length > 0
  })()

  // Only show expandable content when there are actual steps (tools or narration)
  const hasChainContent = currentToolCalls.length > 0 || (narration && narration.length > 0)

  // Build segment-aware chain-of-thought JSX for the current streaming response.
  // When there are multiple segments (text interleaved between tool batches),
  // each tools segment gets its own ChainOfThought block.
  // When there's only a single tools segment, render the classic single block.
  const buildSegmentedReasoningJSX = (): React.ReactNode[] | null => {
    if (!showReasoningChain) return null

    // No interleaving: classic rendering with one chain-of-thought.
    // This covers: no segments, tools-only, or tools + trailing text.
    if (!hasInterleavedSegments) {
      const segHeaderText = isReasoningActive ? (
        <Shimmer duration={1}>Thinking</Shimmer>
      ) : (() => {
        const parts: string[] = []
        if (thinkingDuration !== undefined && thinkingDuration > 0) {
          parts.push(`Thought for ${thinkingDuration}s`)
        } else {
          parts.push('Thought for a few seconds')
        }
        if (currentToolCalls.length > 0) {
          parts.push(`${currentToolCalls.length} tool${currentToolCalls.length !== 1 ? 's' : ''} used`)
        }
        return parts.join(' \u00B7 ')
      })()

      return [
        <ChainOfThought key="cot-single" open={reasoningOpen} onOpenChange={setReasoningOpen}>
          <ChainOfThoughtHeader hideChevron={!hasChainContent}>{segHeaderText}</ChainOfThoughtHeader>
          {hasChainContent && <ChainOfThoughtContent>
            {buildToolStepsJSX(currentToolCalls, interToolNarrations, 'single')}
          </ChainOfThoughtContent>}
        </ChainOfThought>
      ]
    }

    // Multiple segments: interleaved rendering
    const elements: React.ReactNode[] = []
    let toolSegIdx = 0

    for (let sIdx = 0; sIdx < streamSegments.length; sIdx++) {
      const seg = streamSegments[sIdx]

      if (seg.type === 'tools') {
        const tools = currentToolCalls.slice(seg.startIdx, seg.endIdx + 1)
        const anyRunning = tools.some(tc => tc.status === 'running')
        const isLastToolSeg = !streamSegments.slice(sIdx + 1).some(s => s.type === 'tools')
        const segIsActive = anyRunning || (isLoading && isLastToolSeg)

        // Header for this tools segment
        const segHeader = segIsActive ? (
          <Shimmer duration={1}>Thinking</Shimmer>
        ) : (() => {
          const parts: string[] = []
          // Only show thinking duration on the first tools segment
          if (toolSegIdx === 0) {
            if (thinkingDuration !== undefined && thinkingDuration > 0) {
              parts.push(`Thought for ${thinkingDuration}s`)
            } else {
              parts.push('Thought for a few seconds')
            }
          } else {
            parts.push('Continued reasoning')
          }
          parts.push(`${tools.length} tool${tools.length !== 1 ? 's' : ''} used`)
          return parts.join(' \u00B7 ')
        })()

        // Each tools segment gets its own ChainOfThought.
        // Current active segment: controlled open state via reasoningOpen.
        // Past segments: uncontrolled (defaultOpen=false), user can click to expand.
        const isCurrentSegment = isLastToolSeg && isLoading
        elements.push(
          <div key={`seg-tools-${sIdx}`} style={{ marginBottom: 4 }}>
            {isCurrentSegment ? (
              <ChainOfThought open={reasoningOpen} onOpenChange={setReasoningOpen}>
                <ChainOfThoughtHeader>{segHeader}</ChainOfThoughtHeader>
                <ChainOfThoughtContent>
                  {buildToolStepsJSX(tools, seg.narrations, `seg-${sIdx}`)}
                </ChainOfThoughtContent>
              </ChainOfThought>
            ) : (
              <ChainOfThought defaultOpen={false}>
                <ChainOfThoughtHeader>{segHeader}</ChainOfThoughtHeader>
                <ChainOfThoughtContent>
                  {buildToolStepsJSX(tools, seg.narrations, `seg-${sIdx}`)}
                </ChainOfThoughtContent>
              </ChainOfThought>
            )}
          </div>
        )
        toolSegIdx++
      } else if (seg.type === 'text') {
        // Check if this is the LAST segment — if so, it's the final response
        // text which gets rendered via MessageBubble, so skip it here
        const isLastSegment = sIdx === streamSegments.length - 1
        if (!isLastSegment && seg.content.trim()) {
          // Intermediate text between tool batches — smooth-stream typing effect
          // Uses the same RAF adaptive speed as the final response's useSmoothStream
          const trimmed = seg.content.trim()
          elements.push(
            <div
              key={`seg-text-${sIdx}`}
              className="bb-chat__markdown"
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: 'var(--text-primary)',
                marginBottom: 4,
              }}
            >
              <SmoothText content={trimmed}>
                {(revealed) => (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {revealed}
                  </ReactMarkdown>
                )}
              </SmoothText>
            </div>
          )
        }
      }
    }

    return elements.length > 0 ? elements : null
  }

  // Legacy single-block JSX (used for backward compat checks)
  const reasoningChainJSX = showReasoningChain ? true : null
  // The actual segmented JSX
  const segmentedReasoningJSX = buildSegmentedReasoningJSX()

  // Fetch thread list for the drawer
  const threadCacheRef = useRef(false) // true once we've fetched at least once
  const fetchThreadList = useCallback(async (showSkeleton = true) => {
    if (showSkeleton && !threadCacheRef.current) setDrawerLoading(true)
    try {
      const res = await fetch('/api/agent/chat/history?list=threads&channel=web')
      if (res.ok) {
        const data = await res.json()
        setDrawerThreads(
          (data.threads || []).map((t: Record<string, unknown>) => ({
            id: t.id as string,
            title: t.title as string | null,
            lastActivity: t.lastActivity as string || t.last_activity_at as string || '',
            messageCount: t.messageCount as number || t.message_count as number || 0,
            preview: t.preview as string | null,
          }))
        )
        threadCacheRef.current = true
      }
    } catch {
      // Silently fail — drawer will show cached or empty state
    } finally {
      setDrawerLoading(false)
    }
  }, [])

  // On mount: pre-fetch thread list + restore history if we have a threadId from session
  useEffect(() => {
    fetchThreadList(false)
    const restoredId = sessionStorage.getItem(THREAD_STORAGE_KEY)
    if (restoredId && messages.length === 0) {
      fetch(`/api/agent/chat/history?threadId=${restoredId}&limit=50`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data?.messages?.length) return
          const allRows = data.messages as Array<Record<string, unknown>>
          const loaded: Message[] = []
          const restoredArtifacts: Array<{
            invoiceNumber: string; recipient: string; recipientEmail: string
            total: string; dueDate: string; description: string
            html: string; subject: string; afterMessageId: string
          }> = []
          let lastAsstId: string | null = null

          for (const m of allRows) {
            const role = m.role as string
            const id = m.id as string || `hist-${Math.random()}`
            if (role === 'user' || role === 'assistant') {
              loaded.push({
                id,
                role: role as 'user' | 'assistant',
                content: m.content as string || '',
                timestamp: new Date(m.created_at as string || Date.now()),
              })
              if (role === 'assistant') lastAsstId = id
            }
            if (role === 'tool_result' && m.tool_data) {
              const td = m.tool_data as Record<string, unknown>
              if (td.name === 'generate_invoice' && td.result) {
                const r = td.result as Record<string, unknown>
                if (r.html && r.invoice_number) {
                  restoredArtifacts.push({
                    invoiceNumber: r.invoice_number as string,
                    recipient: r.recipient as string || '',
                    recipientEmail: r.recipient_email as string || '',
                    total: r.total as string || '',
                    dueDate: r.due_date as string || '',
                    description: r.description as string || '',
                    html: r.html as string,
                    subject: r.subject as string || '',
                    afterMessageId: lastAsstId || id,
                  })
                }
              }
            }
          }
          setMessages(loaded)
          if (restoredArtifacts.length > 0) setInvoiceArtifacts(restoredArtifacts)
          setWhispersVisible(false)
        })
        .catch(() => {})
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchThreadList])

  // Open drawer — uses cached data, refreshes in background
  const handleOpenDrawer = useCallback(() => {
    setDrawerOpen(true)
    if (threadCacheRef.current) {
      // Already have data — refresh silently in background
      fetchThreadList(false)
    } else {
      fetchThreadList(true)
    }
  }, [fetchThreadList])

  // Switch to a different thread
  const handleSelectThread = useCallback(async (selectedThreadId: string) => {
    if (selectedThreadId === threadId) return

    // Reset UI state
    setMessages([])
    setNarration('')
    setThinkingContent('')
    setIsThinkingStreaming(false)
    narrationLockedRef.current = false
    narrationContentRef.current = ''
    interToolBufferRef.current = ''
    setInterToolNarrations([])
    setStreamSegments([])
    streamSegmentsRef.current = []
    hasPostToolTextRef.current = false
    setActiveCitations([])
    setPendingApprovals([])
    setInvoiceArtifacts([])
    smoothStream.reset()
    currentAssistantIdRef.current = null

    setThreadId(selectedThreadId)

    // Load history for the selected thread
    try {
      const res = await fetch(`/api/agent/chat/history?threadId=${selectedThreadId}&limit=50`)
      if (res.ok) {
        const data = await res.json()
        const allRows = (data.messages || []) as Array<Record<string, unknown>>
        const loaded: Message[] = []
        const restoredArtifacts: typeof invoiceArtifacts = []
        let lastAssistantId: string | null = null

        for (const m of allRows) {
          const role = m.role as string
          const id = m.id as string || `hist-${Math.random()}`

          if (role === 'user' || role === 'assistant') {
            loaded.push({
              id,
              role: role as 'user' | 'assistant',
              content: m.content as string || '',
              timestamp: new Date(m.created_at as string || Date.now()),
            })
            if (role === 'assistant') lastAssistantId = id
          }

          // Reconstruct invoice artifacts from tool_result rows
          if (role === 'tool_result' && m.tool_data) {
            const td = m.tool_data as Record<string, unknown>
            if (td.name === 'generate_invoice' && td.result) {
              const r = td.result as Record<string, unknown>
              if (r.html && r.invoice_number) {
                restoredArtifacts.push({
                  invoiceNumber: r.invoice_number as string,
                  recipient: r.recipient as string || '',
                  recipientEmail: r.recipient_email as string || '',
                  total: r.total as string || '',
                  dueDate: r.due_date as string || '',
                  description: r.description as string || '',
                  html: r.html as string,
                  subject: r.subject as string || '',
                  afterMessageId: lastAssistantId || id,
                })
              }
            }
          }
        }

        setMessages(loaded)
        if (restoredArtifacts.length > 0) setInvoiceArtifacts(restoredArtifacts)
        setWhispersVisible(loaded.length === 0)
      }
    } catch {
      // Failed to load — user sees empty state
    }
  }, [threadId, smoothStream])

  const handleNewConversation = useCallback(() => {
    // Archive current thread and start fresh
    if (threadId) {
      fetch('/api/agent/chat/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId }),
      }).catch(() => {}) // fire-and-forget archive
    }
    setMessages([])
    setThreadId(null)
    setNarration('')
    setThinkingContent('')
    setIsThinkingStreaming(false)
    narrationLockedRef.current = false
    narrationContentRef.current = ''
    interToolBufferRef.current = ''
    setInterToolNarrations([])
    setStreamSegments([])
    streamSegmentsRef.current = []
    hasPostToolTextRef.current = false
    setActiveCitations([])
    setPendingApprovals([])
    setInvoiceArtifacts([])
    smoothStream.reset()
    currentAssistantIdRef.current = null
    setWhispersVisible(true)
  }, [threadId, smoothStream])

  // Listen for slash command events
  useEffect(() => {
    const handler = (e: Event) => {
      const cmdId = (e as CustomEvent<string>).detail
      if (cmdId === 'new') handleNewConversation()
      if (cmdId === 'history') handleOpenDrawer()
      if (cmdId === 'clear') handleNewConversation()
      if (cmdId === 'search') setDrawerOpen(true) // Drawer will show search
      if (cmdId === 'memory') {
        window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'knowledge' } }))
      }
      if (cmdId === 'export') {
        const btn = document.querySelector<HTMLButtonElement>('[aria-label="Export conversation"]')
        btn?.click()
      }
    }
    window.addEventListener(CHAT_COMMAND_EVENT, handler)
    return () => window.removeEventListener(CHAT_COMMAND_EVENT, handler)
  }, [handleNewConversation, handleOpenDrawer])

  // Delete (archive) a thread from the drawer
  const handleDeleteThread = useCallback(async (deleteThreadId: string) => {
    // Optimistic removal from drawer list
    setDrawerThreads(prev => prev.filter(t => t.id !== deleteThreadId))

    // Archive on server
    fetch('/api/agent/chat/history', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: deleteThreadId }),
    }).catch(() => {})

    // If we deleted the active thread, reset to fresh state
    if (deleteThreadId === threadId) {
      setMessages([])
      setThreadId(null)
      setWhispersVisible(true)
    }
  }, [threadId, setThreadId])

  // Drag-and-drop handlers for file upload
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounterRef.current = 0
    setIsDragOver(false)
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      dragUpload.addFiles(files)
    }
  }, [dragUpload])

  return (
    <div
      className={`bb-chat bg-background ${chatStarted ? 'bb-chat--active' : 'bb-chat--pre-session'}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drop zone overlay */}
      {isDragOver && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(59, 130, 246, 0.08)',
          border: '2px dashed rgba(59, 130, 246, 0.4)',
          borderRadius: '12px',
          pointerEvents: 'none',
        }}>
          <span style={{
            color: 'rgba(59, 130, 246, 0.8)',
            fontSize: '16px',
            fontWeight: 500,
          }}>
            Drop files to attach
          </span>
        </div>
      )}
      {/* Conversation drawer toggle — always visible */}
      <button
        className="bb-chat__drawer-toggle"
        onClick={handleOpenDrawer}
        title="Conversations"
      >
        <IconMenu2 size={18} stroke={1.8} />
      </button>

      {/* Export menu — vertically centered in topbar, offset left to avoid notification bell */}
      {hasMessages && (
        <div style={{ position: 'absolute', top: 0, right: 52, height: 'var(--topbar-height)', display: 'flex', alignItems: 'center', zIndex: 10 }}>
          <ExportMenu messages={messages} />
        </div>
      )}

      {/* Conversation drawer — pure CSS animations for performance */}
      {drawerOpen && (
        <ConversationDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          threads={drawerThreads}
          activeThreadId={threadId}
          onSelectThread={handleSelectThread}
          onNewConversation={handleNewConversation}
          onDeleteThread={handleDeleteThread}
          isLoading={drawerLoading}
        />
      )}
      {/* Messages or empty state */}
      <div
        className={`bb-chat__messages ${!hasMessages ? 'bb-chat__messages--empty' : ''}`}
        ref={scrollRef}
      >
        <AnimatePresence mode="wait">
          {!hasMessages ? (
            <motion.div
              key="empty"
              className="bb-chat__empty"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0 } }}
              transition={{ duration: 0.3 }}
            >
              <div className="bb-chat__center-cluster">
                <ChatBitBitFace />
                <h2 className="bb-chat__greeting">
                  {getGreeting()}{userName ? `, ${userName}` : ''}
                </h2>
                <Whispers onTapWhisper={handleWhisperTap} visible={whispersVisible} />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="messages"
              className="bb-chat__msg-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
            >
              {messages.map((msg, i) => {
                const prev = messages[i - 1]
                const isGroupChange = prev && prev.role !== msg.role
                // Avatar only on the very last assistant message in the entire conversation
                const isLastAssistantOverall = msg.role === 'assistant' && !messages.slice(i + 1).some(m => m.role === 'assistant')
                const isCurrentResponse = msg.id === currentAssistantIdRef.current
                const checkpoint = checkpoints.find(cp => cp.afterMessageId === msg.id)

                return (
                  <div
                    key={msg.id}
                    className={isGroupChange ? 'bb-chat__msg-group-gap' : ''}
                  >
                    {/* Pre-tool narration is now included in streamSegments as the first text segment */}
                    {/* Live reasoning chain — segmented (interleaved tools/text) */}
                    {isCurrentResponse && segmentedReasoningJSX && (
                      <div style={{ marginBottom: 4 }}>
                        <div className="bb-chat__assistant-icon">
                          <BitBitAsciiAvatar size={48} emotion={avatarEmotion} isThinking={isThinkingStreaming} />
                        </div>
                        {segmentedReasoningJSX}
                      </div>
                    )}
                    {/* Past response — collapsed reasoning chain */}
                    {!isCurrentResponse && msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <ChainOfThought defaultOpen={false}>
                          <ChainOfThoughtHeader>
                            {`Thought for a few seconds \u00B7 ${msg.toolCalls.length} tool${msg.toolCalls.length !== 1 ? 's' : ''} used`}
                          </ChainOfThoughtHeader>
                          <ChainOfThoughtContent>
                            {msg.toolCalls.map((tc, tcIdx) => {
                              const ToolIcon = getToolIcon(tc.name)
                              const detail = extractToolDetail(tc.name, tc.input, tc.result)
                              const summary = extractResultSummary(tc.name, tc.result, tc.success)
                              return (
                                <ChainOfThoughtStep
                                  key={tcIdx}
                                  icon={ToolIcon}
                                  label={formatToolName(tc.name)}
                                  detail={detail ?? undefined}
                                                  status="complete"
                                />
                              )
                            })}
                          </ChainOfThoughtContent>
                        </ChainOfThought>
                      </div>
                    )}
                    {/* Inline attachment previews — rendered above message text */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className={msg.role === 'user' ? 'bb-chat__msg bb-chat__msg--user' : 'bb-chat__msg bb-chat__msg--assistant'}>
                        <div style={{ maxWidth: 480 }}>
                          <ChatAttachmentList attachments={msg.attachments} />
                        </div>
                      </div>
                    )}
                    <MessageBubble
                      message={(() => {
                        // When segments include text that's already rendered above,
                        // strip it from the final MessageBubble to avoid duplication.
                        if (!isCurrentResponse || !hasInterleavedSegments) return msg
                        const textSegs = streamSegments.filter(s => s.type === 'text') as Array<{ type: 'text'; content: string }>
                        // Determine which text segments are already rendered by the segment builder
                        // (everything except the trailing text segment, which is the final response)
                        const lastSegType = streamSegments[streamSegments.length - 1]?.type
                        const alreadyRendered = lastSegType === 'text'
                          ? textSegs.slice(0, -1) // Last segment is text = final response, strip the rest
                          : textSegs // Last segment is tools = ALL text segments are intermediate, strip all
                        if (alreadyRendered.length === 0) return msg
                        let cleaned = msg.content
                        for (const seg of alreadyRendered) {
                          const trimmed = seg.content.trim()
                          const idx = cleaned.indexOf(trimmed)
                          if (idx !== -1) {
                            cleaned = (cleaned.slice(0, idx) + cleaned.slice(idx + trimmed.length)).trim()
                          }
                        }
                        return { ...msg, content: cleaned }
                      })()}
                      showAvatar={isLastAssistantOverall && !segmentedReasoningJSX && !showReasoningChain}
                      avatarEmotion={isCurrentResponse ? avatarEmotion : 'neutral'}
                      avatarThinking={isCurrentResponse ? isThinkingStreaming : false}
                      avatarActivity={isCurrentResponse ? avatarActivity : 'idle'}
                      citations={msg.citations || (isLastAssistantOverall && isLoading ? activeCitations : undefined)}
                      onRegenerate={isLastAssistantOverall && !isLoading ? handleRegenerate : undefined}
                      onEdit={msg.role === 'user' ? handleEditMessage : undefined}
                      onOpenArtifact={handleOpenArtifact}
                    />
                    {/* Checkpoints are internal system state — hidden from users */}
                    {/* Invoice artifacts — anchored to the message that generated them */}
                    {invoiceArtifacts.filter(inv => inv.afterMessageId === msg.id).map(inv => (
                      <motion.div key={inv.invoiceNumber} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} style={{ marginTop: 8 }}>
                        <InvoiceArtifact invoiceNumber={inv.invoiceNumber} recipient={inv.recipient} recipientEmail={inv.recipientEmail} total={inv.total} dueDate={inv.dueDate} description={inv.description} html={inv.html} subject={inv.subject} />
                      </motion.div>
                    ))}
                  </div>
                )
              })}

              {/* Standalone reasoning chain (before assistant message exists) */}
              {showReasoningChain && !currentResponseMsg && segmentedReasoningJSX && (
                <div style={{ position: 'relative', marginBottom: 4 }}>
                  <div className="bb-chat__assistant-icon">
                    <BitBitAsciiAvatar size={64} emotion={avatarEmotion} isThinking={isThinkingStreaming} />
                  </div>
                  {segmentedReasoningJSX}
                </div>
              )}

              {/* Inline approval cards */}
              {pendingApprovals.map(approval => (
                <motion.div
                  key={approval.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                  style={{ marginTop: 8, maxWidth: 480 }}
                >
                  <InlineApprovalCard
                    approval={approval}
                    onApprove={(id) => handleApprovalDecision(id, 'approved')}
                    onReject={(id) => handleApprovalDecision(id, 'rejected')}
                  />
                </motion.div>
              ))}

              {/* Follow-up suggestions */}
              {!isLoading && !smoothStream.isBuffering && followUps.length > 0 && messages.length > 0 && (
                <FollowUpChips
                  suggestions={followUps}
                  onSelect={(text) => handleSend(text)}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Docked pill input */}
      <div
        className={`bb-chat__input-area ${chatStarted ? 'bb-chat__input-area--bottom' : 'bb-chat__input-area--centered'}`}
      >
        {/* Scroll-to-bottom button — anchored above the input pill */}
        <AnimatePresence>
          {smartScroll.shouldShowScrollButton && (
            <motion.button
              className="bb-chat__scroll-btn"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.2 }}
              onClick={smartScroll.scrollToBottom}
              aria-label="Scroll to bottom"
            >
              <IconChevronDown size={18} />
            </motion.button>
          )}
        </AnimatePresence>
        {/* Drag-and-drop upload progress */}
        {dragUpload.uploads.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            padding: '4px 8px',
            marginBottom: '4px',
            fontSize: '12px',
            color: 'var(--text-secondary, rgba(255,255,255,0.7))',
          }}>
            {dragUpload.uploads.map(item => (
              <span key={item.id} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '6px',
                background: item.status === 'error'
                  ? 'rgba(239,68,68,0.15)'
                  : 'rgba(255,255,255,0.06)',
                color: item.status === 'error'
                  ? 'var(--bb-color-error, #ef4444)'
                  : undefined,
              }}>
                {item.filename}
                {item.status === 'uploading' && ` ${item.progress}%`}
                {item.status === 'ready' && ' ✓'}
                {item.status === 'error' && ` — ${item.error}`}
                <button
                  type="button"
                  onClick={() => dragUpload.removeUpload(item.id)}
                  style={{
                    background: 'none', border: 'none', padding: '0 2px',
                    cursor: 'pointer', color: 'inherit', opacity: 0.6,
                    fontSize: '14px', lineHeight: 1,
                  }}
                >
                  x
                </button>
              </span>
            ))}
          </div>
        )}
        <div id="pill-dock" />
      </div>

      {/* Artifact Panel */}
      <ArtifactPanel artifact={activeArtifact} onClose={closeArtifact} />
    </div>
  )
}