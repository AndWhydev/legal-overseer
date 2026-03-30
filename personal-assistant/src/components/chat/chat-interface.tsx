'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MessageBubble } from './message-bubble'
import {
  IconChevronDown, IconLoader2, IconCheck, IconX, IconMenu2,
} from '@tabler/icons-react'
import { ConversationDrawer, type Thread } from './conversation-drawer'
import { ChatBitBitFace } from './chat-bitbit-face'
import { useAvatarEmotion } from './use-avatar-emotion'
import { useSmoothStream } from './use-smooth-stream'
import { useSmartScroll } from './use-smart-scroll'
import { Whispers } from './whispers'
import { FollowUpChips } from './follow-up-chips'
import type { Whisper } from '@/lib/whispers/types'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { InvoiceArtifact } from './invoice-artifact'
import { ChatAttachmentList } from './chat-attachment'
import { CHAT_ATTACHMENTS_EVENT, CHAT_COMMAND_EVENT } from '@/components/dashboard/voice-pill'
import { useFileUpload } from '@/hooks/use-file-upload'
import { useArtifacts } from './use-artifacts'
import { ArtifactPanel } from './artifact-panel'
import { ExportMenu } from './export-menu'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SmoothText } from './smooth-text'
import { ToolCallsSection } from '@/components/ui/tool-calls-section'
import {
  extractToolDetail,
  formatToolName,
  getToolCallIcon as getToolIcon,
  normalizeToolCallEntry,
} from '@/lib/tool-calls/presentation'

interface ToolCall {
  id?: string
  name: string
  input: unknown
  result?: unknown
  success?: boolean
  status: 'running' | 'done' | 'error'
  elapsedMs?: number
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

function findStreamingToolIndex(
  toolCalls: ToolCall[],
  eventData: { callId?: string; name: string }
): number {
  if (eventData.callId) {
    const exactMatch = toolCalls.findIndex(tc => tc.id === eventData.callId)
    if (exactMatch !== -1) return exactMatch
  }

  return toolCalls.findIndex(
    tc => tc.name === eventData.name && tc.status === 'running'
  )
}

function buildToolSectionSummary(toolCount: number, thinkingSeconds?: number, prefix?: string): string {
  const parts: string[] = []

  if (prefix) {
    parts.push(prefix)
  } else if (thinkingSeconds !== undefined && thinkingSeconds > 0) {
    parts.push(`Thought for ${thinkingSeconds}s`)
  } else {
    parts.push('Thought for a few seconds')
  }

  parts.push(`${toolCount} tool${toolCount !== 1 ? 's' : ''} used`)
  return parts.join(' \u00B7 ')
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

  const toolIcon = getToolIcon(approval.toolName)

  const cardStyle: React.CSSProperties = {
    padding: '12px 16px',
    borderRadius: 'var(--radius-lg)',
    background: 'var(--card)',
    border: isApproved
      ? '1px solid var(--status-success-border)'
      : isRejected
        ? '1px solid var(--status-error-border)'
        : '1px solid var(--border)',
    boxShadow: 'var(--card-shadow)',
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
    borderRadius: 'var(--radius-sm)',
    background: isApproved
      ? 'var(--status-success-bg)'
      : isRejected
        ? 'var(--status-error-bg)'
        : 'var(--muted)',
    flexShrink: 0,
    marginTop: 1,
  }

  const iconColor = isApproved
    ? 'var(--status-success-fg)'
    : isRejected
      ? 'var(--status-error-fg)'
      : 'var(--text-secondary)'
  const toolIconNode = React.createElement(toolIcon, { size: 14, color: iconColor })
  const toolLabelIconNode = React.createElement(toolIcon, { size: 10 })

  const summaryStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 500,
    color: 'var(--text-primary)',
    lineHeight: 1.4,
    flex: 1,
    minWidth: 0,
  }

