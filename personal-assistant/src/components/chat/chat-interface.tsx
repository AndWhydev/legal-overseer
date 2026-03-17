'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MessageBubble } from './message-bubble'
import { ChevronDown, Search, PlusCircle, Pencil, Eye, FileText, Mail, Brain, Zap, AlertCircle, Globe, BookOpen, Calendar, Receipt, Users, MessageSquare } from 'lucide-react'
import { BitBitFaceAvatar } from './bitbit-face-avatar'
import { useAvatarEmotion } from './use-avatar-emotion'
import { useSmoothStream } from './use-smooth-stream'
import { useSmartScroll } from './use-smart-scroll'
import { Whispers } from './whispers'
import type { Whisper } from '@/lib/whispers/types'
import { Shimmer } from '@/components/ai-elements/shimmer'
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought'
import { Checkpoint, CheckpointIcon } from '@/components/ai-elements/checkpoint'
import {
  Confirmation,
  ConfirmationTitle,
  ConfirmationActions,
  ConfirmationAction,
  ConfirmationRequest,
} from '@/components/ai-elements/confirmation'

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
  status: 'pending' | 'approved' | 'rejected'
}

interface CheckpointMarker {
  messageIndex: number
  label: string
  afterMessageId: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
  citations?: Citation[]
  timestamp: Date
}

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

/** Tool-specific icon based on name */
function getToolIcon(name: string): React.ElementType {
  // Exact matches first
  const ICON_MAP: Record<string, React.ElementType> = {
    browse_website: Globe,
    search_memory: Brain,
    add_memory: Brain,
    find_messages: Search,
    read_message: Mail,
    send_email: Mail,
    compose_creator_notification_mockup: Mail,
    search_contacts: Users,
    get_contact: Users,
    search_leads: Users,
    update_lead: Users,
    search_tasks: FileText,
    create_task: PlusCircle,
    update_task: Pencil,
    get_calendar: Calendar,
    create_invoice: Receipt,
    log_activity: BookOpen,
    draft_reply: Pencil,
  }
  if (ICON_MAP[name]) return ICON_MAP[name]
  // Pattern fallbacks
  if (name.startsWith('search') || name.startsWith('find')) return Search
  if (name.startsWith('browse') || name.includes('website') || name.includes('url')) return Globe
  if (name.startsWith('create')) return PlusCircle
  if (name.startsWith('update')) return Pencil
  if (name.startsWith('get') || name.startsWith('look')) return Eye
  if (name.startsWith('log')) return BookOpen
  if (name.startsWith('compose') || name.startsWith('send')) return Mail
  if (name.includes('memory')) return Brain
  if (name.includes('message') || name.includes('email')) return MessageSquare
  return Zap
}

const CHAT_SEND_EVENT = 'bitbit-chat-send'
const CHAT_LAYOUT_EVENT = 'bitbit-chat-layout'
// Thread ID kept in memory only — no localStorage persistence (single-stream design)

