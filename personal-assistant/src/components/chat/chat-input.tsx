'use client'

import { useRef, useCallback, useEffect } from 'react'
import { Send } from 'lucide-react'

interface ChatInputProps {
  onSend: (text: string) => void
  onVoice?: () => void
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = 'Message BitBit...',
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const value = useRef('')
  const [, forceUpdate] = [0, () => {}] // we'll use uncontrolled + ref

  // Auto-focus on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(() => {
    const text = textareaRef.current?.value.trim()
    if (!text || disabled) return
    onSend(text)
    if (textareaRef.current) {
      textareaRef.current.value = ''
      value.current = ''
    }
  }, [onSend, disabled])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <div className="bb-chat-input">
      <div className="bb-chat-input__card">
        <textarea
          ref={textareaRef}
          className="bb-chat-input__textarea"
          placeholder={placeholder}
          onKeyDown={handleKeyDown}
          onChange={(e) => { value.current = e.target.value }}
          disabled={disabled}
          rows={1}
        />
        <button
          className="bb-chat-input__send"
          onClick={handleSubmit}
          disabled={disabled}
          aria-label="Send message"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  )
}
