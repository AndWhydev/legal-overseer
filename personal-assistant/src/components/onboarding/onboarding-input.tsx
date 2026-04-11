'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import { IconArrowUp } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface OnboardingInputProps {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
}

/**
 * Onboarding chat input — matches the docked VoicePill appearance
 * without the voice/attachment/command machinery.
 */
export function OnboardingInput({
  onSend,
  disabled = false,
  placeholder = 'Message BitBit...',
}: OnboardingInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 188)}px`
  }, [value])

  const handleSubmit = useCallback(() => {
    const text = value.trim()
    if (!text || disabled) return
    onSend(text)
    setValue('')
  }, [value, onSend, disabled])

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
      <div
        className={cn(
          'flex flex-col items-stretch',
          'w-full max-w-[860px] mx-auto',
          'rounded-[var(--radius-container)] border',
          'shadow-sm',
          'min-h-[120px] px-5 pt-3.5 pb-3',
        )}
        style={{ borderColor: 'var(--chat-surface-border)', backgroundColor: 'var(--chat-surface-bg)' }}
      >
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          className={cn(
            'w-full flex-1 resize-none overflow-y-auto',
            'bg-transparent border-0 outline-none shadow-none',
            'text-base leading-[1.55] text-foreground',
            'placeholder:text-muted-foreground',
            'focus-visible:ring-0 focus-visible:border-0',
            'max-h-[188px] min-h-[88px] pr-0.5',
          )}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          autoComplete="off"
          rows={1}
        />

        {/* Bottom action row */}
        <div className="flex items-center justify-end pt-2">
          <Button
            size="icon"
            className={cn(
              'rounded-full h-8 w-8',
              value.trim()
                ? 'bg-foreground text-background hover:bg-foreground/90'
                : 'bg-muted text-muted-foreground',
            )}
            onClick={handleSubmit}
            disabled={disabled || !value.trim()}
            aria-label="Send message"
            type="button"
          >
            <IconArrowUp size={18} />
          </Button>
        </div>
      </div>
    </div>
  )
}
