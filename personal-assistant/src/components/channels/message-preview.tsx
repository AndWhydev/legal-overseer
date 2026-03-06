'use client'

import { Mail, MessageCircle, Calendar, Bell, Search, CheckSquare, CreditCard, CalendarClock, Send, BarChart3, Globe, Mic } from 'lucide-react'
import type { ChannelMessage, ChannelType } from '@/lib/channels/types'

const channelIcons: Record<ChannelType, React.ComponentType<{ className?: string }>> = {
  gmail: Mail,
  outlook: Mail,
  imessage: MessageCircle,
  calendar: Calendar,
  reminders: Bell,
  whatsapp: MessageCircle,
  asana: CheckSquare,
  calendly: CalendarClock,
  stripe: CreditCard,
  telegram: Send,
  gsc: Search,
  clickup: CheckSquare,
  ga4: BarChart3,
  wordpress: Globe,
  cluely: Mic,
  facebook: MessageCircle,
  slack: MessageCircle,
}

interface MessagePreviewProps {
  message: ChannelMessage
  classification?: 'actionable' | 'informational' | 'noise'
}

export function MessagePreview({ message, classification }: MessagePreviewProps) {
  const Icon = channelIcons[message.channel]

  return (
    <div className="glass-card rounded-lg p-3 transition-all duration-150 hover:border-primary/20">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{message.sender}</span>
            {classification && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${classification === 'actionable'
                  ? 'bg-primary/10 text-primary'
                  : classification === 'noise'
                    ? 'bg-secondary text-muted-foreground'
                    : 'bg-chart-2/10 text-chart-2'
                }`}>
                {classification}
              </span>
            )}
          </div>
          <p className="truncate text-xs font-medium text-foreground/80">{message.subject}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{message.body}</p>
        </div>
      </div>
    </div>
  )
}
