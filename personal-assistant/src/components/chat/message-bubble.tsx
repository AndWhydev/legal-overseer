'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BitBitLogoAnimated } from './bitbit-logo-animated'

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

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  if (!message.content && message.toolCalls?.length) return null
  if (!message.content) return null

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
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {patchIncomplete(message.content)}
          </ReactMarkdown>
        )}
      </div>
    </div>
  )
}
