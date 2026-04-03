// src/components/dashboard/inbox-drawer-identity.tsx
'use client'

import { IconX } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { resolveAvatarSync, resolveAvatar, type AvatarResult } from '@/lib/avatar/resolver'
import { useState, useEffect } from 'react'
import type { InboxMessage, ChannelFamily } from './use-drawer-state'

// Channel icon SVGs — inlined for zero-dependency rendering
function GmailIcon() {
  return <svg width={9} height={9} viewBox="0 0 24 24" fill="currentColor"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 010 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
}
function OutlookIcon() {
  return <svg width={9} height={9} viewBox="0 0 24 24" fill="currentColor"><path d="M24 7.387v10.478c0 .23-.08.424-.238.576a.806.806 0 01-.588.236h-8.108v-8.07l2.727 1.903.312.125a.39.39 0 00.32-.118l.61-.595a.39.39 0 00.124-.3.4.4 0 00-.164-.32L15.2 8.417h7.974c.234 0 .434.082.59.23.157.148.236.344.236.58v.16z"/></svg>
}
function WhatsAppIcon() {
  return <svg width={9} height={9} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>
}
function IMessageIcon() {
  return <svg width={9} height={9} viewBox="0 0 24 24" fill="currentColor"><path d="M11.916 0C5.335 0 0 4.434 0 9.904c0 3.098 1.746 5.862 4.479 7.63l-.727 2.905a.5.5 0 00.726.543l3.546-2.012c1.224.365 2.534.566 3.892.566 6.581 0 11.916-4.434 11.916-9.904-.004-5.466-5.339-9.632-11.916-9.632z"/></svg>
}
function SlackIcon() {
  return <svg width={9} height={9} viewBox="0 0 24 24" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313z"/></svg>
}

const CHANNEL_ICON: Record<string, React.FC> = {
  gmail: GmailIcon,
  outlook: OutlookIcon,
  whatsapp: WhatsAppIcon,
  imessage: IMessageIcon,
  slack: SlackIcon,
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

interface IdentityRowProps {
  message: InboxMessage
  channelFamily: ChannelFamily
  onClose: () => void
}

export function InboxDrawerIdentity({ message, channelFamily, onClose }: IdentityRowProps) {
  const senderDisplay = message.contactName || message.senderName || message.senderEmail || 'Unknown'
  const email = message.senderEmail ?? null
  const syncAvatar = resolveAvatarSync(senderDisplay, email)
  const [avatar, setAvatar] = useState<AvatarResult>(syncAvatar)

  useEffect(() => {
    if (!email && !senderDisplay) return
    let cancelled = false
    resolveAvatar(email, senderDisplay, null).then(r => { if (!cancelled) setAvatar(r) })
    return () => { cancelled = true }
  }, [email, senderDisplay])

  const ChannelIcon = CHANNEL_ICON[message.channelType]
  const subtitle = channelFamily === 'email'
    ? message.subject
    : message.senderEmail || message.senderName || null

  return (
    <div className="flex items-center gap-3 px-5 py-3.5 shrink-0">
      {/* Avatar with channel icon */}
      <div className="relative shrink-0">
        <Avatar size="default">
          {avatar?.url && <AvatarImage src={avatar.url} alt={senderDisplay} />}
          <AvatarFallback>{senderDisplay[0]?.toUpperCase() || '?'}</AvatarFallback>
        </Avatar>
        {ChannelIcon && (
          <div className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-sidebar text-sidebar-foreground/70">
            <ChannelIcon />
          </div>
        )}
      </div>

      {/* Name + subtitle */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-base truncate text-sidebar-foreground">
          {senderDisplay}
        </div>
        {subtitle && (
          <div className="text-xs text-sidebar-foreground/40 truncate mt-0.5">
            {subtitle}
          </div>
        )}
      </div>

      {/* Time + close */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs text-sidebar-foreground/25">
          {formatTimeAgo(message.receivedAt)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close drawer"
          className="text-sidebar-foreground/35 hover:text-sidebar-foreground/70"
        >
          <IconX className="size-4" />
        </Button>
      </div>
    </div>
  )
}
