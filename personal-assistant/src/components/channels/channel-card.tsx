'use client'

import { useState } from 'react'
import {
  Mail,
  MessageCircle,
  CalendarDays,
  Bell,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const iconMap: Record<string, React.ElementType> = {
  Mail,
  MessageCircle,
  CalendarDays,
  Bell,
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

export interface ChannelCardProps {
  type: string
  name: string
  description: string
  icon: string
  status: 'connected' | 'disconnected' | 'syncing'
  lastSync?: string | null
  stats?: { messagesFound: number; tasksCreated: number; tasksUpdated: number }
  syncResult?: {
    messagesFound: number
    tasksCreated: number
    tasksUpdated: number
    errors: string[]
    duration: number
  }
  onSync: () => Promise<void>
}

export function ChannelCard({
  name,
  description,
  icon,
  status,
  lastSync,
  stats,
  syncResult,
  onSync,
}: ChannelCardProps) {
  const [syncing, setSyncing] = useState(false)
  const Icon = iconMap[icon] || Mail

  const isConnected = status === 'connected' || status === 'syncing'
  const isSyncing = status === 'syncing' || syncing

  async function handleSync() {
    if (isSyncing) return
    setSyncing(true)
    try {
      await onSync()
    } finally {
      setSyncing(false)
    }
  }

  const displayResult = syncResult || (stats ? {
    messagesFound: stats.messagesFound,
    tasksCreated: stats.tasksCreated,
    tasksUpdated: stats.tasksUpdated,
    errors: [],
    duration: 0,
  } : null)

  return (
    <div className={cn(
      'group rounded-xl border border-border bg-card p-5 transition-all duration-200',
      isConnected
        ? 'hover:border-[#D4A574]/30 hover:shadow-[0_0_20px_rgba(212,165,116,0.08)]'
        : 'opacity-60'
    )}>
      {/* Header: icon + name + status */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg transition-colors',
            isConnected ? 'bg-[#D4A574]/15 text-[#D4A574]' : 'bg-secondary text-muted-foreground'
          )}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{name}</h3>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-1.5">
          {isSyncing ? (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              <RefreshCw className="h-2.5 w-2.5 animate-spin" />
              Syncing
            </span>
          ) : isConnected ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <XCircle className="h-2.5 w-2.5" />
              Not configured
            </span>
          )}
        </div>
      </div>

      {/* Sync results */}
      {displayResult && displayResult.messagesFound > 0 && (
        <div className="mt-4 rounded-lg bg-secondary/50 p-3">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">{displayResult.messagesFound}</p>
              <p className="text-muted-foreground">Messages</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-[#4ADE80]">{displayResult.tasksCreated}</p>
              <p className="text-muted-foreground">Created</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-foreground">{displayResult.tasksUpdated}</p>
              <p className="text-muted-foreground">Updated</p>
            </div>
          </div>
          {displayResult.errors.length > 0 && (
            <div className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{displayResult.errors[0]}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer: last sync + sync button */}
      <div className="mt-4 flex items-center justify-between">
        {lastSync ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {relativeTime(lastSync)}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/50">Never synced</span>
        )}

        <button
          onClick={handleSync}
          disabled={isSyncing || !isConnected}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150',
            'bg-secondary text-foreground hover:bg-secondary/80 active:scale-[0.97]',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          <RefreshCw className={cn('h-3 w-3', isSyncing && 'animate-spin')} />
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>
    </div>
  )
}
