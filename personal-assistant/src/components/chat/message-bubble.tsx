'use client'

import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { motion } from 'motion/react'
import { RefreshCw, ThumbsUp, ThumbsDown, Pencil } from 'lucide-react'
import { BitBitFaceAvatar } from './bitbit-face-avatar'
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
    // Add text before the marker
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    // Find matching citation
    const citationIndex = parseInt(match[1])
    const citation = citations.find(c => c.index === citationIndex)
    if (citation) {
      parts.push(<CitationBadge key={`cite-${match.index}`} citation={citation} />)
    } else {
      parts.push(match[0]) // Keep original text if no matching citation
    }
    lastIndex = regex.lastIndex
  }

  // Add remaining text
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

  // Base components for code blocks and inline code
  const baseComponents = {
    code: ({ className, children, ...props }: { className?: string; children?: React.ReactNode; [key: string]: any }) => {
      // Check if it's inline code (no className, no newlines) or a code block
      const isInline = !className || !String(children).includes('\n')

      if (isInline) {
        // Render as styled inline code
        return (
          <code
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              color: 'var(--text-primary, #F1F5F9)',
              padding: '2px 6px',
              borderRadius: '4px',
              fontFamily: 'ui-monospace, "SF Mono", "Cascadia Code", "Segoe UI Mono", Menlo, Consolas, monospace',
              fontSize: '0.9em',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {children}
          </code>
        )
      }

      // Code block
      return <CodeBlock className={className} onOpenArtifact={onOpenArtifact}>{String(children).replace(/\n$/, '')}</CodeBlock>
    },
    pre: ({ children, ...props }: { children?: React.ReactNode; [key: string]: any }) => {
      // Just pass children through — CodeBlock handles the pre element
      return <>{children}</>
    },
  }

  // Build custom ReactMarkdown components to inject citation badges
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

  // Merge base components with citation components
  const markdownComponents = {
    ...baseComponents,
    ...citationComponents,
  }

  return (
    <div className={`bb-chat__msg ${isUser ? 'bb-chat__msg--user' : 'bb-chat__msg--assistant'}`} style={!isUser && showAvatar ? { position: 'relative' } : isUser ? { position: 'relative' } : undefined}>
      {!isUser && showAvatar && (
        <motion.div
          layoutId="bitbit-chat-avatar"
          transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
          style={{ position: 'absolute', left: -52, top: -4, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <BitBitFaceAvatar size={40} emotion={avatarEmotion as any} isThinking={avatarThinking} activity={avatarActivity as any} />
        </motion.div>
      )}
      {/* Edit button for user messages (appears on hover) */}
      {isUser && onEdit && !isEditing && (
        <button
          onClick={() => setIsEditing(true)}
          style={{
            position: 'absolute',
            left: -28,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted, rgba(255,255,255,0.2))',
            cursor: 'pointer',
            opacity: 0,
            transition: 'opacity 150ms',
            padding: 4,
          }}
          className="bb-chat__edit-btn"
          aria-label="Edit message"
        >
          <Pencil size={12} />
        </button>
      )}
      <div className={isUser ? 'bb-chat__bubble--user' : 'bb-chat__bubble--assistant bb-chat__markdown'}>
        {isUser && isEditing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                minHeight: 60,
                padding: '8px 12px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-primary, #F1F5F9)',
                fontSize: 14,
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
              }}
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
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setIsEditing(false); setEditText(message.content) }}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                  background: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (editText.trim() && onEdit) {
                    onEdit!(message.id, editText.trim())
                    setIsEditing(false)
                  }
                }}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: 'none',
                  background: 'var(--btn-primary-bg, #F1F5F9)', color: 'var(--btn-primary-fg, #0a0f1a)',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                }}
              >
                Save & Resend
              </button>
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
        <div style={{ display: 'flex', gap: 2, marginTop: 8, alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', gap: 2 }}>
            <motion.button
              onClick={() => handleFeedback('up')}
              animate={feedback === 'up' ? { scale: [1, 1.2, 1] } : { scale: 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{
                background: 'none',
                border: 'none',
                padding: '3px 6px',
                borderRadius: 4,
                color: feedback === 'up' ? 'var(--text-primary, #F1F5F9)' : 'var(--text-muted, rgba(255,255,255,0.25))',
                cursor: 'pointer',
                transition: 'color 150ms',
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                if (feedback !== 'up') {
                  e.currentTarget.style.color = 'var(--text-secondary, #94A3B8)'
                }
              }}
              onMouseLeave={(e) => {
                if (feedback !== 'up') {
                  e.currentTarget.style.color = 'var(--text-muted, rgba(255,255,255,0.25))'
                }
              }}
              aria-label="Good response"
            >
              <ThumbsUp size={12} fill={feedback === 'up' ? 'currentColor' : 'none'} />
            </motion.button>
            <motion.button
              onClick={() => handleFeedback('down')}
              animate={feedback === 'down' ? { scale: [1, 1.2, 1] } : { scale: 1 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              style={{
                background: 'none',
                border: 'none',
                padding: '3px 6px',
                borderRadius: 4,
                color: feedback === 'down' ? 'var(--text-primary, #F1F5F9)' : 'var(--text-muted, rgba(255,255,255,0.25))',
                cursor: 'pointer',
                transition: 'color 150ms',
                display: 'flex',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => {
                if (feedback !== 'down') {
                  e.currentTarget.style.color = 'var(--text-secondary, #94A3B8)'
                }
              }}
              onMouseLeave={(e) => {
                if (feedback !== 'down') {
                  e.currentTarget.style.color = 'var(--text-muted, rgba(255,255,255,0.25))'
                }
              }}
              aria-label="Bad response"
            >
              <ThumbsDown size={12} fill={feedback === 'down' ? 'currentColor' : 'none'} />
            </motion.button>
          </div>
          {onRegenerate && (
            <button
              onClick={onRegenerate}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 6,
                background: 'none',
                border: 'none',
                color: 'var(--text-muted, rgba(255,255,255,0.25))',
                fontSize: 12,
                cursor: 'pointer',
                transition: 'color 150ms',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary, #94A3B8)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted, rgba(255,255,255,0.25))' }}
              aria-label="Regenerate response"
            >
              <RefreshCw size={12} />
              Regenerate
            </button>
          )}
        </div>
      )}
    </div>
  )
}
