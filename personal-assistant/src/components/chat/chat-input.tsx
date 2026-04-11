'use client'

import { useRef, useCallback, useEffect } from 'react'
import { IconSend } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

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
    <div className="px-4 pb-4 pt-2">
      <div className="flex items-center gap-2 rounded-[var(--radius-container)] border border-chat-surface-border bg-chat-surface p-2">
        <Textarea
          ref={textareaRef}
          className="min-h-[36px] max-h-[120px] resize-none border-0 bg-transparent text-base focus-visible:ring-0 focus-visible:ring-offset-0"
          placeholder={placeholder}
          onKeyDown={handleKeyDown}
          onChange={(e) => { value.current = e.target.value }}
          disabled={disabled}
          rows={1}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleSubmit}
          disabled={disabled}
          aria-label="Send message"
        >
          <IconSend size={18} />
        </Button>
      </div>
    </div>
  )
}
