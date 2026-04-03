// src/components/dashboard/inbox-drawer-chat-thread.tsx
'use client'

import type { ThreadMessageItem, AttachmentItem } from './use-drawer-state'

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
}

interface ChatThreadProps {
  messages: ThreadMessageItem[]
  channelType: string
}

export function ChatThreadView({ messages, channelType }: ChatThreadProps) {
  if (!messages.length) {
    return <p className="text-sm text-sidebar-foreground/30 italic px-5">No messages</p>
  }

  return (
    <div className="flex flex-col gap-1.5 px-4 py-3">
      {messages.map(msg => {
        const isSelf = msg.isSelf ?? false
        const hasMedia = msg.attachments && msg.attachments.length > 0

        return (
          <div
            key={msg.id}
            className={`flex max-w-[85%] ${isSelf ? 'self-end' : 'self-start'}`}
          >
            <div>
              {/* Media attachments */}
              {hasMedia && msg.attachments!.filter((a: AttachmentItem) => a.type === 'image').map((a: AttachmentItem, i: number) => (
                <div
                  key={i}
                  className={`mb-1 rounded-xl overflow-hidden ${isSelf ? 'rounded-br-sm' : 'rounded-bl-sm'} bg-sidebar-foreground/[0.05]`}
                >
                  <div className="w-44 h-24 bg-sidebar-foreground/[0.06] flex items-center justify-center text-lg">
                    🖼
                  </div>
                  <div className="px-2.5 py-1.5 text-[10px] text-sidebar-foreground/40">
                    {a.name}
                  </div>
                </div>
              ))}

              {/* Text bubble */}
              {msg.bodyPreview && (
                <div
                  className={`px-3 py-2 text-xs leading-relaxed ${
                    isSelf
                      ? `bg-primary/10 text-sidebar-foreground/80 rounded-xl rounded-br-sm`
                      : 'bg-sidebar-foreground/[0.06] text-sidebar-foreground/65 rounded-xl rounded-bl-sm'
                  }`}
                >
                  {msg.bodyPreview}
                  <div className={`text-[9px] mt-1 text-right ${
                    isSelf ? 'text-sidebar-foreground/30' : 'text-sidebar-foreground/20'
                  }`}>
                    {formatTime(msg.receivedAt)}
                  </div>
                </div>
              )}

              {/* Non-image attachments */}
              {hasMedia && msg.attachments!.filter((a: AttachmentItem) => a.type !== 'image').map((a: AttachmentItem, i: number) => (
                <div key={i} className="mt-1 flex items-center gap-1.5 rounded-lg bg-sidebar-foreground/[0.03] px-2.5 py-1.5 text-[10px] text-sidebar-foreground/40">
                  📎 {a.name} · {a.size}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
