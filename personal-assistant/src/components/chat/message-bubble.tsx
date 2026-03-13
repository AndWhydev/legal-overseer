'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BitBitLogoAnimated } from './bitbit-logo-animated'
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

export function MessageBubble({ message, citations }: { message: Message; citations?: Citation[] }) {
  const isUser = message.role === 'user'
  const msgCitations = citations || message.citations

  if (!message.content && message.toolCalls?.length) return null
  if (!message.content) return null

  // Build custom ReactMarkdown components to inject citation badges
  const markdownComponents = msgCitations && msgCitations.length > 0
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
    : undefined

  return (
    <div className={`bb-chat__msg ${isUser ? 'bb-chat__msg--user' : 'bb-chat__msg--assistant'}`}>
      {!isUser && (
        <div className="bb-chat__assistant-icon">
          <BitBitLogoAnimated size={24} />
        </div>
      )}
      <div className={isUser ? 'bb-chat__bubble--user' : 'bb-chat__bubble--assistant bb-chat__markdown'}>
        {isUser ? (
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
    </div>
  )
}
