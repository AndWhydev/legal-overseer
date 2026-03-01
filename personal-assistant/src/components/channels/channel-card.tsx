'use client'

import { useState } from 'react'
import {
  Mail,
  MessageCircle,
  CalendarDays,
  Phone,
  CheckSquare,
  CalendarClock,
  CreditCard,
  RefreshCw,
  Clock,
  AlertTriangle,
  Unplug,
  Settings2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const iconMap: Record<string, React.ElementType> = {
  Mail,
  MessageCircle,
  CalendarDays,
  Phone,
  CheckSquare,
  CalendarClock,
  CreditCard,
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
  const Icon = iconMap[icon] || Mail

  const isConnected = status === 'connected' || status === 'syncing'
  const isError = status === 'error'
  const isSyncing = status === 'syncing'
  const isActive = isConnected || isError

  function handleCardClick(e: React.MouseEvent) {
    // Don't trigger card click if clicking a button
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
    <div
      onClick={handleCardClick}
      className={cn(
        'group rounded-xl border border-border bg-card p-5 transition-all duration-300',
        isActive && 'hover:border-[#D4A574]/30 hover:shadow-[0_0_20px_rgba(212,165,116,0.08)] cursor-pointer',
        !isActive && 'opacity-70',
        // Connected animation target
        isConnected && 'border-emerald-500/20',
      )}
    >
      {/* Header: icon + name + status */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg transition-colors duration-300',
              isActive ? 'text-white' : 'bg-secondary text-muted-foreground'
            )}
            style={isActive ? { backgroundColor: `${color}20`, color } : undefined}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{name}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5">
          {isSyncing ? (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              <RefreshCw className="h-2.5 w-2.5 animate-spin" />
              Syncing
            </span>
          ) : isError ? (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              <AlertTriangle className="h-2.5 w-2.5" />
              Needs attention
            </span>
          ) : isConnected ? (
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-[10px] font-medium text-emerald-400">Connected</span>
            </span>
          ) : (
            <span className="relative flex h-2 w-2">
              <span className="relative inline-flex h-2 w-2 rounded-full bg-muted-foreground/40" />
            </span>
          )}
        </div>
      </div>

      {/* Stats row for connected channels */}
      {isActive && (messageCount !== undefined && messageCount > 0) && (
        <div className="mt-3 flex items-center gap-4 rounded-lg bg-secondary/50 px-3 py-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="h-3 w-3" />
            <span className="font-medium text-foreground">{messageCount}</span> messages
          </div>
          {lastSync && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {relativeTime(lastSync)}
            </div>
          )}
        </div>
      )}

      {/* Footer: actions */}
      <div className="mt-4 flex items-center justify-between">
        {isActive ? (
          <>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
            >
              <Unplug className="h-3 w-3" />
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
            <div className="flex items-center gap-2">
              {onSync && (
                <button
                  onClick={(e) => { e.stopPropagation(); onSync(); }}
                  disabled={isSyncing}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150',
                    'bg-secondary text-foreground hover:bg-secondary/80 active:scale-[0.97]',
                    'disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                >
                  <RefreshCw className={cn('h-3 w-3', isSyncing && 'animate-spin')} />
                  Sync
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onCardClick?.(); }}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Settings2 className="h-3 w-3" />
                Config
              </button>
            </div>
          </>
        ) : (
          <>
            {lastSync ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {relativeTime(lastSync)}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground/50">Not connected</span>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onConnect(); }}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium transition-all duration-150',
                'bg-[#D4A574] text-background hover:bg-[#D4A574]/90 active:scale-[0.97]',
              )}
            >
              Connect
            </button>
          </>
        )}
      </div>
    </div>
  )
}
