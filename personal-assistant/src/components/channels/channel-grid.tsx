'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChannelCard, type ConnectFlow } from './channel-card'
import { ConnectModal, type ConnectModalMode } from './connect-modal'
import { ChannelConfigDrawer } from './channel-config-drawer'
import { SyncButton } from './sync-button'
import { SyncResults } from './sync-results'

/** Static definition of the 6 target channels */
const TARGET_CHANNELS: {
  type: string
  name: string
  description: string
  icon: string
  color: string
  connectFlow: ConnectFlow
}[] = [
  { type: 'gmail', name: 'Gmail', description: 'Triage, draft, and send emails automatically', icon: 'Mail', color: '#EA4335', connectFlow: 'oauth' },
  { type: 'outlook', name: 'Outlook', description: 'Read and send emails via Microsoft Outlook', icon: 'Mail', color: '#0078D4', connectFlow: 'oauth' },
  { type: 'whatsapp', name: 'WhatsApp', description: 'Business messaging via WhatsApp', icon: 'Phone', color: '#25D366', connectFlow: 'whatsapp_qr' },
  { type: 'asana', name: 'Asana', description: 'Sync tasks, projects, and workflows', icon: 'CheckSquare', color: '#F06A6A', connectFlow: 'oauth' },
  { type: 'calendly', name: 'Calendly', description: 'Manage scheduling and appointments', icon: 'CalendarClock', color: '#006BFF', connectFlow: 'oauth' },
  { type: 'stripe', name: 'Stripe', description: 'Monitor payments, invoices, and revenue', icon: 'CreditCard', color: '#635BFF', connectFlow: 'api_key' },
]

interface ChannelStatusData {
  type: string
  available: boolean
  status?: 'connected' | 'error'
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
      <div className="mt-4 h-10 rounded-lg bg-secondary/30" />
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
  const searchParams = useSearchParams()
  const [statusMap, setStatusMap] = useState<Record<string, ChannelStatusData>>({})
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncingChannels, setSyncingChannels] = useState<Set<string>>(new Set())
  const [syncResults, setSyncResults] = useState<SyncResultItem[] | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  // Connect modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ConnectModalMode>('api_key')
  const [modalChannel, setModalChannel] = useState('')
  const [modalChannelName, setModalChannelName] = useState('')

  // Config drawer state (wired in Task 2)
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev, { id, message, type }])
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/channels/status')
      const data = await res.json()
      const channels = (data.channels || []) as ChannelStatusData[]
      const map: Record<string, ChannelStatusData> = {}
      for (const ch of channels) {
        map[ch.type] = ch
      }
      setStatusMap(map)
    } catch {
      addToast('Failed to load channel status', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  // Initial load + handle query params from OAuth callback
  useEffect(() => {
    fetchStatus()

    const connected = searchParams.get('connected')
    const error = searchParams.get('error')
    if (connected) {
      addToast(`${connected} connected successfully!`, 'success')
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (error) {
      addToast(decodeURIComponent(error), 'error')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [fetchStatus, searchParams, addToast])

  /** Start OAuth flow in a popup window */
  function startOAuthPopup(channel: string) {
    // POST to connect endpoint to get OAuth redirect URL
    fetch('/api/channels/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.redirect && data.url) {
          const popup = window.open(data.url, `connect_${channel}`, 'width=600,height=700,scrollbars=yes')
          // Poll for popup close, then re-fetch status
          if (popup) {
            const pollTimer = setInterval(() => {
              if (popup.closed) {
                clearInterval(pollTimer)
                fetchStatus()
              }
            }, 500)
          }
        } else if (data.error) {
          addToast(data.error, 'error')
        }
      })
      .catch(() => {
        addToast(`Failed to start ${channel} connection`, 'error')
      })
  }

  function handleConnect(channelType: string, channelName: string, flow: ConnectFlow) {
    if (flow === 'oauth') {
      startOAuthPopup(channelType)
    } else if (flow === 'api_key') {
      setModalChannel(channelType)
      setModalChannelName(channelName)
      setModalMode('api_key')
      setModalOpen(true)
    } else if (flow === 'whatsapp_qr') {
      setModalChannel(channelType)
      setModalChannelName(channelName)
      setModalMode('whatsapp_qr')
      setModalOpen(true)
    }
  }

  async function handleDisconnect(channelType: string) {
    try {
      const res = await fetch('/api/channels/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelType }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        addToast(`${channelType} disconnected. Messages preserved.`, 'success')
        fetchStatus()
      } else {
        addToast(data.error || `Failed to disconnect ${channelType}`, 'error')
      }
    } catch {
      addToast(`Network error disconnecting ${channelType}`, 'error')
    }
  }

  function handleCardClick(channelType: string) {
    setSelectedChannel(channelType)
    setDrawerOpen(true)
  }

  async function handleSyncAll() {
    const connected = TARGET_CHANNELS.filter(c => statusMap[c.type]?.available).map(c => c.type)
    if (connected.length === 0) return

    setSyncing(true)
    setSyncResults(null)
    setSyncingChannels(new Set(connected))

    try {
      const res = await fetch('/api/channels/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channels: connected }),
      })
      const data = await res.json()

      if (data.success) {
        const results = data.results as SyncResultItem[]
        setSyncResults(results)
        const total = results.reduce((sum, r) => sum + r.tasksCreated, 0)
        addToast(`Synced ${connected.length} channels -- ${total} tasks created`, 'success')
        fetchStatus()
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
        setSyncResults(prev => {
          if (!prev) return [result]
          const existing = prev.filter(r => r.channel !== channelType)
          return [...existing, result]
        })
        fetchStatus()
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
          {Array.from({ length: 6 }).map((_, i) => (
            <ChannelSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  const connectedCount = TARGET_CHANNELS.filter(c => statusMap[c.type]?.available).length

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
          {connectedCount} of {TARGET_CHANNELS.length} channels connected
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

      {/* Channel cards grid -- always 6 cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TARGET_CHANNELS.map(channel => {
          const data = statusMap[channel.type]
          const isConnected = data?.available ?? false
          const hasError = data?.status === 'error'
          const isSyncing = syncingChannels.has(channel.type)

          let status: 'connected' | 'disconnected' | 'syncing' | 'error'
          if (isSyncing) status = 'syncing'
          else if (hasError) status = 'error'
          else if (isConnected) status = 'connected'
          else status = 'disconnected'

          return (
            <ChannelCard
              key={channel.type}
              type={channel.type}
              name={channel.name}
              description={channel.description}
              icon={channel.icon}
              color={channel.color}
              connectFlow={channel.connectFlow}
              status={status}
              lastSync={data?.lastSync ?? null}
              messageCount={data?.messageCount ?? 0}
              onConnect={() => handleConnect(channel.type, channel.name, channel.connectFlow)}
              onDisconnect={() => handleDisconnect(channel.type)}
              onCardClick={() => handleCardClick(channel.type)}
              onSync={() => handleSyncChannel(channel.type)}
            />
          )
        })}
      </div>

      {/* Connect modal for API key / WhatsApp QR */}
      <ConnectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode={modalMode}
        channel={modalChannel}
        channelName={modalChannelName}
        onSuccess={() => {
          addToast(`${modalChannelName} connected successfully!`, 'success')
          fetchStatus()
        }}
        onError={(msg) => addToast(msg, 'error')}
      />

      {/* Channel config drawer */}
      <ChannelConfigDrawer
        channel={selectedChannel}
        isOpen={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedChannel(null); }}
        onDisconnect={(ch) => handleDisconnect(ch)}
        onToast={addToast}
      />
    </div>
  )
}
