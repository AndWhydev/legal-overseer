'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, Loader2, Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageBubble } from './message-bubble'
import { ToolCallCard } from './tool-call-card'

interface ToolCall {
  name: string
  input: unknown
  result?: unknown
  success?: boolean
  status: 'running' | 'done' | 'error'
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
  timestamp: Date
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [thinkingText, setThinkingText] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, thinkingText, scrollToBottom])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return

    const userMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMsg])
    setInput('')
    setIsLoading(true)
    setThinkingText(null)

    const assistantId = `msg-${Date.now() + 1}`
    let assistantContent = ''
    const toolCalls: ToolCall[] = []

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
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
              case 'thinking':
                setThinkingText(event.data)
                break

              case 'tool_call': {
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
                setMessages(prev =>
                  prev.map(m =>
                    m.id === assistantId
                      ? { ...m, toolCalls: [...toolCalls] }
                      : m
                  )
                )
                break
              }

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
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="flex flex-col gap-1 p-4">
          {messages.length === 0 && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                <Bot className="size-8 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold">BitBit Assistant</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Ask me to create tasks, look up contacts, manage your workflow, or just chat.
                </p>
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className="flex flex-col gap-1">
              <MessageBubble message={msg} />
              {msg.toolCalls?.map((tc, i) => (
                <ToolCallCard key={`${msg.id}-tc-${i}`} toolCall={tc} />
              ))}
            </div>
          ))}

          {thinkingText && (
            <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>{thinkingText}</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input bar */}
      <div className="border-t border-border bg-background p-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask BitBit anything..."
            rows={1}
            className="field-sizing-content max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-input bg-card px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
