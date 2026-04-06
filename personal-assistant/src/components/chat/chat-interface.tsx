'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
import { mermaid } from '@streamdown/mermaid'
import { MessageBubble } from './message-bubble'
import {
  IconChevronDown, IconLoader2, IconCheck, IconX,
} from '@tabler/icons-react'
import { ChatBitBitFace } from './chat-bitbit-face'
import { useSmoothStream } from './use-smooth-stream'
import { useSmartScroll } from './use-smart-scroll'
import { Whispers } from './whispers'

import type { Whisper } from '@/lib/whispers/types'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Reasoning, ReasoningTrigger, ReasoningContent } from '@/components/ai-elements/reasoning'
import {
  Plan,
  PlanHeader,
  PlanTitle,
  PlanDescription,
  PlanAction,
  PlanContent,
  PlanTrigger,
} from '@/components/ai-elements/plan'
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationRequest,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationActions,
  ConfirmationAction,
} from '@/components/ai-elements/confirmation'
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion'
import { cn } from '@/lib/utils'
import { InvoiceArtifact } from './invoice-artifact'
import { ChatAttachmentList } from './chat-attachment'
import { SourcesFooter } from './sources-footer'
import { CHAT_ATTACHMENTS_EVENT, CHAT_COMMAND_EVENT } from '@/components/dashboard/voice-pill'
import { useFileUpload } from '@/hooks/use-file-upload'
import { useArtifacts } from './use-artifacts'
import { ArtifactPanel } from './artifact-panel'
import { ExportMenu } from './export-menu'
import { useChatThreads } from './chat-threads-context'
import { SmoothText } from './smooth-text'
import { useUserProfile } from '@/lib/user/user-profile-context'
import { getPersonalisedGreeting } from '@/lib/chat/personalised-greeting'
import { ToolCallsSection } from '@/components/ui/tool-calls-section'
import { BitBitHeader } from './bitbit-header'
import {
  extractToolDetail,
  formatToolName,
  getToolCallIcon as getToolIcon,
  normalizeToolCallEntry,
} from '@/lib/tool-calls/presentation'
import { Streamdown } from 'streamdown'

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

interface PlanStage {
  id: string
  title: string
  description?: string
  status: 'pending' | 'in_progress' | 'complete' | 'error'
}

