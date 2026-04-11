'use client'

import {
  IconMail, IconMessage, IconCalendar, IconBell, IconSearch, IconCheckbox,
  IconCreditCard, IconCalendarTime, IconSend, IconChartBar, IconWorld, IconMicrophone,
} from '@tabler/icons-react'
import type { ChannelMessage, ChannelType } from '@/lib/channels/types'

const channelIcons: Record<ChannelType, React.ComponentType<{ className?: string }>> = {
  gmail: IconMail,
  outlook: IconMail,
  imessage: IconMessage,
  calendar: IconCalendar,
  reminders: IconBell,
  whatsapp: IconMessage,
  asana: IconCheckbox,
  calendly: IconCalendarTime,
  stripe: IconCreditCard,
  telegram: IconSend,
  gsc: IconSearch,
  clickup: IconCheckbox,
  ga4: IconChartBar,
  wordpress: IconWorld,
  cluely: IconMicrophone,
  facebook: IconMessage,
  slack: IconMessage,
  xero: IconChartBar,
  instagram: IconMessage,
  sms: IconMessage,
  sendblue: IconMessage,
}

interface MessagePreviewProps {
  message: ChannelMessage
  classification?: 'actionable' | 'informational' | 'noise'
}

export function MessagePreview({ message, classification }: MessagePreviewProps) {
  const Icon = channelIcons[message.channel]

  return (
    <div className="surface-card rounded-lg p-3 transition-all duration-150 hover:border-primary/20">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{message.sender}</span>
            {classification && (
              <span className={`rounded-full px-1.5 py-0.5 text-sm font-medium ${classification === 'actionable'
                  ? 'bg-primary/10 text-primary'
                  : classification === 'noise'
                    ? 'bg-secondary text-muted-foreground'
                    : 'bg-chart-2/10 text-chart-2'
                }`}>
                {classification}
              </span>
            )}
          </div>
          <p className="truncate text-sm font-medium text-foreground">{message.subject}</p>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{message.body}</p>
        </div>
      </div>
    </div>
  )
}
