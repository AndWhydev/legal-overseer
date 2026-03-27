'use client'

import { useState } from 'react'
import {
  IconMail,
  IconMessageCircle,
  IconCalendarEvent,
  IconPhone,
  IconCheckbox,
  IconCalendarTime,
  IconCreditCard,
  IconRefresh,
  IconClock,
  IconAlertTriangle,
  IconPlugOff,
  IconSettings,
} from '@tabler/icons-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const iconMap: Record<string, React.ElementType> = {
  Mail: IconMail,
  MessageCircle: IconMessageCircle,
  CalendarDays: IconCalendarEvent,
  Phone: IconPhone,
  CheckSquare: IconCheckbox,
  CalendarClock: IconCalendarTime,
  CreditCard: IconCreditCard,
}

/** Channel connection type determines how the Connect flow works */
export type ConnectFlow = 'oauth' | 'api_key' | 'whatsapp_qr'

export interface ChannelCardProps {
  type: string
  name: string
  description: string
  icon: string
  color: string
  connectFlow: ConnectFlow
  status: 'connected' | 'disconnected' | 'syncing' | 'error'
  lastSync?: string | null
  messageCount?: number
  onConnect: () => void
  onDisconnect: () => void
  onCardClick?: () => void
  onSync?: () => void
}

function relativeTime(date: string | Date): string {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diff = now - then
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function ChannelCard({
  type,
  name,
  description,
  icon,
  color,
  status,
  lastSync,
  messageCount,
  onConnect,
  onDisconnect,
  onCardClick,
  onSync,
}: ChannelCardProps) {
  const [disconnecting, setDisconnecting] = useState(false)
  const Icon = iconMap[icon] || IconMail

  const isConnected = status === 'connected' || status === 'syncing'
  const isError = status === 'error'
  const isSyncing = status === 'syncing'
  const isActive = isConnected || isError

  function handleCardClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    if (isActive && onCardClick) {
      onCardClick()
    }
  }

  async function handleDisconnect(e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm(`Disconnect ${name}? Your synced messages will be preserved.`)) return
    setDisconnecting(true)
    try {
      onDisconnect()
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <Card
      onClick={handleCardClick}
      className={cn(
        'transition-all duration-300',
        isActive && 'cursor-pointer',
        !isActive && 'opacity-70',
        isConnected && 'border-emerald-500/20',
      )}
    >
      <CardContent className="flex flex-col gap-4 p-5">
        {/* Header: icon + name + status */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex size-10 items-center justify-center rounded-lg',
                isActive ? 'text-white' : 'bg-secondary text-muted-foreground'
              )}
              style={isActive ? { backgroundColor: `${color}20`, color } : undefined}
            >
              <Icon className="size-5" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">{name}</h3>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>

          {/* Status indicator */}
          <div className="flex items-center gap-1.5">
            {isSyncing ? (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500">
                <IconRefresh className="mr-1 size-2.5 animate-spin" />
                Syncing
              </Badge>
            ) : isError ? (
              <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-500">
                <IconAlertTriangle className="mr-1 size-2.5" />
                Needs attention
              </Badge>
            ) : isConnected ? (
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                <span className="relative mr-1.5 flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                Connected
              </Badge>
            ) : (
              <span className="relative flex size-2">
                <span className="relative inline-flex size-2 rounded-full bg-muted-foreground/40" />
              </span>
            )}
          </div>
        </div>

        {/* Stats row for connected channels */}
        {isActive && (messageCount !== undefined && messageCount > 0) && (
          <div className="flex items-center gap-4 rounded-lg bg-secondary/50 px-3 py-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconMail className="size-3" />
              <span className="font-medium text-foreground">{messageCount}</span> messages
            </div>
            {lastSync && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <IconClock className="size-3" />
                {relativeTime(lastSync)}
              </div>
            )}
          </div>
        )}

        {/* Footer: actions */}
        <div className="flex items-center justify-between">
          {isActive ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
              >
                <IconPlugOff className="size-3" />
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </Button>
              <div className="flex items-center gap-2">
                {onSync && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={(e) => { e.stopPropagation(); onSync() }}
                    disabled={isSyncing}
                  >
                    <IconRefresh className={cn('size-3', isSyncing && 'animate-spin')} />
                    Sync
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 text-xs"
                  onClick={(e) => { e.stopPropagation(); onCardClick?.() }}
                >
                  <IconSettings className="size-3" />
                  Config
                </Button>
              </div>
            </>
          ) : (
            <>
              {lastSync ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <IconClock className="size-3" />
                  {relativeTime(lastSync)}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground/50">Not connected</span>
              )}
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={(e) => { e.stopPropagation(); onConnect() }}
              >
                Connect
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
