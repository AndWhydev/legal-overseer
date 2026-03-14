'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MessageBubble } from './message-bubble'
import { SFChevronDown, SFArchivebox, SFMagnifyingglass, SFPlusCircle, SFPencil, SFEye, SFDocument, SFEnvelope, SFBrain, SFBolt, SFExclamationmarkCircle } from 'sf-symbols-lib'
import { BitBitFaceAvatar } from './bitbit-face-avatar'
import { useAvatarEmotion } from './use-avatar-emotion'
import { useSmoothStream } from './use-smooth-stream'
import { useSmartScroll } from './use-smart-scroll'
import { ConversationDrawer, type Thread } from './conversation-drawer'
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

const SUGGESTIONS = [
  'Create a task',
  'Summarize my day',
  "What's on my schedule?",
]

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  create_task: 'Creating task',
  update_task: 'Updating task',
  search_tasks: 'Searching tasks',
  search_contacts: 'Searching contacts',
  get_contact: 'Looking up contact',
  find_messages: 'Looking up messages',
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
}

/** snake_case → Title Case fallback for unknown tools */
function formatToolName(name: string): string {
  if (TOOL_DISPLAY_NAMES[name]) return TOOL_DISPLAY_NAMES[name]
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/** Tool-specific icon based on name pattern */
function getToolIcon(name: string): React.ElementType {
  if (name.startsWith('search')) return SFMagnifyingglass
  if (name.startsWith('create')) return SFPlusCircle
  if (name.startsWith('update')) return SFPencil
  if (name.startsWith('get') || name.startsWith('look')) return SFEye
  if (name.startsWith('log')) return SFDocument
  if (name.startsWith('compose') || name.startsWith('send')) return SFEnvelope
  if (name.includes('memory')) return SFBrain
  return SFBolt
}

const CHAT_SEND_EVENT = 'bitbit-chat-send'
const CHAT_LAYOUT_EVENT = 'bitbit-chat-layout'
const THREAD_STORAGE_KEY = 'bitbit-thread-id'

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
  const [activeCitations, setActiveCitations] = useState<Citation[]>([])
  const [checkpoints, setCheckpoints] = useState<CheckpointMarker[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  // Conversation history drawer state
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [conversationThreads, setConversationThreads] = useState<Thread[]>([])
  const [threadsLoading, setThreadsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const currentAssistantIdRef = useRef<string | null>(null)
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
  const isContentStreaming = isLoading && !isThinkingStreaming && messages.some(m => m.role === 'assistant' && m.content.length > 0)
  const hasResponseError = lastMsgForEmotion?.role === 'assistant' && lastMsgForEmotion.content.startsWith('Something went wrong:')
  const avatarEmotion = useAvatarEmotion({
    isThinking: isThinkingStreaming,
    isToolRunning,
    isStreaming: isContentStreaming,
    hasError: hasResponseError,
  })

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

  // Load thread history on mount
  useEffect(() => {
    const savedThreadId = localStorage.getItem(THREAD_STORAGE_KEY)
    if (!savedThreadId) return

    setThreadId(savedThreadId)

    fetch(`/api/agent/chat/history?threadId=${savedThreadId}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data?.messages?.length) return
        const restored: Message[] = data.messages
          .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
          .map((m: { id: string; role: string; content: string; created_at: string }) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: new Date(m.created_at),
          }))
        if (restored.length > 0) {
          setMessages(restored)
        }
      })
      .catch(() => {
        localStorage.removeItem(THREAD_STORAGE_KEY)
        setThreadId(null)
      })
  }, [])

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
    setActiveCitations([])
    setPendingApprovals([])
    smoothStream.reset()
    smartScroll.scrollToBottom()

    const assistantId = `msg-${Date.now() + 1}`
    currentAssistantIdRef.current = assistantId
    let assistantContent = ''
    const toolCalls: ToolCall[] = []
    const responseCitations: Citation[] = []

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, threadId }),
      })

      if (!res.ok || !res.body) throw new Error('Failed to connect')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6)
          if (!raw) continue

          try {
            const event = JSON.parse(raw)

            switch (event.type) {
              case 'thread': {
                const tid = event.data.threadId
                setThreadId(tid)
                localStorage.setItem(THREAD_STORAGE_KEY, tid)
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
                // Lock narration — any content after this is the real response
                narrationLockedRef.current = true
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

                // Pre-tool narration: content before any tool_call is narration text.
                // Once narration is locked (first tool_call arrived), all content
                // goes to smoothStream for the final answer display.
                if (!narrationLockedRef.current && toolCalls.length === 0) {
                  narrationContentRef.current += event.data
                  setNarration(narrationContentRef.current)
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

              case 'done':
                setIsThinkingStreaming(false)
                // Ensure full content is set (in case smooth stream is still buffering)
                if (assistantContent) {
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantId
                        ? {
                            ...m,
                            content: assistantContent,
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
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err) {
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

  const onSuggestionClick = useCallback((text: string) => {
    handleSend(text)
  }, [handleSend])

  // Conversation drawer functions
  const fetchThreads = useCallback(async () => {
    setThreadsLoading(true)
    try {
      const res = await fetch('/api/conversations/list')
      if (res.ok) {
        const data = await res.json()
        setConversationThreads(data.threads || [])
      }
    } catch {
      // Silently fail -- drawer shows empty state
    } finally {
      setThreadsLoading(false)
    }
  }, [])

  const handleNewConversation = useCallback(() => {
    setMessages([])
    setThreadId(null)
    localStorage.removeItem(THREAD_STORAGE_KEY)
    setThinkingContent('')
    setIsThinkingStreaming(false)
    setThinkingDuration(undefined)
    setShowReasoning(false)
    setActiveCitations([])
    setCheckpoints([])
    setPendingApprovals([])
    smoothStream.reset()
    setDrawerOpen(false)
  }, [smoothStream])

  const handleSelectThread = useCallback(async (selectedThreadId: string) => {
    setThreadId(selectedThreadId)
    localStorage.setItem(THREAD_STORAGE_KEY, selectedThreadId)

    // Reset state
    setThinkingContent('')
    setIsThinkingStreaming(false)
    setThinkingDuration(undefined)
    setShowReasoning(false)
    setActiveCitations([])
    setCheckpoints([])
    setPendingApprovals([])
    smoothStream.reset()

    try {
      const res = await fetch(`/api/agent/chat/history?threadId=${selectedThreadId}`)
      if (!res.ok) return

      const data = await res.json()
      if (!data?.messages?.length) {
        setMessages([])
        return
      }

      const restored: Message[] = data.messages
        .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
        .map((m: { id: string; role: string; content: string; created_at: string }) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          timestamp: new Date(m.created_at),
        }))
      setMessages(restored)
    } catch {
      // Failed to load thread -- keep empty
      setMessages([])
    }
  }, [smoothStream])

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
  const isReasoningActive = isThinkingStreaming || currentToolCalls.some(tc => tc.status === 'running')
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

  // Auto-close when reasoning activity finishes (content starts streaming)
  useEffect(() => {
    const wasActive = prevReasoningActiveRef.current
    prevReasoningActiveRef.current = isReasoningActive
    if (!isReasoningActive && wasActive) {
      const timer = setTimeout(() => setReasoningOpen(false), 1000)
      return () => clearTimeout(timer)
    }
  }, [isReasoningActive])

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

  const reasoningChainJSX = showReasoningChain ? (
    <ChainOfThought open={reasoningOpen} onOpenChange={setReasoningOpen}>
      <ChainOfThoughtHeader>{headerText}</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {/* Narration step — "I'll search for..." captured before tool calls */}
        {narration && (
          <ChainOfThoughtStep
            label={(() => {
              const trimmed = narration.trim()
              // Show first sentence only for a clean timeline step
              const firstSentence = trimmed.match(/^[^.!?\n]+[.!?]?/)?.[0] || trimmed
              return firstSentence.length > 120 ? firstSentence.slice(0, 117) + '...' : firstSentence
            })()}
            status={isReasoningActive ? 'active' : 'complete'}
          />
        )}

        {/* Tool call steps */}
        {currentToolCalls.map((tc, idx) => {
          const ToolIcon = getToolIcon(tc.name)
          return (
            <ChainOfThoughtStep
              key={idx}
              icon={ToolIcon}
              label={formatToolName(tc.name)}
              status={tc.status === 'running' ? 'active' : tc.status === 'error' ? 'complete' : 'complete'}
            />
          )
        })}

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
      {/* SFArchivebox / history toggle — bottom-left, always visible */}
      <button
        className="bb-chat__history-btn"
        onClick={() => {
          setDrawerOpen(true)
          fetchThreads()
        }}
        aria-label="Conversation history"
      >
        <SFArchivebox size={16} />
      </button>

      {/* Conversation history drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <ConversationDrawer
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            threads={conversationThreads}
            activeThreadId={threadId}
            onSelectThread={handleSelectThread}
            onNewConversation={handleNewConversation}
            isLoading={threadsLoading}
          />
        )}
      </AnimatePresence>

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
                <div className="bb-chat__suggestions">
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      className="bb-chat__chip"
                      onClick={() => onSuggestionClick(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="messages"
              className="bb-chat__msg-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {messages.map((msg, i) => {
                const prev = messages[i - 1]
                const isGroupChange = prev && prev.role !== msg.role
                const isLastAssistant = msg.role === 'assistant' && (i === messages.length - 1 || messages[i + 1]?.role === 'user')
                const isCurrentResponse = msg.id === currentAssistantIdRef.current
                const checkpoint = checkpoints.find(cp => cp.afterMessageId === msg.id)

                return (
                  <div
                    key={msg.id}
                    className={isGroupChange ? 'bb-chat__msg-group-gap' : ''}
                  >
                    {/* Reasoning chain above the current response */}
                    {isCurrentResponse && reasoningChainJSX && (
                      <div className="bb-chat__msg bb-chat__msg--assistant" style={{ marginBottom: 4 }}>
                        <div className="bb-chat__assistant-icon">
                          <BitBitFaceAvatar size={40} emotion={avatarEmotion} isThinking={isThinkingStreaming} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {reasoningChainJSX}
                        </div>
                      </div>
                    )}
                    <MessageBubble
                      message={msg}
                      showAvatar={isLastAssistant && !isReasoningActive}
                      citations={msg.citations || (isLastAssistant && isLoading ? activeCitations : undefined)}
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
                  <div className="bb-chat__assistant-icon">
                    <BitBitFaceAvatar size={40} emotion={avatarEmotion} isThinking={isThinkingStreaming} />
                  </div>
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
                    layoutId="bitbit-active-avatar"
                    transition={{ type: 'spring', stiffness: 200, damping: 25, mass: 0.8 }}
                  >
                    <BitBitFaceAvatar size={40} emotion={avatarEmotion} isThinking={isThinkingStreaming} />
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
            <SFChevronDown size={18} />
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
