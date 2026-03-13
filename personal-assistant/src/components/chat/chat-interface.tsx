'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { MessageBubble } from './message-bubble'
import { ToolCallSummary } from './tool-call-card'
import { BitBitLogoVideo } from './bitbit-logo-video'
import { BitBitLogoAnimated } from './bitbit-logo-animated'
import { ThoughtPipeline, type ChatPipelineStage } from './thought-pipeline'
import { Reasoning, ReasoningTrigger, ReasoningContent } from '@/components/ai-elements/reasoning'
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

const CHAT_SEND_EVENT = 'bitbit-chat-send'
const CHAT_LAYOUT_EVENT = 'bitbit-chat-layout'

/** Skeleton stage shown instantly on send */
const SKELETON_STAGE: ChatPipelineStage = {
  id: 'thinking',
  label: 'Understanding',
  sublabel: 'PROCESSING',
  icon: '🧠',
  status: 'active',
}

const THREAD_STORAGE_KEY = 'bitbit-thread-id'

export function ChatInterface({ userName }: { userName?: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [thinkingText, setThinkingText] = useState<string | null>(null)
  const [planStages, setPlanStages] = useState<ChatPipelineStage[]>([])
  const [pipelineVisible, setPipelineVisible] = useState(false)
  const [pipelinePhase, setPipelinePhase] = useState<'skeleton' | 'plan' | 'done'>('skeleton')
  const [threadId, setThreadId] = useState<string | null>(null)
  // AI Elements state
  const [thinkingContent, setThinkingContent] = useState('')
  const [isThinkingStreaming, setIsThinkingStreaming] = useState(false)
  const [thinkingDuration, setThinkingDuration] = useState<number | undefined>()
  const [activeCitations, setActiveCitations] = useState<Citation[]>([])
  const [checkpoints, setCheckpoints] = useState<CheckpointMarker[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const rafPending = useRef(false)
  const pipelineFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, thinkingText, planStages, scrollToBottom])

  // Cleanup fade timer
  useEffect(() => {
    return () => {
      if (pipelineFadeTimer.current) clearTimeout(pipelineFadeTimer.current)
    }
  }, [])

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
        // History load failed — start fresh
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
    setThinkingText(null)
    // Reset AI element state for new response
    setThinkingContent('')
    setIsThinkingStreaming(false)
    setThinkingDuration(undefined)
    setActiveCitations([])
    setPendingApprovals([])

    // WS1: Instant skeleton pipeline — zero dead time
    setPlanStages([{ ...SKELETON_STAGE }])
    setPipelineVisible(true)
    setPipelinePhase('skeleton')

    const assistantId = `msg-${Date.now() + 1}`
    let assistantContent = ''
    const toolCalls: ToolCall[] = []
    const responseCitations: Citation[] = []
    let hasPlan = false

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
                // Pipeline resolved/created a thread — persist for session continuity
                const tid = event.data.threadId
                setThreadId(tid)
                localStorage.setItem(THREAD_STORAGE_KEY, tid)
                break
              }

              case 'thinking':
              case 'thinking_start':
                // Engine is active — skeleton already showing, prepare for thinking content
                setIsThinkingStreaming(true)
                break

              case 'thinking_delta':
                // Extended thinking content streaming from synthesis tier
                setThinkingContent(prev => prev + event.data)
                setIsThinkingStreaming(true)
                break

              case 'thinking_complete': {
                // Thinking finished — record duration, stop streaming
                setIsThinkingStreaming(false)
                const durationMs = event.data?.duration_ms
                if (durationMs) {
                  setThinkingDuration(Math.ceil(durationMs / 1000))
                }
                break
              }

              case 'citation': {
                // Citations extracted from tool results or response
                const newCitations = event.data?.citations || []
                if (newCitations.length > 0) {
                  responseCitations.push(...newCitations)
                  setActiveCitations(prev => [...prev, ...newCitations])
                }
                break
              }

              case 'checkpoint': {
                // Conversation checkpoint — insert visual divider
                setCheckpoints(prev => [...prev, {
                  messageIndex: event.data.message_index,
                  label: event.data.label,
                  afterMessageId: assistantId,
                }])
                break
              }

              case 'stage':
                // Internal engine stages — no longer shown in UI
                break

              case 'plan': {
                // Planner sent execution plan — crossfade from skeleton
                const stages = (event.data.stages || []).map((s: { id: string; label: string; sublabel?: string; icon: string; toolHint?: string }) => ({
                  ...s,
                  status: 'idle' as const,
                }))
                if (stages.length > 0) {
                  setPlanStages(stages)
                  setPipelinePhase('plan')
                  hasPlan = true
                }
                break
              }

              case 'plan_stage_update': {
                const { stageId, status } = event.data as { stageId: string; status: 'active' | 'done' | 'error' }
                setPlanStages(prev =>
                  prev.map(s =>
                    s.id === stageId ? { ...s, status } : s
                  )
                )
                break
              }

              case 'tool_call': {
                const tc: ToolCall = {
                  name: event.data.name,
                  input: event.data.input,
                  status: 'running',
                }
                toolCalls.push(tc)

                // WS3: Tool calls activate pipeline stages instead of showing separate cards
                // Only update message if tool has no matching pipeline stage
                setPlanStages(prev => {
                  const matched = prev.find(s => s.toolHint === event.data.name && s.status === 'idle')
                  if (matched) {
                    return prev.map(s =>
                      s.id === matched.id ? { ...s, status: 'active' as const } : s
                    )
                  }
                  return prev
                })

                // Still track tool calls on the message for the summary
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

                // Track queued tool approvals for Confirmation UI
                if (event.data.queued && event.data.approvalId) {
                  setPendingApprovals(prev => [...prev, {
                    id: event.data.approvalId,
                    toolName: event.data.name,
                    input: toolCalls.find(tc => tc.name === event.data.name)?.input,
                    status: 'pending',
                  }])
                }

                // Mark matching pipeline stage as done
                setPlanStages(prev =>
                  prev.map(s => {
                    if (s.toolHint === event.data.name && s.status === 'active') {
                      return { ...s, status: event.data.success ? 'done' as const : 'error' as const }
                    }
                    return s
                  })
                )

                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, toolCalls: [...toolCalls] }
                      : m
                  )
                )
                break
              }

              case 'content_delta':
                setThinkingText(null)
                setIsThinkingStreaming(false)
                assistantContent += event.data
                // Pipeline stays visible during streaming — do NOT hide
                if (!rafPending.current) {
                  rafPending.current = true
                  requestAnimationFrame(() => {
                    rafPending.current = false
                    const content = assistantContent
                    setMessages(prev => {
                      const existing = prev.find(m => m.id === assistantId)
                      if (existing) {
                        return prev.map(m =>
                          m.id === assistantId
                            ? { ...m, content }
                            : m
                        )
                      }
                      return [
                        ...prev,
                        {
                          id: assistantId,
                          role: 'assistant' as const,
                          content,
                          toolCalls: toolCalls.length > 0 ? [...toolCalls] : undefined,
                          timestamp: new Date(),
                        },
                      ]
                    })
                  })
                }
                break

              case 'message':
                setThinkingText(null)
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
                setThinkingText(null)
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
                setThinkingText(null)
                setIsThinkingStreaming(false)
                // Attach accumulated citations to the assistant message
                if (responseCitations.length > 0) {
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantId
                        ? { ...m, citations: [...responseCitations] }
                        : m
                    )
                  )
                }
                // WS4: Mark all remaining stages as done, then fade after 1s
                setPlanStages(prev =>
                  prev.map(s => s.status !== 'done' && s.status !== 'error'
                    ? { ...s, status: 'done' as const }
                    : s
                  )
                )
                setPipelinePhase('done')
                pipelineFadeTimer.current = setTimeout(() => {
                  setPipelineVisible(false)
                }, 1000)
                break
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err) {
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
      setThinkingText(null)
      // If pipeline didn't get a 'done' event, fade it now
      if (pipelineFadeTimer.current === null) {
        setPipelineVisible(false)
      }
    }
  }, [isLoading, threadId])

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

  const hasMessages = messages.length > 0
  const chatStarted = hasMessages || isLoading || Boolean(thinkingText)

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(CHAT_LAYOUT_EVENT, { detail: { started: chatStarted } }))
  }, [chatStarted])

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent(CHAT_LAYOUT_EVENT, { detail: { started: false } }))
    }
  }, [])

  return (
    <div className={`bb-chat ${chatStarted ? 'bb-chat--active' : 'bb-chat--pre-session'}`}>
      {/* AI disclosure moved to input footer */}

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
                <BitBitLogoVideo size={140} />
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
                const hasCompletedTools = msg.toolCalls && msg.toolCalls.length > 0 && msg.toolCalls.every(tc => tc.status !== 'running')
                const checkpoint = checkpoints.find(cp => cp.afterMessageId === msg.id)

                return (
                  <div
                    key={msg.id}
                    className={isGroupChange ? 'bb-chat__msg-group-gap' : ''}
                  >
                    <MessageBubble
                      message={msg}
                      citations={msg.citations || (isLastAssistant && isLoading ? activeCitations : undefined)}
                    />
                    {/* WS3: Show collapsed tool summary after response completes (not during) */}
                    {isLastAssistant && hasCompletedTools && !isLoading && (
                      <div className="bb-chat__tc-summary-wrap">
                        <ToolCallSummary toolCalls={msg.toolCalls!} />
                      </div>
                    )}
                    {/* WS2: Checkpoint dividers at session boundaries / topic shifts */}
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

              {/* WS4: Pipeline visible throughout entire execution lifecycle */}
              {pipelineVisible && planStages.length > 0 && (
                <div className="bb-chat__msg bb-chat__msg--assistant">
                  <div className="bb-chat__assistant-icon">
                    <BitBitLogoAnimated size={24} />
                  </div>
                  <ThoughtPipeline
                    stages={planStages}
                    visible={true}
                    phase={pipelinePhase}
                  />
                </div>
              )}

              {/* WS2: Extended thinking — collapsible reasoning panel */}
              {thinkingContent && (
                <div className="bb-chat__msg bb-chat__msg--assistant">
                  <div className="bb-chat__assistant-icon">
                    <BitBitLogoAnimated size={24} />
                  </div>
                  <div style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'var(--glass-bg, rgba(255,255,255,0.04))',
                    borderRadius: 12,
                    border: '1px solid var(--glass-border, rgba(255,255,255,0.08))',
                    padding: '8px 12px',
                    backdropFilter: 'blur(12px)',
                  }}>
                    <Reasoning isStreaming={isThinkingStreaming} duration={thinkingDuration}>
                      <ReasoningTrigger />
                      <ReasoningContent>{thinkingContent}</ReasoningContent>
                    </Reasoning>
                  </div>
                </div>
              )}

              {/* WS2: Pending approval confirmations */}
              {pendingApprovals.filter(a => a.status === 'pending').map(approval => (
                <div key={approval.id} className="bb-chat__msg bb-chat__msg--assistant" style={{ marginTop: 8 }}>
                  <div className="bb-chat__assistant-icon">
                    <BitBitLogoAnimated size={24} />
                  </div>
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

              {/* Loading dots — only when no pipeline and no thinking content yet */}
              {isLoading && !pipelineVisible && !thinkingContent && !(messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content) && (
                <div className="bb-chat__msg bb-chat__msg--assistant">
                  <div className="bb-chat__assistant-icon">
                    <BitBitLogoAnimated size={24} />
                  </div>
                  <div className="bb-chat__dots">
                    <span /><span /><span />
                  </div>
                </div>
              )}

              {thinkingText && (
                <div className="bb-chat__msg bb-chat__msg--assistant">
                  <div className="bb-chat__assistant-icon">
                    <BitBitLogoAnimated size={24} />
                  </div>
                  <span className="bb-chat__thinking">{thinkingText}</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Docked pill input */}
      <div
        className={`bb-chat__input-area ${chatStarted ? 'bb-chat__input-area--bottom' : 'bb-chat__input-area--centered'}`}
      >
        <div id="pill-dock" />
      </div>
    </div>
  )
}
