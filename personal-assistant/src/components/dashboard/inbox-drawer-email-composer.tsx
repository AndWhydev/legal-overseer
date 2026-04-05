// src/components/dashboard/inbox-drawer-email-composer.tsx
'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import { IconPaperclip, IconSend, IconBold, IconItalic, IconLink, IconList, IconX } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import type { ReplyMode } from './use-drawer-state'

interface EmailComposerProps {
  recipientName: string
  recipientEmail: string | null
  replyMode: ReplyMode
  draftText: string
  attachments: File[]
  ccRecipients: string[]
  bccRecipients: string[]
  isComposerFocused: boolean
  onDraftChange: (text: string) => void
  onAddAttachment: (file: File) => void
  onRemoveAttachment: (index: number) => void
  onCcChange: (recipients: string[]) => void
  onBccChange: (recipients: string[]) => void
  onFocusChange: (focused: boolean) => void
  onSend: () => void
}

export function EmailComposer({
  recipientName,
  recipientEmail,
  replyMode,
  draftText,
  attachments,
  ccRecipients,
  bccRecipients,
  isComposerFocused,
  onDraftChange,
  onAddAttachment,
  onRemoveAttachment,
  onCcChange,
  onBccChange,
  onFocusChange,
  onSend,
}: EmailComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showCc, setShowCc] = useState(ccRecipients.length > 0)
  const [showBcc, setShowBcc] = useState(bccRecipients.length > 0)

  // Expose focus method via ref
  useEffect(() => {
    if (replyMode !== 'none' && textareaRef.current && !isComposerFocused) {
      textareaRef.current.focus()
      onFocusChange(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replyMode])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      onSend()
    }
  }, [onSend])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      Array.from(files).forEach(f => onAddAttachment(f))
    }
    e.target.value = ''
  }, [onAddAttachment])

  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 300) + 'px'
  }, [])

  return (
    <div className="shrink-0 px-4 pb-2">
      {/* Collapsed state */}
      {!isComposerFocused && replyMode === 'none' ? (
        <div
          className="flex items-center gap-2 cursor-text"
          onClick={() => { onFocusChange(true); textareaRef.current?.focus() }}
        >
          <div className="flex-1 rounded-xl bg-sidebar-foreground/[0.04] px-3.5 py-2.5 text-base text-sidebar-foreground/30">
            Reply to {recipientName}...
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-sidebar-foreground/25"
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}
          >
            <IconPaperclip className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="bg-primary/10 text-sidebar-foreground/25"
            disabled
          >
            <IconSend className="size-4" />
          </Button>
        </div>
      ) : (
        /* Expanded state */
        <div className="flex flex-col gap-1.5">
          {/* To / CC / BCC row */}
          <div className="flex items-center gap-2 text-sm text-sidebar-foreground/35 px-1">
            <span>To: {recipientEmail || recipientName}</span>
            <span className="ml-auto flex gap-2">
              {!showCc && <button onClick={() => setShowCc(true)} className="hover:text-sidebar-foreground/60">CC</button>}
              {!showBcc && <button onClick={() => setShowBcc(true)} className="hover:text-sidebar-foreground/60">BCC</button>}
            </span>
          </div>

          {showCc && (
            <input
              className="rounded-lg bg-sidebar-foreground/[0.03] px-2.5 py-1.5 text-sm text-sidebar-foreground/60 outline-none placeholder:text-sidebar-foreground/25"
              placeholder="CC: email addresses..."
              value={ccRecipients.join(', ')}
              onChange={e => onCcChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            />
          )}

          {showBcc && (
            <input
              className="rounded-lg bg-sidebar-foreground/[0.03] px-2.5 py-1.5 text-sm text-sidebar-foreground/60 outline-none placeholder:text-sidebar-foreground/25"
              placeholder="BCC: email addresses..."
              value={bccRecipients.join(', ')}
              onChange={e => onBccChange(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            />
          )}

          {/* Formatting toolbar */}
          <div className="flex gap-0.5 px-0.5">
            {[
              { icon: IconBold, label: 'Bold' },
              { icon: IconItalic, label: 'Italic' },
              { icon: IconLink, label: 'Link' },
              { icon: IconList, label: 'List' },
            ].map(({ icon: Icon, label }) => (
              <button
                key={label}
                className="rounded-lg p-1 text-sidebar-foreground/25 hover:text-sidebar-foreground/50 hover:bg-sidebar-foreground/[0.04]"
                title={label}
              >
                <Icon className="size-4" />
              </button>
            ))}
            <button
              className="ml-auto rounded-lg p-1 text-sidebar-foreground/25 hover:text-sidebar-foreground/50"
              onClick={() => fileInputRef.current?.click()}
            >
              <IconPaperclip className="size-4" />
            </button>
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={draftText}
            onChange={e => { onDraftChange(e.target.value); autoResize(e.target) }}
            onKeyDown={handleKeyDown}
            onFocus={() => onFocusChange(true)}
            placeholder={`Reply to ${recipientName}...`}
            className="min-h-16 max-h-[300px] w-full resize-none rounded-lg bg-sidebar-foreground/[0.04] px-3 py-2.5 text-base leading-relaxed text-sidebar-foreground/70 outline-none placeholder:text-sidebar-foreground/25"
          />

          {/* Attachment chips */}
          {attachments.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              {attachments.map((file, i) => (
                <div key={i} className="flex items-center gap-1 rounded-lg bg-sidebar-foreground/[0.04] px-2 py-1 text-sm text-sidebar-foreground/45">
                  📎 {file.name}
                  <button onClick={() => onRemoveAttachment(i)} className="text-sidebar-foreground/25 hover:text-sidebar-foreground/60">
                    <IconX className="size-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Send row */}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="xs"
              className="bg-primary/10 text-sidebar-foreground/70 hover:bg-primary/20"
              onClick={onSend}
              disabled={!draftText.trim()}
            >
              <IconSend className="size-4" />
              Send
            </Button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
