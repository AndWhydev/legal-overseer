import { Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'

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

function renderMarkdown(text: string) {
  // Simple inline markdown: bold, code, inline code
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code
          key={i}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  if (!message.content && message.toolCalls?.length) {
    return null // tool calls rendered separately
  }

  if (!message.content) return null

  return (
    <div
      className={cn('flex gap-3 py-2', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      <div
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary/20' : 'bg-accent/30'
        )}
      >
        {isUser ? (
          <User className="size-3.5 text-primary" />
        ) : (
          <Bot className="size-3.5 text-accent-foreground" />
        )}
      </div>

      <div className={cn('flex max-w-[80%] flex-col gap-1', isUser ? 'items-end' : 'items-start')}>
        <div
          className={cn(
            'rounded-xl px-3.5 py-2.5 text-sm leading-relaxed',
            isUser
              ? 'bg-primary/10 text-foreground'
              : 'bg-card border border-border text-card-foreground'
          )}
        >
          {message.content.split('\n').map((line, i) => (
            <p key={i} className={cn(i > 0 && 'mt-2')}>
              {line.startsWith('- ') ? (
                <span className="flex gap-1.5">
                  <span className="text-muted-foreground">&#8226;</span>
                  <span>{renderMarkdown(line.slice(2))}</span>
                </span>
              ) : (
                renderMarkdown(line)
              )}
            </p>
          ))}
        </div>
        <span className="px-1 text-[10px] text-muted-foreground">
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  )
}
