// src/components/dashboard/inbox-drawer-email-thread.tsx
'use client'

import { useState } from 'react'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { ThreadMessageItem, AttachmentItem } from './use-drawer-state'

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

const ATTACHMENT_ICONS: Record<AttachmentItem['type'], string> = {
  pdf: '📄',
  image: '🖼',
  document: '📝',
  other: '📎',
}

function AttachmentChip({ attachment }: { attachment: AttachmentItem }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-sidebar-foreground/[0.03] px-2.5 py-1.5">
      <span>{ATTACHMENT_ICONS[attachment.type]}</span>
      <span className="text-sm text-sidebar-foreground/45">{attachment.name}</span>
      <span className="text-sm text-sidebar-foreground/20">{attachment.size}</span>
    </div>
  )
}

interface EmailThreadProps {
  messages: ThreadMessageItem[]
}

export function EmailThreadView({ messages }: EmailThreadProps) {
  const latestId = messages[messages.length - 1]?.id
  const [expanded, setExpanded] = useState<Set<string>>(new Set(latestId ? [latestId] : []))

  if (!messages.length) {
    return <p className="text-sm text-sidebar-foreground/30 italic px-5">No messages</p>
  }

  const toggle = (id: string) => {
    setExpanded(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id); else s.add(id)
      return s
    })
  }

  return (
    <div className="flex flex-col gap-1 px-5 py-3">
      {messages.length > 1 && (
        <span className="text-sm uppercase tracking-widest text-sidebar-foreground/25 mb-1">
          {messages.length} messages
        </span>
      )}

      {messages.map(msg => {
        const isLatest = msg.id === latestId
        const isOpen = expanded.has(msg.id)
        const name = msg.isSelf ? 'You' : (msg.senderName || 'Unknown')

        return (
          <div
            key={msg.id}
            className="rounded-lg bg-sidebar-foreground/[0.02]"
          >
            {/* Header row — always visible */}
            <div
              className={`flex items-center gap-2 px-2.5 py-2 ${isLatest ? '' : 'cursor-pointer'} select-none`}
              onClick={() => !isLatest && toggle(msg.id)}
            >
              <Avatar size="sm">
                <AvatarFallback className={msg.isSelf ? 'bg-primary/20 text-primary text-sm' : 'text-sm'}>
                  {name[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>

              <span className="text-sm font-medium text-sidebar-foreground/60 shrink-0">
                {name}
              </span>

              {!isOpen && (
                <span className="text-sm text-sidebar-foreground/25 flex-1 truncate">
                  {msg.bodyPreview.slice(0, 70)}
                </span>
              )}

              <span className="text-sm text-sidebar-foreground/20 shrink-0 ml-auto">
                {formatTimeAgo(msg.receivedAt)}
              </span>

              {!isLatest && (
                <span className="text-sidebar-foreground/20 shrink-0">
                  {isOpen ? <IconChevronDown className="size-4" /> : <IconChevronRight className="size-4" />}
                </span>
              )}
            </div>

            {/* Body — expanded */}
            {isOpen && (
              <div className="px-2.5 pb-3 pl-9">
                <div className="text-sm text-sidebar-foreground/50 leading-relaxed whitespace-pre-wrap break-words">
                  {msg.bodyPreview}
                </div>

                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex gap-1.5 mt-2.5 flex-wrap">
                    {msg.attachments.map((a, i) => (
                      <AttachmentChip key={i} attachment={a} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