interface PlanData {
  title: string
  description?: string
  stages: PlanStage[]
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

type HistoryRow = Record<string, unknown>

type RestoredInvoiceArtifact = {
  invoiceNumber: string
  recipient: string
  recipientEmail: string
  total: string
  dueDate: string
  description: string
  html: string
  subject: string
  afterMessageId: string
}

type PersistedToolTrace = {
  id?: string
  name?: string
  input?: unknown
  result?: unknown
  success?: boolean
  queued?: boolean
  approvalId?: string
  elapsedMs?: number
}

const streamdownPlugins = { cjk, code, math, mermaid }


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function restoreHistory(rows: HistoryRow[]): {
  messages: Message[]
  invoiceArtifacts: RestoredInvoiceArtifact[]
} {
  const loaded: Message[] = []
  const invoiceArtifacts: RestoredInvoiceArtifact[] = []
  const assistantIndexById = new Map<string, number>()
  let lastAssistantId: string | null = null

  const getAssistantMessage = (assistantMessageId: string | null): Message | null => {
    if (!assistantMessageId) return null
    const index = assistantIndexById.get(assistantMessageId)
    return typeof index === 'number' ? loaded[index] : null
  }

  const ensureToolCall = (
    target: Message,
    toolId: string | undefined,
    toolName: string,
    input: unknown,
  ): ToolCall => {
    const existing = target.toolCalls?.find(tc => (toolId && tc.id === toolId) || tc.name === toolName)
    if (existing) return existing

    const created: ToolCall = {
      id: toolId,
      name: toolName,
      input,
      status: 'running',
    }
    target.toolCalls = [...(target.toolCalls || []), created]
    return created
  }

  const applyToolTrace = (target: Message, trace: PersistedToolTrace) => {
    const toolName = trace.name || 'tool'
    const restoredCall = ensureToolCall(target, trace.id, toolName, trace.input)
    restoredCall.result = trace.result
    restoredCall.success = trace.success
    restoredCall.status = trace.success === false ? 'error' : 'done'
    if (typeof trace.elapsedMs === 'number') {
      restoredCall.elapsedMs = trace.elapsedMs
    }

    if (toolName === 'generate_invoice' && trace.result && isRecord(trace.result)) {
      const result = trace.result
      if (result.html && result.invoice_number) {
        invoiceArtifacts.push({
          invoiceNumber: result.invoice_number as string,
          recipient: result.recipient as string || '',
          recipientEmail: result.recipient_email as string || '',
          total: result.total as string || '',
          dueDate: result.due_date as string || '',
          description: result.description as string || '',
          html: result.html as string,
          subject: result.subject as string || '',
          afterMessageId: target.id,
        })
      }
    }
  }

  for (const row of rows) {
    const role = row.role as string
    const id = row.id as string || `hist-${Math.random()}`
    const metadata = isRecord(row.metadata) ? row.metadata : {}
    const toolData = isRecord(row.tool_data) ? row.tool_data : null

    if (role === 'user' || role === 'assistant') {
      const nextMessage: Message = {
        id,
        role: role as 'user' | 'assistant',
        content: row.content as string || '',
        timestamp: new Date(row.created_at as string || Date.now()),
      }
      loaded.push(nextMessage)

      if (role === 'assistant') {
        lastAssistantId = id
        assistantIndexById.set(id, loaded.length - 1)

        const persistedToolCalls = Array.isArray(metadata.tool_calls)
          ? metadata.tool_calls.filter(isRecord) as PersistedToolTrace[]
          : []
        for (const trace of persistedToolCalls) {
          applyToolTrace(nextMessage, trace)
        }
      }
      continue
    }

    if (!toolData || (role !== 'tool_call' && role !== 'tool_result')) {
      continue
    }

    const assistantMessageId = (metadata.assistant_message_id as string | undefined) || lastAssistantId
    const targetAssistant = getAssistantMessage(assistantMessageId)
    if (!targetAssistant) continue

    const toolId = (toolData.id as string | undefined) || (metadata.call_id as string | undefined)
    const toolName = (toolData.name as string | undefined) || 'tool'

    if (role === 'tool_call') {
      const restoredCall = ensureToolCall(targetAssistant, toolId, toolName, toolData.input)
      if (typeof toolData.elapsedMs === 'number') {
        restoredCall.elapsedMs = toolData.elapsedMs
      }
      continue
    }

    applyToolTrace(targetAssistant, {
      id: toolId,
      name: toolName,
      input: toolData.input,
      result: toolData.result,
      success: typeof toolData.success === 'boolean' ? toolData.success : true,
      queued: typeof toolData.queued === 'boolean' ? toolData.queued : undefined,
      approvalId: typeof toolData.approvalId === 'string' ? toolData.approvalId : undefined,
      elapsedMs: typeof toolData.elapsedMs === 'number' ? toolData.elapsedMs : undefined,
    })
  }

  return { messages: loaded, invoiceArtifacts }
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

  parts.push(`${toolCount} tool${toolCount !== 1 ? 's' : ''}`)
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
          <Shimmer duration={1.2} as="span">Resolving...</Shimmer>
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

export function ChatInterface() {
  const { firstName } = useUserProfile()
  const greeting = getPersonalisedGreeting({ firstName: firstName || undefined })
  const {
    activeThreadId: threadId,
    newConversationRequest,
    refreshThreads,
    requestNewConversation,
    requestThreadPanelFocus,
    selectionRequest,
    setResolvedThreadId: setThreadId,
  } = useChatThreads()
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
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
  const [completedNarrationSegments, setCompletedNarrationSegments] = useState<Record<string, boolean>>({})
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
  const [imageArtifacts, setImageArtifacts] = useState<Array<{
    id: string; images: Array<{ url?: string; base64?: string; index?: number }>
    prompt: string; model: string; afterMessageId: string
  }>>([])
  // Whispers visible state (hides when typing or conversation starts)
  const [whispersVisible, setWhispersVisible] = useState(true)
  // Loading state for thread history (shows spinner when switching conversations)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  // Follow-up suggestions state
  const [followUps, setFollowUps] = useState<string[]>([])
  // Execution plan state
  const [planData, setPlanData] = useState<PlanData | null>(null)
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
        // Build the full content by combining any existing intermediate narration
        // segments with the current smooth-streaming text (which represents the 
        // last text segment in the chronological stream).
        const segments = streamSegmentsRef.current
        const intermediateNarrations = segments
          .filter((s, idx) => s.type === 'text' && idx < segments.length - 1)
          .map(s => (s as { type: 'text'; content: string }).content.trim())
          .filter(Boolean)

        const fullContent = intermediateNarrations.length > 0
          ? intermediateNarrations.join('\n\n') + '\n\n' + smoothStream.displayedContent
          : smoothStream.displayedContent

        return prev.map(m =>
          m.id === aid ? { ...m, content: fullContent } : m
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
    setCompletedNarrationSegments({})
    streamSegmentsRef.current = []
    hasPostToolTextRef.current = false
    setActiveCitations([])
    setPendingApprovals([])
    setFollowUps([])
    setPlanData(null)
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
                refreshThreads(false)
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

              case 'stage':
              case 'checkpoint':
                break

              case 'plan': {
                const plan = event.data
                if (plan && plan.title) {
                  const stages: PlanStage[] = (plan.stages || []).map((s: Record<string, unknown>, i: number) => ({
                    id: (s.id as string) || `stage-${i}`,
                    title: (s.title as string) || `Step ${i + 1}`,
                    description: (s.description as string) || undefined,
                    status: (s.status as PlanStage['status']) || 'pending',
                  }))
                  setPlanData({
                    title: plan.title,
                    description: plan.description || undefined,
                    stages,
                  })
                }
                break
              }

              case 'plan_stage_update': {
                const update = event.data
                if (update && update.stageId) {
                  setPlanData(prev => {
                    if (!prev) return prev
                    return {
                      ...prev,
                      stages: prev.stages.map(s =>
                        s.id === update.stageId
                          ? { ...s, status: update.status || s.status }
                          : s
                      ),
                    }
                  })
                }
                break
              }

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

                // Capture website builder artifacts for artifact panel
                if (
                  (event.data.name === 'generate_website' || event.data.name === 'revise_website') &&
                  event.data.success &&
                  event.data.result
                ) {
                  const r = event.data.result as Record<string, unknown>
                  const artifact = r.artifact as Record<string, unknown> | undefined
                  if (artifact?.content) {
                    const projectId = r.project_id as string | undefined
                    addArtifact({
                      id: `website-${projectId ?? Date.now()}`,
                      type: 'html',
                      title: (artifact.title as string) ?? 'Website Preview',
                      content: artifact.content as string,
                      messageId: assistantId,
                      projectId,
                    })
                  }
                }

                // Capture generated images for inline rendering
                if (
                  (event.data.name === 'generate_image' || event.data.name === 'generate_images') &&
                  event.data.success &&
                  event.data.result
                ) {
                  const r = event.data.result as Record<string, unknown>
                  const images: Array<{ url?: string; base64?: string; index?: number }> = []

                  if (r.image_url) {
                    // Single image URL from generate_image
                    images.push({ url: r.image_url as string })
                  } else if (Array.isArray(r.images)) {
                    // Multiple image URLs from generate_images
                    for (const img of r.images as Array<Record<string, unknown>>) {
                      if (img.url) images.push({ url: img.url as string, index: img.index as number })
                      else if (img.base64) images.push({ base64: img.base64 as string, index: img.index as number })
                    }
                  }

                  if (images.length > 0) {
                    setImageArtifacts(prev => [...prev, {
                      id: `img-${Date.now()}`,
                      images,
                      prompt: (r.prompt_used as string) || '',
                      model: (r.model_used as string) || '',
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

                // Dispatch event for voice mode TTS playback
                if (contentToAnalyze) {
                  window.dispatchEvent(new CustomEvent('bitbit-chat-response-done', { detail: contentToAnalyze }))
                }

                refreshThreads(false)
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
      refreshThreads(false)
    }
  }, [dragUpload, followUps.length, isLoading, refreshThreads, setThreadId, smoothStream, smartScroll, threadId])

  const handleEditMessage = useCallback((messageId: string, newContent: string) => {
    const idx = messages.findIndex(m => m.id === messageId)
    if (idx === -1) return
    // Truncate conversation at this message (remove it and everything after)
    setMessages(prev => prev.slice(0, idx))
    // Clear related artifacts for this message and everything after it
    setInvoiceArtifacts(prev => {
      const removedIds = new Set(messages.slice(idx).map(m => m.id))
      return prev.filter(inv => !removedIds.has(inv.afterMessageId))
    })
    setFollowUps([])
    // Re-send with edited content
    handleSend(newContent)
  }, [messages, handleSend])

  const handleRegenerate = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUserMsg || isLoading) return

    // Remove the last assistant message AND its parent user message
    // so handleSend doesn't create a duplicate user message.
    setMessages(prev => {
      const lastUserIdx = [...prev].reverse().findIndex(m => m.role === 'user')
      if (lastUserIdx === -1) return prev
      const actualIdx = prev.length - 1 - lastUserIdx
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
  const chatStarted = hasMessages || isLoading || isLoadingHistory

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(CHAT_LAYOUT_EVENT, { detail: { started: chatStarted } }))
  }, [chatStarted])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      window.dispatchEvent(new CustomEvent(CHAT_LAYOUT_EVENT, { detail: { started: false } }))
    }
  }, [])

