// src/components/dashboard/inbox-drawer-chat-composer.tsx
'use client'

import { useRef, useCallback } from 'react'
import { IconPaperclip, IconArrowUp } from '@tabler/icons-react'

interface ChatComposerProps {
  recipientName: string
  draftText: string
  onDraftChange: (text: string) => void
  onAddAttachment: (file: File) => void
  onSend: () => void
  onFocusChange: (focused: boolean) => void
}

export function ChatComposer({
  recipientName,
  draftText,
  onDraftChange,
  onAddAttachment,
  onSend,
  onFocusChange,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      onSend()
    }
  }, [onSend])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) Array.from(files).forEach(f => onAddAttachment(f))
    e.target.value = ''
  }, [onAddAttachment])

  return (
    <div className="shrink-0 px-3.5 pb-3 flex items-end gap-2">
      <button
        className="rounded-full bg-sidebar-foreground/[0.04] p-2 text-sidebar-foreground/30 hover:text-sidebar-foreground/50 shrink-0"
        onClick={() => fileInputRef.current?.click()}
      >
        <IconPaperclip className="size-4" />
      </button>

      <div className="flex-1 min-h-9 rounded-2xl bg-sidebar-foreground/[0.04] px-3.5 py-2 flex items-center">
        <textarea
          ref={textareaRef}
          value={draftText}
          onChange={e => {
            onDraftChange(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => onFocusChange(true)}
          onBlur={() => onFocusChange(false)}
          placeholder={`Message ${recipientName}...`}
          className="w-full min-h-5 max-h-[120px] resize-none border-none bg-transparent text-xs leading-normal text-sidebar-foreground/70 outline-none placeholder:text-sidebar-foreground/30"
          rows={1}
        />
      </div>

      <button
        className={`rounded-full p-2 shrink-0 transition-colors ${
          draftText.trim()
            ? 'bg-primary/10 text-sidebar-foreground/70 hover:bg-primary/20'
            : 'bg-sidebar-foreground/[0.04] text-sidebar-foreground/20'
        }`}
        onClick={onSend}
        disabled={!draftText.trim()}
      >
        <IconArrowUp className="size-4" />
      </button>

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
    </div>
  )
}
