'use client'

import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { motion } from 'motion/react'
import { IconRefresh, IconThumbUp, IconThumbDown, IconPencil } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { BitBitAsciiAvatar } from '@/components/ui/bitbit-ascii-avatar'
import { CodeBlock } from './code-block'
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardTrigger,
  InlineCitationCardBody,
  InlineCitationSource,
} from '@/components/ai-elements/inline-citation'
import type { Citation } from './chat-interface'

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
  citations?: Citation[]
  timestamp: Date
  feedback?: 'up' | 'down' | null
}

/** Close dangling markdown syntax for mid-stream rendering */
function patchIncomplete(text: string): string {
  // Close unclosed code fences
  const fenceCount = (text.match(/```/g) || []).length
  if (fenceCount % 2 !== 0) text += '\n```'
  // Close unclosed bold
  const boldCount = (text.match(/\*\*/g) || []).length
  if (boldCount % 2 !== 0) text += '**'
  // Close unclosed italic (single *)
  const italicCount = (text.match(/(?<!\*)\*(?!\*)/g) || []).length
  if (italicCount % 2 !== 0) text += '*'
  return text
}

/** Render a citation badge with hover card */
function CitationBadge({ citation }: { citation: Citation }) {
  return (
    <InlineCitation>
      <InlineCitationCard>
        <InlineCitationCardTrigger sources={[citation.url]} />
        <InlineCitationCardBody>
          <InlineCitationSource
            title={citation.title}
            url={citation.url}
            description={citation.description}
          />
        </InlineCitationCardBody>
      </InlineCitationCard>
    </InlineCitation>
  )
}

/** Parse text for [n] citation markers and insert CitationBadge components */
function renderTextWithCitations(text: string, citations: Citation[]): React.ReactNode[] {
  if (!citations || citations.length === 0) return [text]

  const parts: React.ReactNode[] = []
  const regex = /\[(\d+)\]/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const citationIndex = parseInt(match[1])
    const citation = citations.find(c => c.index === citationIndex)
    if (citation) {
      parts.push(<CitationBadge key={`cite-${match.index}`} citation={citation} />)
    } else {
      parts.push(match[0])
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts
}

export function MessageBubble({ message, citations, showAvatar = false, avatarEmotion, avatarThinking, avatarActivity, onRegenerate, onFeedback, onEdit, onOpenArtifact }: { message: Message; citations?: Citation[]; showAvatar?: boolean; avatarEmotion?: string; avatarThinking?: boolean; avatarActivity?: string; onRegenerate?: () => void; onFeedback?: (type: 'up' | 'down') => void; onEdit?: (messageId: string, newContent: string) => void; onOpenArtifact?: (content: string, lang: string) => void }) {
  const isUser = message.role === 'user'
  const msgCitations = citations || message.citations
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(message.feedback || null)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)

  const handleFeedback = (type: 'up' | 'down') => {
    const next = feedback === type ? null : type
    setFeedback(next)
    onFeedback?.(next as 'up' | 'down')
    fetch('/api/agent/chat/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: message.id, feedback: next }),
    }).catch(() => {})
  }

  if (!message.content && message.toolCalls?.length) return null
  if (!message.content) return null

  const baseComponents = {
    code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode; [key: string]: any }) => {
      const isInline = !className || !String(children).includes('\n')

      if (isInline) {
        return (
          <code className="bg-muted px-1.5 py-0.5 rounded text-[0.9em] font-mono whitespace-pre-wrap break-words">
            {children}
          </code>
        )
      }

      return <CodeBlock className={className} onOpenArtifact={onOpenArtifact}>{String(children).replace(/\n$/, '')}</CodeBlock>
    },
    pre: ({ children, ...props }: { children?: React.ReactNode; [key: string]: any }) => {
      return <>{children}</>
    },
  }

  const citationComponents = msgCitations && msgCitations.length > 0
    ? {
        p: ({ children }: { children?: React.ReactNode }) => {
          const processed = React.Children.map(children, child => {
            if (typeof child === 'string') {
              const nodes = renderTextWithCitations(child, msgCitations)
              return nodes.length === 1 && typeof nodes[0] === 'string' ? nodes[0] : <>{nodes}</>
            }
            return child
          })
          return <p>{processed}</p>
        },
        li: ({ children }: { children?: React.ReactNode }) => {
          const processed = React.Children.map(children, child => {
            if (typeof child === 'string') {
              const nodes = renderTextWithCitations(child, msgCitations)
              return nodes.length === 1 && typeof nodes[0] === 'string' ? nodes[0] : <>{nodes}</>
            }
            return child
          })
          return <li>{processed}</li>
        },
      }
    : {}

  const markdownComponents = {
    ...baseComponents,
    ...citationComponents,
  }

  return (
    <div className={`bb-chat__msg ${isUser ? 'bb-chat__msg--user' : 'bb-chat__msg--assistant'} relative`}>
      {!isUser && showAvatar && (
        <div className="bb-chat__assistant-icon">
          <BitBitAsciiAvatar size={64} emotion={avatarEmotion as any} isThinking={avatarThinking} />
        </div>
      )}
      {/* Edit button for user messages (appears on hover) */}
      {isUser && onEdit && !isEditing && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setIsEditing(true)}
          className="absolute -left-7 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 bb-chat__edit-btn text-muted-foreground hover:text-foreground"
          aria-label="Edit message"
        >
          <IconPencil size={12} />
        </Button>
      )}
      <div className={isUser ? 'rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-4 py-2.5 max-w-[85%] ml-auto' : 'bb-chat__bubble--assistant bb-chat__markdown'}>
        {isUser && isEditing ? (
          <div className="flex flex-col gap-1.5 w-full">
            <Textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              autoFocus
              className="min-h-[60px] resize-y"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (editText.trim() && onEdit) {
                    onEdit!(message.id, editText.trim())
                    setIsEditing(false)
                  }
                }
                if (e.key === 'Escape') {
                  setIsEditing(false)
                  setEditText(message.content)
                }
              }}
            />
            <div className="flex gap-1.5 justify-end">
              <Button
                variant="outline"
                size="xs"
                onClick={() => { setIsEditing(false); setEditText(message.content) }}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                onClick={() => {
                  if (editText.trim() && onEdit) {
                    onEdit!(message.id, editText.trim())
                    setIsEditing(false)
                  }
                }}
              >
                Save & Resend
              </Button>
            </div>
          </div>
        ) : isUser ? (
          message.content
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents as any}
          >
            {patchIncomplete(message.content)}
          </ReactMarkdown>
        )}
      </div>
      {!isUser && (
        <div className="flex gap-0.5 mt-2 items-center">
          <div className="inline-flex gap-0.5">
            <motion.div
              animate={feedback === 'up' ? { scale: [1, 1.2, 1] } : { scale: 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleFeedback('up')}
                className={feedback === 'up' ? 'text-foreground' : 'text-muted-foreground/40 hover:text-muted-foreground'}
                aria-label="Good response"
              >
                <IconThumbUp size={12} fill={feedback === 'up' ? 'currentColor' : 'none'} />
              </Button>
            </motion.div>
            <motion.div
              animate={feedback === 'down' ? { scale: [1, 1.2, 1] } : { scale: 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => handleFeedback('down')}
                className={feedback === 'down' ? 'text-foreground' : 'text-muted-foreground/40 hover:text-muted-foreground'}
                aria-label="Bad response"
              >
                <IconThumbDown size={12} fill={feedback === 'down' ? 'currentColor' : 'none'} />
              </Button>
            </motion.div>
          </div>
          {onRegenerate && (
            <Button
              variant="ghost"
              size="xs"
              onClick={onRegenerate}
              className="text-muted-foreground/40 hover:text-muted-foreground gap-1"
              aria-label="Regenerate response"
            >
              <IconRefresh size={12} />
              Regenerate
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