export function ChatInterface({ userName }: { userName?: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [threadId, setThreadId] = useState<string | null>(null)
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
  const [activeCitations, setActiveCitations] = useState<Citation[]>([])
  const [checkpoints, setCheckpoints] = useState<CheckpointMarker[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  // Whispers visible state (hides when typing or conversation starts)
  const [whispersVisible, setWhispersVisible] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const currentAssistantIdRef = useRef<string | null>(null)
  const requestGenRef = useRef(0) // Increments each handleSend to invalidate stale SSE processing
  const abortRef = useRef<AbortController | null>(null)
  // Reasoning chain state (controlled collapsible)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const prevReasoningActiveRef = useRef(false)
  const autoOpenedRef = useRef(false)

  // Smooth streaming and smart scroll hooks
  const smoothStream = useSmoothStream()
  const smartScroll = useSmartScroll(scrollRef)

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

  // Update messages from smooth stream and auto-scroll
  useEffect(() => {
    if (!smoothStream.displayedContent || !currentAssistantIdRef.current) return
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

  const handleSend = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: trimmed,
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
    setActiveCitations([])
    setPendingApprovals([])
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

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, threadId }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) throw new Error('Failed to connect')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        // Stop processing if this request has been superseded
        if (controller.signal.aborted) break

        const { done, value } = await reader.read()
        if (done) break

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

              case 'tool_call': {
                // Tools are running — stop thinking state so avatar switches to tool-specific activity
                setIsThinkingStreaming(false)
                // Lock narration — any content after this goes to chain of thought
                narrationLockedRef.current = true
                // Flush inter-tool buffer as a narration step in the chain
                if (interToolBufferRef.current.trim()) {
                  const text = interToolBufferRef.current.trim()
                  setInterToolNarrations(prev => [...prev, text])
                  interToolBufferRef.current = ''
                }
                const tc: ToolCall = {
                  name: event.data.name,
                  input: event.data.input,
                  status: 'running',
                }
                toolCalls.push(tc)

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

                if (event.data.queued && event.data.approvalId) {
                  setPendingApprovals(prev => [...prev, {
                    id: event.data.approvalId,
                    toolName: event.data.name,
                    input: toolCalls.find(tc => tc.name === event.data.name)?.input,
                    status: 'pending',
                  }])
                }

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
                  // Pre-tool narration: content before any tool_call
                  narrationContentRef.current += event.data
                  setNarration(narrationContentRef.current)
                } else if (toolCalls.length > 0 && toolCalls.some(tc => tc.status === 'running')) {
                  // Content arriving while a tool is still running — inter-tool narration
                  interToolBufferRef.current += event.data
                } else if (toolCalls.length > 0 && toolCalls.every(tc => tc.status !== 'running')) {
                  // All tools done — this is real response content OR inter-tool narration
                  // Buffer it; it'll be flushed to narration if another tool_call comes,
                  // or flushed to smoothStream on 'done'
                  interToolBufferRef.current += event.data
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
                      toolCalls: toolCalls.length > 0 ? [...toolCalls] : undefined,
                      timestamp: new Date(),
                    },
                  ]
                })
                break

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
                // The inter-tool buffer holds the ONLY content that should be
                // the response — everything else was pre-tool or inter-tool narration.
                const responseContent = interToolBufferRef.current.trim()
                if (responseContent) {
                  smoothStream.feedContent(responseContent)
                  interToolBufferRef.current = ''
                }
                // Use the buffered response content as the final message,
                // falling back to assistantContent only if no tools were used
                // (simple Q&A with no tool calls).
                const finalContent = toolCalls.length > 0
                  ? responseContent
                  : assistantContent
                // Ensure full content is set (in case smooth stream is still buffering)
                if (finalContent) {
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantId
                        ? {
                            ...m,
                            content: finalContent,
                            ...(responseCitations.length > 0 ? { citations: [...responseCitations] } : {}),
                          }
                        : m
                    )
                  )
                } else if (responseCitations.length > 0) {
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantId
                        ? { ...m, citations: [...responseCitations] }
                        : m
                    )
                  )
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
      if (requestGenRef.current !== gen) return
      setIsLoading(false)
      setIsThinkingStreaming(false)
    }
  }, [isLoading, threadId, smoothStream, smartScroll])

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
    <Shimmer duration={1}>Thinking...</Shimmer>
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

  const reasoningChainJSX = showReasoningChain ? (
    <ChainOfThought open={reasoningOpen} onOpenChange={setReasoningOpen}>
      <ChainOfThoughtHeader>{headerText}</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {/* Pre-tool narration step — subtle appearance */}
        {narration && (
          <ChainOfThoughtStep
            label={formatNarration(narration)}
            status={isReasoningActive ? 'active' : 'complete'}
            style={{ opacity: 0.7, fontSize: 12 }}
          />
        )}

        {/* Tool call steps — collapsed, with inline detail pills and inter-tool narration */}
        {(() => {
          // Group consecutive same-name tool calls into collapsed steps
          const groups: { name: string; calls: typeof currentToolCalls; }[] = []
          for (const tc of currentToolCalls) {
            const last = groups[groups.length - 1]
            if (last && last.name === tc.name) {
              last.calls.push(tc)
            } else {
              groups.push({ name: tc.name, calls: [tc] })
            }
          }

          // Interleave inter-tool narrations between groups
          // Each narration was captured when a new tool_call flushed the buffer,
          // so narration[i] appeared before group[i+1]
          const elements: React.ReactNode[] = []
          groups.forEach((group, gIdx) => {
            const ToolIcon = getToolIcon(group.name)
            const count = group.calls.length
            const anyRunning = group.calls.some(tc => tc.status === 'running')
            const status = anyRunning ? 'active' as const : 'complete' as const

            // Attach inter-tool narration to this step as inline child
            const narrationAfter = gIdx < interToolNarrations.length
              ? formatNarration(interToolNarrations[gIdx])
              : null

            if (count === 1) {
              // Single call — show with inline detail pill
              const detail = extractToolDetail(group.name, group.calls[0].input, group.calls[0].result)
              elements.push(
                <ChainOfThoughtStep
                  key={`tool-${gIdx}`}
                  icon={ToolIcon}
                  label={formatToolName(group.name)}
                  detail={detail ?? undefined}
                  status={group.calls[0].status === 'running' ? 'active' : 'complete'}
                >
                  {narrationAfter && (
                    <span style={{
                      display: 'block',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      fontStyle: 'italic',
                      fontWeight: 400,
                      lineHeight: '18px',
                    }}>
                      {narrationAfter}
                    </span>
                  )}
                </ChainOfThoughtStep>
              )
            } else {
              // Multiple calls — expandable collapsed step with individual items
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
                  key={`tool-${gIdx}`}
                  icon={ToolIcon}
                  label={label}
                  status={status}
                  expandable
                >
                  {group.calls.map((tc, cIdx) => {
                    const detail = extractToolDetail(group.name, tc.input, tc.result)
                    return (
                      <div
                        key={`sub-${gIdx}-${cIdx}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          paddingBottom: 4,
                          fontSize: 12,
                          color: 'var(--text-dim)',
                        }}
                      >
                        <div style={{
                          width: 4,
                          height: 4,
                          borderRadius: '50%',
                          backgroundColor: tc.status === 'running'
                            ? 'var(--text-secondary)'
                            : 'var(--text-muted)',
                          flexShrink: 0,
                        }} />
                        <span>{detail || formatToolName(group.name)}</span>
                        {!detail && (
                          <span style={{
                            display: 'inline-flex',
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: 'var(--hover-bg)',
                            fontSize: 11,
                            color: 'var(--text-muted)',
                          }}>
                            {`#${cIdx + 1}`}
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {narrationAfter && (
                    <span style={{
                      display: 'block',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      fontStyle: 'italic',
                      fontWeight: 400,
                      lineHeight: '18px',
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
        })()}

        {/* Thinking step — if we have thinking content and no narration/tools yet */}
        {isThinkingStreaming && !narration && currentToolCalls.length === 0 && (
          <ChainOfThoughtStep
            label="Thinking..."
            status="active"
          />
        )}
      </ChainOfThoughtContent>
    </ChainOfThought>
  ) : null

  return (
    <div className={`bb-chat ${chatStarted ? 'bb-chat--active' : 'bb-chat--pre-session'}`}>
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
                <BitBitFaceAvatar size={120} emotion={avatarEmotion} isThinking={isThinkingStreaming} />
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
                    {/* Reasoning chain above the current response */}
                    {/* Live reasoning chain for current response */}
                    {isCurrentResponse && reasoningChainJSX && (
                      <div className="bb-chat__msg bb-chat__msg--assistant" style={{ marginBottom: 4 }}>
                        <motion.div className="bb-chat__assistant-icon" layoutId="bitbit-chat-avatar" transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}>
                          <BitBitFaceAvatar size={32} emotion={avatarEmotion} isThinking={isThinkingStreaming} activity={avatarActivity} />
                        </motion.div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {reasoningChainJSX}
                        </div>
                      </div>
                    )}
                    {/* Past response — collapsed reasoning chain */}
                    {!isCurrentResponse && msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div style={{ marginBottom: 4, paddingLeft: 42 }}>
                        <ChainOfThought defaultOpen={false}>
                          <ChainOfThoughtHeader>
                            {`${msg.toolCalls.length} tool${msg.toolCalls.length !== 1 ? 's' : ''} used`}
                          </ChainOfThoughtHeader>
                          <ChainOfThoughtContent>
                            {msg.toolCalls.map((tc, tcIdx) => {
                              const ToolIcon = getToolIcon(tc.name)
                              const detail = extractToolDetail(tc.name, tc.input, tc.result)
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
                    <MessageBubble
                      message={msg}
                      showAvatar={isLastAssistantOverall && !(isCurrentResponse && reasoningChainJSX)}
                      avatarEmotion={isCurrentResponse ? avatarEmotion : 'neutral'}
                      avatarThinking={isCurrentResponse ? isThinkingStreaming : false}
                      avatarActivity={isCurrentResponse ? avatarActivity : 'idle'}
                      citations={msg.citations || (isLastAssistantOverall && isLoading ? activeCitations : undefined)}
                    />
                    {checkpoint && (
                      <div style={{ margin: '16px 0', opacity: 0.6 }}>
                        <Checkpoint>
                          <CheckpointIcon />
                          <span style={{
                            fontSize: 12,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                            padding: '0 8px',
                          }}>
                            {checkpoint.label}
                          </span>
                        </Checkpoint>
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Standalone reasoning chain (before assistant message exists) */}
              {showReasoningChain && !currentResponseMsg && (
                <div className="bb-chat__msg bb-chat__msg--assistant">
                  <motion.div className="bb-chat__assistant-icon" layoutId="bitbit-chat-avatar" transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}>
                    <BitBitFaceAvatar size={32} emotion={avatarEmotion} isThinking={isThinkingStreaming} activity={avatarActivity} />
                  </motion.div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {reasoningChainJSX}
                  </div>
                </div>
              )}

              {/* Pending approval confirmations */}
              {pendingApprovals.filter(a => a.status === 'pending').map(approval => (
                <div key={approval.id} className="bb-chat__msg bb-chat__msg--assistant" style={{ marginTop: 8 }}>
                  <motion.div
                    className="bb-chat__assistant-icon"
                    layoutId="bitbit-chat-avatar"
                    transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
                  >
                    <BitBitFaceAvatar size={32} emotion={avatarEmotion} isThinking={isThinkingStreaming} activity={avatarActivity} />
                  </motion.div>
                  <div style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'var(--glass-bg, rgba(255,255,255,0.04))',
                    borderRadius: 12,
                    border: '1px solid var(--accent-amber, rgba(255,180,60,0.3))',
                    padding: '12px 16px',
                    backdropFilter: 'blur(12px)',
                  }}>
                    <Confirmation state="approval-requested" approval={{ id: approval.id }}>
                      <ConfirmationTitle>
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                          Approve action: {approval.toolName}
                        </span>
                      </ConfirmationTitle>
                      <ConfirmationRequest>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0' }}>
                          {typeof approval.input === 'object'
                            ? JSON.stringify(approval.input, null, 2).slice(0, 200)
                            : String(approval.input)}
                        </div>
                      </ConfirmationRequest>
                      <ConfirmationActions>
                        <ConfirmationAction
                          variant="outline"
                          onClick={() => {
                            setPendingApprovals(prev =>
                              prev.map(a => a.id === approval.id ? { ...a, status: 'rejected' } : a)
                            )
                          }}
                        >
                          Reject
                        </ConfirmationAction>
                        <ConfirmationAction
                          onClick={() => {
                            setPendingApprovals(prev =>
                              prev.map(a => a.id === approval.id ? { ...a, status: 'approved' } : a)
                            )
                          }}
                        >
                          Approve
                        </ConfirmationAction>
                      </ConfirmationActions>
                    </Confirmation>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Scroll-to-bottom button */}
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
            <ChevronDown size={18} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Docked pill input */}
      <div
        className={`bb-chat__input-area ${chatStarted ? 'bb-chat__input-area--bottom' : 'bb-chat__input-area--centered'}`}
      >
        <div id="pill-dock" />
      </div>
    </div>
  )
}