  // Reasoning chain: unified thinking + tool calls display
  const currentResponseMsg = messages.find(m => m.id === currentAssistantIdRef.current) ?? null
  const currentToolCalls = currentResponseMsg?.toolCalls || []
  // Reasoning is active while: thinking is streaming OR tools are running.
  // Once tools are finished, the reasoning chain collapses into a summary
  // even if the assistant is still narrating the final response.
  const isReasoningActive = isThinkingStreaming
    || currentToolCalls.some(tc => tc.status === 'running')
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
    defaultExpanded: boolean,
    animateEntrance = false,
    opts?: { autoExpand?: boolean; autoCollapse?: boolean }
  ): React.ReactNode | null => {
    if (tools.length === 0) return null

    return (
      <ToolCallsSection
        key={key}
        toolCalls={tools.map((tool, index) => normalizeToolCallEntry(tool, index))}
        defaultExpanded={defaultExpanded}
        summary={summary}
        animateEntrance={animateEntrance}
        autoExpand={opts?.autoExpand}
        autoCollapse={opts?.autoCollapse}
        className="max-w-[min(72ch,100%)]"
      />
    )
  }

  const handleNarrationSegmentComplete = useCallback((key: string) => {
    setCompletedNarrationSegments((prev) => {
      if (prev[key]) return prev
      return { ...prev, [key]: true }
    })
  }, [])

  const renderNarrationSegment = (
    key: string,
    content: string,
    onComplete?: () => void
  ): React.ReactNode => (
    <div
      key={key}
      className="bb-chat__bubble--assistant bb-chat__markdown"
      style={{ marginBottom: 4 }}
    >
      <SmoothText content={content.trim()} onComplete={onComplete}>
        {(revealed) => (
          <Streamdown plugins={streamdownPlugins}>
            {revealed}
          </Streamdown>
        )}
      </SmoothText>
    </div>
  )

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
        // Thinking only (no tools yet) — show collapsible reasoning content
        return [
          <Reasoning key="cot-thinking" isStreaming={isThinkingStreaming} duration={thinkingDuration}>
            <ReasoningTrigger />
            {thinkingContent.length > 0 && (
              <ReasoningContent>{thinkingContent}</ReasoningContent>
            )}
          </Reasoning>
        ]
      }

      // Tools are running — show steps directly with an animated thread line
      const elements: React.ReactNode[] = []

      // Show collapsible reasoning if thinking content was captured before tools started
      if (thinkingContent.length > 0) {
        elements.push(
          <Reasoning key="cot-before-tools" isStreaming={false} duration={thinkingDuration} defaultOpen={false}>
            <ReasoningTrigger />
            <ReasoningContent>{thinkingContent}</ReasoningContent>
          </Reasoning>
        )
      }

      if (!hasInterleavedSegments) {
        const section = renderToolSection(
          currentToolCalls,
          'active-steps',
          buildToolSectionSummary(currentToolCalls.length, undefined, 'Working through tools'),
          false,
          true,
          { autoExpand: true }
        )
        if (section) elements.push(section)
        elements.push(...renderNarrationNotes(interToolNarrations, 'active'))
      } else {
        // Interleaved: show each segment's tools + intermediate text
        for (let sIdx = 0; sIdx < streamSegments.length; sIdx++) {
          const seg = streamSegments[sIdx]
          if (seg.type === 'tools') {
            const previousSegment = streamSegments[sIdx - 1]
            const requiredNarrationKey = previousSegment?.type === 'text' ? `active-text-${sIdx - 1}` : null
            if (requiredNarrationKey && !completedNarrationSegments[requiredNarrationKey]) {
              continue
            }

            const tools = currentToolCalls.slice(seg.startIdx, seg.endIdx + 1)
            const section = renderToolSection(
              tools,
              `active-seg-${sIdx}`,
              buildToolSectionSummary(tools.length, undefined, sIdx === 0 ? 'Working through tools' : 'Continuing with tools'),
              false,
              true,
              { autoExpand: true }
            )
            if (section) elements.push(section)
            elements.push(...renderNarrationNotes(seg.narrations, `active-${sIdx}`))
          } else if (seg.type === 'text') {
            const isLastSegment = sIdx === streamSegments.length - 1
            if (!isLastSegment && seg.content.trim()) {
              const segmentKey = `active-text-${sIdx}`
              elements.push(
                renderNarrationSegment(
                  segmentKey,
                  seg.content,
                  () => handleNarrationSegmentComplete(segmentKey)
                )
              )
            }
          }
        }
      }

      return elements.length > 0 ? elements : null
    }

    // ── COMPLETE MODE: reasoning finished — collapse into summary ──
    // Show collapsible thinking content if captured
    const completedReasoningElement = thinkingContent.length > 0 ? (
      <Reasoning key="cot-complete-reasoning" isStreaming={false} duration={thinkingDuration} defaultOpen={false}>
        <ReasoningTrigger />
        <ReasoningContent>{thinkingContent}</ReasoningContent>
      </Reasoning>
    ) : null

    if (!hasInterleavedSegments) {
      const section = renderToolSection(
        currentToolCalls,
        'cot-complete',
        buildToolSectionSummary(currentToolCalls.length, completedReasoningElement ? undefined : thinkingDuration),
        false
      )

      const result: React.ReactNode[] = []
      if (completedReasoningElement) result.push(completedReasoningElement)
      if (section) result.push(section, ...renderNarrationNotes(interToolNarrations, 'complete'))
      return result.length > 0 ? result : null
    }

    // Interleaved: each tool segment gets its own collapsed summary
    const elements: React.ReactNode[] = []
    if (completedReasoningElement) elements.push(completedReasoningElement)
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
              <Streamdown plugins={streamdownPlugins}>
                {seg.content.trim()}
              </Streamdown>
            </div>
          )
        }
      }
    }

    return elements.length > 0 ? elements : null
  }

  // The actual segmented JSX
  const segmentedReasoningJSX = buildSegmentedReasoningJSX()

  const resetConversationState = useCallback((nextWhispersVisible: boolean) => {
    setMessages([])
    setIsLoading(false)
    setThinkingContent('')
    setIsThinkingStreaming(false)
    setThinkingDuration(undefined)
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
    setImageArtifacts([])
    setPlanData(null)
    smoothStream.reset()
    currentAssistantIdRef.current = null
    setWhispersVisible(nextWhispersVisible)
  }, [smoothStream])

  const loadThreadHistory = useCallback(async (selectedThreadId: string) => {
    // Clear messages immediately so the skeleton shows while fetching.
    setMessages([])
    setInvoiceArtifacts([])
    setImageArtifacts([])
    setFollowUps([])
    setWhispersVisible(false)
    setIsLoadingHistory(true)
    try {
      const res = await fetch(`/api/agent/chat/history?threadId=${selectedThreadId}&limit=50`)
      if (res.ok) {
        const data = await res.json()
        const restored = restoreHistory((data.messages || []) as HistoryRow[])
        resetConversationState(restored.messages.length === 0)
        setMessages(restored.messages)
        if (restored.invoiceArtifacts.length > 0) setInvoiceArtifacts(restored.invoiceArtifacts)
        // Scroll to latest messages after React renders
        if (restored.messages.length > 0) {
          setTimeout(() => smartScroll.scrollToBottom(), 50)
        }
      } else {
        resetConversationState(true)
      }
    } catch {
      resetConversationState(true)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [resetConversationState, smartScroll])

  const restoredInitialHistoryRef = useRef(false)
  useEffect(() => {
    if (restoredInitialHistoryRef.current) return
    restoredInitialHistoryRef.current = true
    if (threadId) {
      loadThreadHistory(threadId)
    }
  }, [loadThreadHistory, threadId])

  useEffect(() => {
    if (!selectionRequest.nonce || !selectionRequest.threadId) return
    loadThreadHistory(selectionRequest.threadId)
  }, [loadThreadHistory, selectionRequest.nonce, selectionRequest.threadId])

  const handleNewConversationRef = useRef<(t: string | null) => void>(() => {})
  handleNewConversationRef.current = (threadToArchive: string | null) => {
    // Archive current thread and start fresh
    if (threadToArchive) {
      fetch('/api/agent/chat/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: threadToArchive }),
      })
        .finally(() => refreshThreads(false))
        .catch(() => {}) // fire-and-forget archive
    } else {
      refreshThreads(false)
    }
    setThreadId(null)
    resetConversationState(true)
  }

  useEffect(() => {
    if (!newConversationRequest.nonce) return
    handleNewConversationRef.current(newConversationRequest.fromThreadId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newConversationRequest.nonce])

  // Listen for slash command events
  useEffect(() => {
    const handler = (e: Event) => {
      const cmdId = (e as CustomEvent<string>).detail
      if (cmdId === 'new' || cmdId === 'clear') requestNewConversation()
      if (cmdId === 'history' || cmdId === 'search') requestThreadPanelFocus()
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
  }, [requestNewConversation, requestThreadPanelFocus])

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
      className={`bb-chat bg-background ${chatStarted ? 'bb-chat--active' : 'bb-chat--pre-session'} ${activeArtifact ? 'bb-chat--artifact-open' : ''}`}
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
      {/* Export menu — vertically centered in topbar, offset left to avoid notification bell */}
      {hasMessages && (
        <div style={{ position: 'absolute', top: 0, right: 52, height: 'var(--topbar-height)', display: 'flex', alignItems: 'center', zIndex: 10 }}>
          <ExportMenu messages={messages} />
        </div>
      )}
      {/* Messages or empty state */}
      <div
        className={`bb-chat__messages ${!hasMessages ? 'bb-chat__messages--empty' : ''}`}
        ref={scrollRef}
      >
        <AnimatePresence mode="wait">
          {isLoadingHistory && !hasMessages ? (
            <motion.div
              key="loading-history"
              className="bb-chat__msg-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0 } }}
              transition={{ duration: 0.12 }}
            >
              {/* Skeleton: alternating user/assistant message shapes */}
              {[
                { role: 'user', w: '45%' },
                { role: 'assistant', w: '72%', h: 56 },
                { role: 'user', w: '38%' },
                { role: 'assistant', w: '65%', h: 72 },
                { role: 'user', w: '52%' },
                { role: 'assistant', w: '60%', h: 48 },
              ].map((s, i) => (
                <div
                  key={i}
                  className={`flex ${s.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="animate-pulse rounded-2xl"
                    style={{
                      width: s.w,
                      height: s.h ?? 36,
                      background: s.role === 'user'
                        ? 'var(--secondary)'
                        : 'var(--muted)',
                      opacity: 0.5,
                      borderRadius: s.role === 'user'
                        ? '20px 20px 4px 20px'
                        : '20px 20px 20px 4px',
                    }}
                  />
                </div>
              ))}
            </motion.div>
          ) : !hasMessages && !isLoadingHistory ? (
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
                  {greeting}
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
                const isLastAssistantOverall = msg.role === 'assistant' && !messages.slice(i + 1).some(m => m.role === 'assistant')
                const isCurrentResponse = msg.id === currentAssistantIdRef.current
                return (
                  <div
                    key={msg.id}
                    className={isGroupChange ? 'bb-chat__msg-group-gap' : ''}
                  >
                    {/* BitBit header — above all assistant message blocks */}
                    {msg.role === 'assistant' && <BitBitHeader />}
                    {/* Execution plan — shown above reasoning chain */}
                    {isCurrentResponse && planData && (
                      <motion.div
                        key="plan"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                        style={{ marginBottom: 8, maxWidth: 480 }}
                      >
                        <Plan isStreaming={isLoading} defaultOpen>
                          <PlanHeader>
                            <div>
                              <PlanTitle>{planData.title}</PlanTitle>
                              {planData.description && (
                                <PlanDescription>{planData.description}</PlanDescription>
                              )}
                            </div>
                            <PlanAction>
                              <PlanTrigger />
                            </PlanAction>
                          </PlanHeader>
                          <PlanContent>
                            <div className="flex flex-col gap-2">
                              {planData.stages.map(stage => {
                                const statusIcon =
                                  stage.status === 'complete' ? '✓' :
                                  stage.status === 'in_progress' ? '●' :
                                  stage.status === 'error' ? '✗' : '○'
                                const statusColor =
                                  stage.status === 'complete' ? 'text-green-500' :
                                  stage.status === 'in_progress' ? 'text-blue-500' :
                                  stage.status === 'error' ? 'text-red-500' : 'text-muted-foreground'
                                return (
                                  <div key={stage.id} className="flex items-start gap-2 text-sm">
                                    <span className={`shrink-0 tabular-nums ${statusColor}`}>{statusIcon}</span>
                                    <div>
                                      <div className="font-medium">{stage.title}</div>
                                      {stage.description && (
                                        <div className="text-muted-foreground text-sm">{stage.description}</div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </PlanContent>
                        </Plan>
                      </motion.div>
                    )}
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
                      isStreaming={isCurrentResponse && isLoading}
                      citations={msg.citations || (isLastAssistantOverall && isLoading ? activeCitations : undefined)}
                      onRegenerate={isLastAssistantOverall && !isLoading ? handleRegenerate : undefined}
                      onEdit={msg.role === 'user' ? handleEditMessage : undefined}
                      onOpenArtifact={handleOpenArtifact}
                    />
                    {isCurrentResponse && msg.citations && msg.citations.length > 0 && !isLoading && (
                      <SourcesFooter sources={msg.citations} />
                    )}
                    {!isCurrentResponse && msg.citations && msg.citations.length > 0 && (
                      <SourcesFooter sources={msg.citations} />
                    )}
                    {/* Checkpoints are internal system state — hidden from users */}
                    {/* Invoice artifacts — anchored to the message that generated them */}
                    {invoiceArtifacts.filter(inv => inv.afterMessageId === msg.id).map(inv => (
                      <motion.div key={inv.invoiceNumber} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} style={{ marginTop: 8 }}>
                        <InvoiceArtifact invoiceNumber={inv.invoiceNumber} recipient={inv.recipient} recipientEmail={inv.recipientEmail} total={inv.total} dueDate={inv.dueDate} description={inv.description} html={inv.html} subject={inv.subject} />
                      </motion.div>
                    ))}
                    {/* Generated images — inline gallery */}
                    {imageArtifacts.filter(img => img.afterMessageId === msg.id).map(imgSet => (
                      <motion.div
                        key={imgSet.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        className="mt-3"
                      >
                        <div className={cn(
                          'grid gap-2',
                          imgSet.images.length === 1 && 'grid-cols-1 max-w-md',
                          imgSet.images.length === 2 && 'grid-cols-2 max-w-lg',
                          imgSet.images.length >= 3 && 'grid-cols-2 max-w-lg',
                        )}>
                          {imgSet.images.map((img, i) => (
                            <div
                              key={i}
                              className="group relative overflow-hidden rounded-xl border border-border bg-card cursor-pointer"
                              onClick={() => {
                                const src = img.url || (img.base64 ? `data:image/png;base64,${img.base64}` : '')
                                if (src) window.open(src, '_blank')
                              }}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={img.url || (img.base64 ? `data:image/png;base64,${img.base64}` : '')}
                                alt={imgSet.prompt || 'Generated image'}
                                className="w-full h-auto rounded-xl transition-transform duration-200 group-hover:scale-[1.02]"
                              />
                              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <p className="text-white text-xs truncate">{imgSet.prompt}</p>
                                <p className="text-white/60 text-xs">{imgSet.model}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                        {imgSet.images.length > 1 && (
                          <p className="text-muted-foreground text-xs mt-1.5">Click to view full size</p>
                        )}
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
                    <BitBitHeader />
                    {segmentedReasoningJSX}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Inline approval cards */}
              {pendingApprovals.map(approval => {
                const confirmationApproval = approval.status === 'approved'
                  ? { id: approval.id, approved: true as const }
                  : approval.status === 'rejected'
                    ? { id: approval.id, approved: false as const }
                    : { id: approval.id }
                const confirmationState = approval.resolving
                  ? 'approval-requested' as const
                  : approval.status === 'approved'
                    ? 'approval-responded' as const
                    : approval.status === 'rejected'
                      ? 'output-denied' as const
                      : 'approval-requested' as const
                return (
                  <motion.div
                    key={approval.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                    style={{ marginTop: 8, maxWidth: 480 }}
                  >
                    <Confirmation approval={confirmationApproval} state={confirmationState}>
                      <ConfirmationTitle>{approval.actionSummary}</ConfirmationTitle>
                      <ConfirmationRequest>
                        <ConfirmationActions>
                          <ConfirmationAction
                            variant="outline"
                            onClick={() => handleApprovalDecision(approval.id, 'rejected')}
                            disabled={approval.resolving}
                          >
                            Reject
                          </ConfirmationAction>
                          <ConfirmationAction
                            onClick={() => handleApprovalDecision(approval.id, 'approved')}
                            disabled={approval.resolving}
                          >
                            {approval.resolving ? 'Resolving...' : 'Approve'}
                          </ConfirmationAction>
                        </ConfirmationActions>
                      </ConfirmationRequest>
                      <ConfirmationAccepted>
                        <ConfirmationTitle>Approved — sending...</ConfirmationTitle>
                      </ConfirmationAccepted>
                      <ConfirmationRejected>
                        <ConfirmationTitle>Rejected.</ConfirmationTitle>
                      </ConfirmationRejected>
                    </Confirmation>
                  </motion.div>
                )
              })}

              {/* Follow-up suggestions */}
              {!isLoading && !smoothStream.isBuffering && followUps.length > 0 && messages.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: 0.3 }}
                  className="mt-2 max-w-[600px]"
                >
                  <Suggestions>
                    {followUps.map((text, i) => (
                      <Suggestion
                        key={i}
                        suggestion={text}
                        onClick={(s) => handleSend(s)}
                        className="text-muted-foreground hover:text-foreground hover:border-primary/30 whitespace-nowrap"
                      />
                    ))}
                  </Suggestions>
                </motion.div>
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
            fontSize: '14px',
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