'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChannelCard } from './channel-card'
import { SyncButton } from './sync-button'
import { SyncResults } from './sync-results'

interface ChannelStatus {
  type: string
  name: string
  description: string
  icon: string
  available: boolean
  lastSync: string | null
  messageCount: number
}

interface SyncResultItem {
  channel: string
  messagesFound: number
  tasksCreated: number
  tasksUpdated: number
  errors: string[]
  duration: number
}

interface Toast {
  id: string
  message: string
  type: 'success' | 'error'
}

function ChannelSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5 animate-pulse">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-secondary" />
          <div>
            <div className="h-4 w-20 rounded bg-secondary" />
            <div className="mt-1.5 h-3 w-32 rounded bg-secondary/60" />
          </div>
        </div>
        <div className="h-5 w-16 rounded-full bg-secondary" />
      </div>
      <div className="mt-4 h-20 rounded-lg bg-secondary/30" />
      <div className="mt-4 flex items-center justify-between">
        <div className="h-3 w-16 rounded bg-secondary/40" />
        <div className="h-7 w-20 rounded-lg bg-secondary" />
      </div>
    </div>
  )
}

function InlineToast({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className={`rounded-lg px-4 py-2 text-sm font-medium transition-all animate-in fade-in slide-in-from-top-2 ${
      toast.type === 'success'
        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
        : 'bg-destructive/10 text-destructive border border-destructive/20'
    }`}>
      {toast.message}
    </div>
  )
}

export function ChannelGrid() {
  const [channels, setChannels] = useState<ChannelStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncingChannels, setSyncingChannels] = useState<Set<string>>(new Set())
  const [syncResults, setSyncResults] = useState<SyncResultItem[] | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  useEffect(() => {
    fetch('/api/channels/status')
      .then(res => res.json())
      .then(data => {
        setChannels(data.channels || [])
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
        addToast('Failed to load channel status', 'error')
      })
  }, [addToast])

  async function handleSyncAll() {
    const available = channels.filter(c => c.available).map(c => c.type)
    if (available.length === 0) return

    setSyncing(true)
    setSyncResults(null)
    setSyncingChannels(new Set(available))

    try {
      const res = await fetch('/api/channels/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: available }),
      })
      const data = await res.json()

      if (data.success) {
        const results = data.results as SyncResultItem[]
        setSyncResults(results)
        const total = results.reduce((sum, r) => sum + r.tasksCreated, 0)
        addToast(`Synced ${available.length} channels — ${total} tasks created`, 'success')

        // Update lastSync times on channels
        setChannels(prev => prev.map(ch => {
          const result = results.find(r => r.channel === ch.type)
          if (result) {
            return { ...ch, lastSync: new Date().toISOString(), messageCount: result.messagesFound }
          }
          return ch
        }))
      } else {
        addToast(data.error || 'Sync failed', 'error')
      }
    } catch {
      addToast('Network error during sync', 'error')
    } finally {
      setSyncing(false)
      setSyncingChannels(new Set())
    }
  }

  async function handleSyncChannel(channelType: string) {
    setSyncingChannels(prev => new Set(prev).add(channelType))

    try {
      const res = await fetch('/api/channels/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: [channelType] }),
      })
      const data = await res.json()

      if (data.success && data.results?.length > 0) {
        const result = data.results[0] as SyncResultItem
        addToast(`${channelType}: ${result.messagesFound} messages, ${result.tasksCreated} tasks created`, 'success')

        // Update this channel's sync results and status
        setSyncResults(prev => {
          if (!prev) return [result]
          const existing = prev.filter(r => r.channel !== channelType)
          return [...existing, result]
        })

        setChannels(prev => prev.map(ch =>
          ch.type === channelType
            ? { ...ch, lastSync: new Date().toISOString(), messageCount: result.messagesFound }
            : ch
        ))
      } else {
        addToast(`Failed to sync ${channelType}`, 'error')
      }
    } catch {
      addToast(`Network error syncing ${channelType}`, 'error')
    } finally {
      setSyncingChannels(prev => {
        const next = new Set(prev)
        next.delete(channelType)
        return next
      })
    }
  }

  if (loading) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <div className="h-4 w-40 animate-pulse rounded bg-secondary" />
          <div className="h-9 w-36 animate-pulse rounded-lg bg-secondary" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <ChannelSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  const connectedCount = channels.filter(c => c.available).length

  return (
    <div>
      {/* Toasts */}
      {toasts.length > 0 && (
        <div className="fixed right-6 top-6 z-50 flex flex-col gap-2">
          {toasts.map(toast => (
            <InlineToast
              key={toast.id}
              toast={toast}
              onDismiss={() => removeToast(toast.id)}
            />
          ))}
        </div>
      )}

      {/* Header bar */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {connectedCount} of {channels.length} channels connected
        </p>
        <SyncButton onClick={handleSyncAll} syncing={syncing} />
      </div>

      {/* Sync results banner */}
      {syncResults && !syncing && (
        <div className="mb-6">
          <SyncResults
            results={syncResults}
            onDismiss={() => setSyncResults(null)}
            autoDismissMs={10000}
          />
        </div>
      )}

      {/* Channel cards grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {channels.map(channel => (
          <ChannelCard
            key={channel.type}
            type={channel.type}
            name={channel.name}
            description={channel.description}
            icon={channel.icon}
            status={
              syncingChannels.has(channel.type)
                ? 'syncing'
                : channel.available
                  ? 'connected'
                  : 'disconnected'
            }
            lastSync={channel.lastSync}
            syncResult={syncResults?.find(r => r.channel === channel.type)}
            onSync={() => handleSyncChannel(channel.type)}
          />
        ))}
      </div>
    </div>
  )
}
