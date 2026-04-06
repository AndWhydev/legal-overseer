'use client'

import React, { useState } from 'react'
import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { math } from '@streamdown/math'
import { mermaid } from '@streamdown/mermaid'
import { motion } from 'motion/react'
import { IconRefresh, IconThumbUp, IconThumbDown, IconPencil, IconCopy, IconCheck } from '@tabler/icons-react'
import { Streamdown, type Components } from 'streamdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CodeBlock } from './code-block'
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardTrigger,
  InlineCitationCardBody,
  InlineCitationSource,
} from '@/components/ai-elements/inline-citation'
import { EntityChip } from './entity-chip'
import type { Citation } from './chat-interface'

export interface EntityRef {
  name: string
  type: string
  subtitle?: string
}

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

const streamdownPlugins = { cjk, code, math, mermaid }

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

/** Replace known entity names in text with EntityChip components */
function renderTextWithEntities(nodes: React.ReactNode[], entities: EntityRef[]): React.ReactNode[] {
  if (!entities || entities.length === 0) return nodes

  // Sort by name length descending to match longest first
  const sorted = [...entities].sort((a, b) => b.name.length - a.name.length)

  return nodes.flatMap((node, nodeIdx) => {
    if (typeof node !== 'string') return [node]

    let text = node
    const result: React.ReactNode[] = []
    let keyCounter = 0

    for (const entity of sorted) {
      if (entity.name.length < 3) continue // Skip very short names
      const parts = (text as string).split(new RegExp(`\\b(${entity.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi'))
      if (parts.length <= 1) continue

      const newParts: React.ReactNode[] = []
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
          if (parts[i]) newParts.push(parts[i])
        } else {
          newParts.push(
            <EntityChip
              key={`entity-${nodeIdx}-${keyCounter++}`}
              name={entity.name}
              type={entity.type}
              subtitle={entity.subtitle}
            />
          )
        }
      }
      // Only process first match per entity to avoid over-chipping
      if (newParts.length > 1) {
        result.push(...newParts)
        text = '' // consumed
        break
      }
    }

    if (text) result.push(text)
    return result
  })
}

export function MessageBubble({ message, citations, entities, onRegenerate, onFeedback, onEdit, onOpenArtifact, isStreaming = false }: { message: Message; citations?: Citation[]; entities?: EntityRef[]; onRegenerate?: () => void; onFeedback?: (type: 'up' | 'down') => void; onEdit?: (messageId: string, newContent: string) => void; onOpenArtifact?: (content: string, lang: string) => void; isStreaming?: boolean }) {
  const isUser = message.role === 'user'
  const msgCitations = citations || message.citations
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(message.feedback || null)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(message.content)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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

  const baseComponents: Components = {
    code: ({ className, children }) => {
      const isInline = !className || !String(children).includes('\n')

      if (isInline) {
        return (
          <code className="bg-muted px-1.5 py-0.5 rounded-lg text-[0.9em] tabular-nums whitespace-pre-wrap break-words">
            {children}
          </code>
        )
      }

      return <CodeBlock className={className} onOpenArtifact={onOpenArtifact}>{String(children).replace(/\n$/, '')}</CodeBlock>
    },
    pre: ({ children }) => {
      return <>{children}</>
    },
    table: ({ children }) => (
      <div className="my-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => (
      <thead className="bg-muted/50 border-b border-border">
        {children}
      </thead>
    ),
    th: ({ children }) => (
      <th className="px-3 py-2 text-left font-medium text-foreground text-xs uppercase tracking-wider">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-3 py-2 text-foreground border-t border-border/50">
        {children}
      </td>
    ),
  }

  const hasCitations = msgCitations && msgCitations.length > 0
  const hasEntities = entities && entities.length > 0

  /** Process text children through citation + entity pipelines */
  const processTextChild = (child: React.ReactNode): React.ReactNode => {
    if (typeof child !== 'string') return child
    let nodes: React.ReactNode[] = [child]
    if (hasCitations) nodes = renderTextWithCitations(child, msgCitations)
    if (hasEntities) nodes = renderTextWithEntities(nodes, entities)
    return nodes.length === 1 && typeof nodes[0] === 'string' ? nodes[0] : <>{nodes}</>
  }

  const richTextComponents = (hasCitations || hasEntities)
    ? {
        p: ({ children }: { children?: React.ReactNode }) => {
          return <p>{React.Children.map(children, processTextChild)}</p>
        },
        li: ({ children }: { children?: React.ReactNode }) => {
          return <li>{React.Children.map(children, processTextChild)}</li>
        },
      }
    : {}

  const markdownComponents = {
    ...baseComponents,
    ...richTextComponents,
  } as Components

  return (
    <div className={`bb-chat__msg ${isUser ? 'bb-chat__msg--user' : 'bb-chat__msg--assistant'} relative`}>
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
      {!isUser ? (
        <div className="flex flex-col w-full">
          {/* Message content */}
          <div className="bb-chat__bubble--assistant bb-chat__markdown">
            <Streamdown
              mode="streaming"
              isAnimating={isStreaming}
              animated={isStreaming}
              plugins={streamdownPlugins}
              components={markdownComponents}
            >
              {message.content}
            </Streamdown>
          </div>
          {/* Action bar — below message, left-aligned */}
          <div className="flex gap-0.5 items-center mt-2 -ml-1">
            <motion.div
              animate={feedback === 'up' ? { scale: [1, 1.2, 1] } : { scale: 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <button
                type="button"
                onClick={() => handleFeedback('up')}
                className={`p-1 cursor-pointer bg-transparent border-0 outline-none ${feedback === 'up' ? 'text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}
                aria-label="Good response"
              >
                <IconThumbUp size={16} fill={feedback === 'up' ? 'currentColor' : 'none'} />
              </button>
            </motion.div>
            <motion.div
              animate={feedback === 'down' ? { scale: [1, 1.2, 1] } : { scale: 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <button
                type="button"
                onClick={() => handleFeedback('down')}
                className={`p-1 cursor-pointer bg-transparent border-0 outline-none ${feedback === 'down' ? 'text-foreground' : 'text-muted-foreground hover:text-muted-foreground'}`}
                aria-label="Bad response"
              >
                <IconThumbDown size={16} fill={feedback === 'down' ? 'currentColor' : 'none'} />
              </button>
            </motion.div>
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 cursor-pointer bg-transparent border-0 outline-none text-muted-foreground hover:text-muted-foreground"
              aria-label="Copy message"
            >
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </button>
            {onRegenerate && (
              <button
                type="button"
                onClick={onRegenerate}
                className="p-1 cursor-pointer bg-transparent border-0 outline-none text-muted-foreground hover:text-muted-foreground"
                aria-label="Regenerate response"
              >
                <IconRefresh size={16} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="bb-chat__bubble--user ml-auto max-w-[90%]">
          {isEditing ? (
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
          ) : (
            message.content
          )}
        </div>
      )}
    </div>
  )
}