  const toolLabelStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 8px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--secondary)',
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: '0.02em',
    color: 'var(--text-secondary)',
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
    borderRadius: 'var(--radius-md)',
    background: 'var(--primary)',
    border: 'none',
    color: 'var(--primary-foreground)',
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
    borderRadius: 'var(--radius-md)',
    background: 'transparent',
    border: '1px solid var(--status-error-border)',
    color: 'var(--status-error-fg)',
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
            toolIconNode
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={summaryStyle}>{approval.actionSummary}</div>
          <div style={toolLabelStyle}>
            {toolLabelIconNode}
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
  // Reasoning chain state
  const prevReasoningActiveRef = useRef(false)

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- smartScroll uses refs, stable identity not needed
  }, [smoothStream.displayedContent])

  // Auto-scroll on thinking content changes
  useEffect(() => {
    smartScroll.onContentUpdate()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- smartScroll uses refs, stable identity not needed
  }, [thinkingContent, isThinkingStreaming])

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
    prevReasoningActiveRef.current = false
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

              // Plan/stage events still processed for tool matching
              case 'stage':
              case 'plan':
              case 'checkpoint':
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
                  id: event.data.callId,
                  name: event.data.name,
                  input: event.data.input,
                  status: 'running',
                }
                const newToolIdx = toolCalls.length  // index before push
                toolCalls.push(tc)

                // --- Stream segments: track chronological tool/text order ---
                const segs = streamSegmentsRef.current

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
                const idx = findStreamingToolIndex(toolCalls, event.data)
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
                  const matchedTool = idx !== -1
                    ? toolCalls[idx]
                    : toolCalls.find(tc => tc.id === event.data.callId || tc.name === event.data.name)
                  const matchedInput = matchedTool?.input
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

              case 'tool_progress': {
                // Heartbeat: update elapsed time on running tools
                const progressIdx = findStreamingToolIndex(toolCalls, event.data)
                if (progressIdx !== -1) {
                  toolCalls[progressIdx] = { ...toolCalls[progressIdx], elapsedMs: event.data.elapsed_ms }
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantId ? { ...m, toolCalls: [...toolCalls] } : m
                    )
                  )
                }
                break
              }

              case 'synthesis_start': {
                // Post-tool synthesis starting — show composing indicator
                setIsThinkingStreaming(true)
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
  }, [dragUpload, followUps.length, isLoading, setThreadId, smoothStream, smartScroll, threadId])

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

  // Track reasoning transitions for downstream effects
  useEffect(() => {
    prevReasoningActiveRef.current = isReasoningActive
  }, [isReasoningActive])

  // Strip markdown formatting from narration for clean chain-of-thought display
  const stripMarkdown = (text: string): string =>
    text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/#+ /g, '').replace(/`/g, '').trim()

  const formatNarration = (raw: string): string => {
    const clean = stripMarkdown(raw)
    const firstSentence = clean.match(/^[^.!?\n]+[.!?]?/)?.[0] || clean
    return firstSentence.length > 100 ? firstSentence.slice(0, 97) + '...' : firstSentence
  }

  const renderNarrationNotes = (narrations: string[], keyPrefix: string): React.ReactNode[] =>
    narrations
      .map((note, idx) => {
        const formatted = formatNarration(note)
        if (!formatted) return null

        return (
          <div
            key={`${keyPrefix}-note-${idx}`}
            className="pl-2 text-sm italic text-muted-foreground"
          >
            {formatted}
          </div>
        )
      })
      .filter(Boolean) as React.ReactNode[]

  const renderToolSection = (
    tools: ToolCall[],
    key: string,
    summary: string,
    defaultExpanded: boolean
  ): React.ReactNode | null => {
    if (tools.length === 0) return null

    return (
      <ToolCallsSection
        key={key}
        toolCalls={tools.map((tool, index) => normalizeToolCallEntry(tool, index))}
        defaultExpanded={defaultExpanded}
        summary={summary}
        className="max-w-[min(72ch,100%)]"
      />
    )
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

  // Build segment-aware chain-of-thought JSX for the current streaming response.
  //
  // Two rendering modes:
  //   ACTIVE  — reasoning in progress: tool steps stream in directly (no wrapper)
  //   COMPLETE — reasoning done: steps collapse under "Thought for Xs" summary header
  //
  // The transition ensures the summary only appears once tool steps finish streaming.
  const buildSegmentedReasoningJSX = (): React.ReactNode[] | null => {
    if (!showReasoningChain) return null

    // ── ACTIVE MODE: show tool steps inline as they stream ──
    if (isReasoningActive) {
      if (currentToolCalls.length === 0) {
        // Thinking only (no tools yet) — show shimmer indicator
        return [
          <motion.div
            key="cot-thinking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
            className="text-muted-foreground text-sm flex items-center gap-1.5 py-1"
          >
            <Shimmer duration={1}>Thinking</Shimmer>
          </motion.div>
        ]
      }

      // Tools are running — show steps directly with an animated thread line
      const elements: React.ReactNode[] = []

      if (!hasInterleavedSegments) {
        const section = renderToolSection(
          currentToolCalls,
          'active-steps',
          buildToolSectionSummary(currentToolCalls.length, undefined, 'Working through tools'),
          true
        )
        if (section) elements.push(section)
        elements.push(...renderNarrationNotes(interToolNarrations, 'active'))
      } else {
        // Interleaved: show each segment's tools + intermediate text
        for (let sIdx = 0; sIdx < streamSegments.length; sIdx++) {
          const seg = streamSegments[sIdx]
          if (seg.type === 'tools') {
            const tools = currentToolCalls.slice(seg.startIdx, seg.endIdx + 1)
            const section = renderToolSection(
              tools,
              `active-seg-${sIdx}`,
              buildToolSectionSummary(tools.length, undefined, sIdx === 0 ? 'Working through tools' : 'Continuing with tools'),
              true
            )
            if (section) elements.push(section)
            elements.push(...renderNarrationNotes(seg.narrations, `active-${sIdx}`))
          } else if (seg.type === 'text') {
            const isLastSegment = sIdx === streamSegments.length - 1
            if (!isLastSegment && seg.content.trim()) {
              elements.push(
                <div
                  key={`active-text-${sIdx}`}
                  className="bb-chat__bubble--assistant bb-chat__markdown"
                  style={{ marginBottom: 4 }}
                >
                  <SmoothText content={seg.content.trim()}>
                    {(revealed) => (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{revealed}</ReactMarkdown>
                    )}
                  </SmoothText>
                </div>
              )
            }
          }
        }
      }

      return elements.length > 0 ? elements : null
    }

    // ── COMPLETE MODE: reasoning finished — collapse into summary ──
    if (!hasInterleavedSegments) {
      const section = renderToolSection(
        currentToolCalls,
        'cot-complete',
        buildToolSectionSummary(currentToolCalls.length, thinkingDuration),
        false
      )

      return section ? [section, ...renderNarrationNotes(interToolNarrations, 'complete')] : null
    }

    // Interleaved: each tool segment gets its own collapsed summary
    const elements: React.ReactNode[] = []
    let toolSegIdx = 0

    for (let sIdx = 0; sIdx < streamSegments.length; sIdx++) {
      const seg = streamSegments[sIdx]

      if (seg.type === 'tools') {
        const tools = currentToolCalls.slice(seg.startIdx, seg.endIdx + 1)

        elements.push(
          <motion.div
            key={`seg-tools-${sIdx}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: toolSegIdx * 0.08, ease: [0.25, 1, 0.5, 1] }}
            style={{ marginBottom: 4 }}
          >
            {renderToolSection(
              tools,
              `seg-${sIdx}`,
              buildToolSectionSummary(
                tools.length,
                toolSegIdx === 0 ? thinkingDuration : undefined,
                toolSegIdx === 0 ? undefined : 'Continued reasoning'
              ),
              false
            )}
          </motion.div>
        )
        elements.push(...renderNarrationNotes(seg.narrations, `seg-${sIdx}`))
        toolSegIdx++
      } else if (seg.type === 'text') {
        const isLastSegment = sIdx === streamSegments.length - 1
        if (!isLastSegment && seg.content.trim()) {
          elements.push(
            <div
              key={`seg-text-${sIdx}`}
              className="bb-chat__bubble--assistant bb-chat__markdown"
              style={{ marginBottom: 4 }}
            >
              <SmoothText content={seg.content.trim()}>
                {(revealed) => (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{revealed}</ReactMarkdown>
                )}
              </SmoothText>
            </div>
          )
        }
      }
    }

    return elements.length > 0 ? elements : null
  }

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
  }, [setThreadId, smoothStream, threadId])

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
  }, [setThreadId, smoothStream, threadId])

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
          background: 'var(--status-info-bg)',
          border: '2px dashed var(--status-info-border)',
          borderRadius: 'var(--radius-lg)',
          pointerEvents: 'none',
        }}>
          <span style={{
            color: 'var(--status-info-fg)',
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
                return (
                  <div
                    key={msg.id}
                    className={isGroupChange ? 'bb-chat__msg-group-gap' : ''}
                  >
                    {/* Live reasoning chain — active steps or collapsed summary */}
                    <AnimatePresence mode="wait">
                      {isCurrentResponse && segmentedReasoningJSX && (
                        <motion.div
                          key={isReasoningActive ? 'reasoning-active' : 'reasoning-complete'}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
                          style={{ marginBottom: 4 }}
                        >
                          {segmentedReasoningJSX}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {/* Past response — collapsed reasoning chain */}
                    {!isCurrentResponse && msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <ToolCallsSection
                          toolCalls={msg.toolCalls.map((tool, index) => normalizeToolCallEntry(tool, index))}
                          defaultExpanded={false}
                          summary={buildToolSectionSummary(msg.toolCalls.length)}
                          className="max-w-[min(72ch,100%)]"
                        />
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
              <AnimatePresence>
                {showReasoningChain && !currentResponseMsg && segmentedReasoningJSX && (
                  <motion.div
                    key="standalone-reasoning"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
                    style={{ marginBottom: 4 }}
                  >
                    {segmentedReasoningJSX}
                  </motion.div>
                )}
              </AnimatePresence>

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
            color: 'var(--text-secondary)',
          }}>
            {dragUpload.uploads.map(item => (
              <span key={item.id} style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                background: item.status === 'error'
                  ? 'var(--status-error-bg)'
                  : 'var(--secondary)',
                color: item.status === 'error'
                  ? 'var(--status-error-fg)'
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
