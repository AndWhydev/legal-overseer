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

function renderMarkdown(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="bb-chat__code">
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
      <div className={isUser ? 'bb-chat__bubble--user' : 'bb-chat__bubble--assistant'}>
        {message.content.split('\n').map((line, i) => (
          <p key={i} className={i > 0 ? 'bb-chat__line-gap' : undefined}>
            {line.startsWith('- ') ? (
              <span className="bb-chat__list-item">
                <span className="bb-chat__bullet">&#8226;</span>
                <span>{renderMarkdown(line.slice(2))}</span>
              </span>
            ) : (
              renderMarkdown(line)
            )}
          </p>
        ))}
      </div>
    </div>
  )
}
