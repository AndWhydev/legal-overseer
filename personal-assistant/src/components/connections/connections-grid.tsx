'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { ConnectModal, type ConnectModalMode } from '@/components/channels/connect-modal'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { IconAlertCircle } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { logger } from '@/lib/core/logger'

/* App Store artwork URLs — 512px originals, sized down via query param. */
const APP_ICONS: Record<string, string> = {
  gmail: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/95/1f/0a/951f0a84-ae7e-ca5a-49da-cd8b0611a963/logo_gmail_2020q4_color-0-1x_U007emarketing-0-0-0-7-0-0-0-0-85-220-0.png/120x120bb.jpg',
  outlook: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/07/35/55/07355553-d782-158a-12f2-daa122973b2b/AppIcon-outlook.prod-0-0-1x_U007epad-0-1-0-0-85-220.png/120x120bb.jpg',
  'google-calendar': 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/fd/3b/8a/fd3b8acf-96ad-ada9-87b8-0f40ae53ff94/calendar_2020q4-0-1x_U007epad-0-0-0-1-0-0-0-0-85-220-0.png/120x120bb.jpg',
  asana: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/28/97/be/2897be07-8327-56b0-e340-a7ed06da717b/AppIcon-0-0-1x_U007epad-0-1-85-220.png/120x120bb.jpg',
  calendly: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/b4/80/d1/b480d1f5-f014-15f9-860e-e495ce8570b2/AppIcon-0-0-1x_U007ephone-0-1-85-220.png/120x120bb.jpg',
  stripe: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/b8/56/ec/b856eca9-4ed0-513b-0fd3-8f48958db087/AppIcon-0-0-1x_U007ephone-0-1-0-85-220-0.png/120x120bb.jpg',
  whatsapp: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/88/f4/0d/88f40df9-9a8c-235f-dc2c-48c3bd5b4345/AppIcon-0-0-1x_U007epad-0-0-0-1-0-0-sRGB-0-85-220.png/120x120bb.jpg',
  'facebook-messenger': 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/31/a6/5c/31a65c68-60ab-bb92-f38b-a6e0b955f0cb/AppIcon-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/120x120bb.jpg',
  instagram: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/44/e7/3e/44e73e4c-1819-1c3b-6032-8398e74507e5/Prod-0-0-1x_U007epad-0-1-0-sRGB-85-220.png/120x120bb.jpg',
  slack: 'https://is1-ssl.mzstatic.com/image/thumb/Purple211/v4/43/1b/06/431b06ff-3c7a-6506-26c2-ef44089c9339/slack_icon_prod-0-0-1x_U007epad-0-1-sRGB-85-220.png/120x120bb.jpg',
  xero: 'https://is1-ssl.mzstatic.com/image/thumb/Purple221/v4/a3/87/98/a3879862-1b54-a12b-5acc-f7184579d615/AppIcon-0-0-1x_U007epad-0-0-0-1-0-0-85-220.png/120x120bb.jpg',
}

function AppIcon({ id, size = 40 }: { id: string; size?: number }) {
  const src = APP_ICONS[id]
  if (!src) return null

  /* iOS icon radius ≈ 22.37% of size */
  const radius = Math.round(size * 0.2237)

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0"
      style={{ borderRadius: radius, width: size, height: size }}
    />
  )
}

interface Connection {
  id: string
  name: string
  description: string
  category: 'communication' | 'productivity' | 'finance'
  auth: 'oauth' | 'api_key' | 'whatsapp_qr'
  comingSoon?: boolean
  featured?: boolean
}

const CONNECTIONS: Connection[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Inbox and drafts',
    category: 'communication',
    auth: 'oauth',
    featured: true,
  },
  {
    id: 'outlook',
    name: 'Outlook',
    description: 'Mail and calendars',
    category: 'communication',
    auth: 'oauth',
    featured: true,
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Meetings and events',
    category: 'productivity',
    auth: 'oauth',
  },
  {
    id: 'asana',
    name: 'Asana',
    description: 'Tasks and projects',
    category: 'productivity',
    auth: 'oauth',
  },
  {
    id: 'calendly',
    name: 'Calendly',
    description: 'Bookings and availability',
    category: 'productivity',
    auth: 'oauth',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Payments and billing',
    category: 'finance',
    auth: 'api_key',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Mobile conversations',
    category: 'communication',
    auth: 'whatsapp_qr',
  },
  {
    id: 'facebook-messenger',
    name: 'Messenger',
    description: 'Meta conversations',
    category: 'communication',
    auth: 'oauth',
    comingSoon: true,
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Messages and mentions',
    category: 'communication',
    auth: 'oauth',
    comingSoon: true,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Team conversations',
    category: 'communication',
    auth: 'oauth',
    comingSoon: true,
  },
  {
    id: 'xero',
    name: 'Xero',
    description: 'Accounting and invoices',
    category: 'finance',
    auth: 'oauth',
    comingSoon: true,
  },
]

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'communication', label: 'Comms' },
  { id: 'productivity', label: 'Work' },
  { id: 'finance', label: 'Finance' },
] as const

interface ConnectionStatus {
  connected: boolean
  connectedAt?: string
}

interface ChannelStatusResponse {
  type: string
  connected: boolean
  connectedAt?: string | null
}

const CONNECTION_STATUS_ALIASES: Record<string, string> = {
  calendar: 'google-calendar',
  'google-calendar': 'google-calendar',
}

type ConnectionCallbackPayload =
  | { type: 'bb-connection-callback'; kind: 'success'; provider?: string }
  | { type: 'bb-connection-callback'; kind: 'error'; error?: string }
  | { type: 'popup_closed'; provider: string }

export function getConnectionDisplayName(id: string) {
  return CONNECTIONS.find((connection) => connection.id === id)?.name ?? id
}

function buildDisconnectedStatuses(): Record<string, ConnectionStatus> {
  return CONNECTIONS.reduce<Record<string, ConnectionStatus>>((all, connection) => {
    all[connection.id] = { connected: false }
    return all
  }, {})
}

export function normalizeConnectionStatuses(
  channels: ChannelStatusResponse[],
): Record<string, ConnectionStatus> {
  const normalized: Record<string, ConnectionStatus> = {}

  for (const channel of channels) {
    const id = CONNECTION_STATUS_ALIASES[channel.type] ?? channel.type
    normalized[id] = {
      connected: channel.connected,
      ...(channel.connectedAt ? { connectedAt: channel.connectedAt } : {}),
    }
  }

  return normalized
}

function mergeConnectionStatuses(channels: ChannelStatusResponse[]) {
  return {
    ...buildDisconnectedStatuses(),
    ...normalizeConnectionStatuses(channels),
  }
}

function getConnectedIds(statuses: Record<string, ConnectionStatus>) {
  return Object.entries(statuses)
    .filter(([, status]) => status.connected)
    .map(([id]) => id)
}

export function reconcileLoadingConnection(
  loadingId: string | null,
  statuses: Record<string, ConnectionStatus>,
): string | null {
  if (!loadingId) return null
  return statuses[loadingId]?.connected ? null : loadingId
}

export function reconcileLoadingAfterOAuthEvent(
  loadingId: string | null,
  event: ConnectionCallbackPayload,
): string | null {
  if (!loadingId) return null

  if (event.type === 'popup_closed') {
    return event.provider === loadingId ? null : loadingId
  }

  if (event.kind === 'error') {
    return null
  }

  if (!event.provider || event.provider === loadingId) {
    return null
  }

  return loadingId
}

interface ConnectionCardProps {
  connection: Connection
  status: ConnectionStatus
  isLoading: boolean
  variant: 'dashboard' | 'onboarding'
  onConnect: (id: string) => void
  onDisconnect: (id: string) => void
}

const BTN_BASE = 'inline-flex min-w-[5.5rem] items-center justify-center rounded-[10px] px-4 py-2 text-base font-medium transition'
const BTN_COMPACT = 'inline-flex min-w-[5rem] items-center justify-center rounded-[10px] px-3.5 py-2 text-base font-medium transition'

function ConnectionCard({
  connection,
  status,
  isLoading,
  variant,
  onConnect,
  onDisconnect,
}: ConnectionCardProps) {
  if (variant === 'onboarding') {
    return (
      <article className="flex items-center gap-3.5 rounded-[10px] border border-black/[0.06] bg-white/76 px-5 py-4 shadow-sm transition duration-200 hover:shadow-md">
        <AppIcon id={connection.id} size={40} />
        <span className="flex-1 text-base font-medium text-foreground">{connection.name}</span>
        {connection.comingSoon ? (
          <span className={`${BTN_COMPACT} shrink-0 border border-black/[0.06] bg-muted text-muted-foreground`}>Soon</span>
        ) : status.connected ? (
          <button
            type="button"
            onClick={() => onDisconnect(connection.id)}
            disabled={isLoading}
            className={`${BTN_COMPACT} shrink-0 border border-success bg-success/10 text-success hover:bg-success/15 disabled:opacity-50`}
          >
            {isLoading ? 'Removing\u2026' : 'Connected'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onConnect(connection.id)}
            disabled={isLoading}
            className={`${BTN_COMPACT} shrink-0 bg-foreground text-white hover:bg-foreground/90 disabled:opacity-50`}
          >
            {isLoading ? 'Connecting\u2026' : 'Connect'}
          </button>
        )}
      </article>
    )
  }

  return (
    <article className="flex flex-col gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition duration-300 hover:translate-y-[-1px] hover:shadow-md">
      <div className="flex items-center gap-3">
        <AppIcon id={connection.id} size={40} />
        <div className="min-w-0">
          <h3 className="text-base font-medium leading-tight text-foreground">{connection.name}</h3>
          <p className="mt-0.5 text-base leading-tight text-muted-foreground">{connection.description}</p>
        </div>
      </div>

      <div className="flex items-center justify-end">
        {connection.comingSoon ? (
          <span className={`${BTN_BASE} border border-black/[0.06] bg-muted text-muted-foreground`}>
            Soon
          </span>
        ) : status.connected ? (
          <button
            type="button"
            onClick={() => onDisconnect(connection.id)}
            disabled={isLoading}
            className={`${BTN_BASE} border border-success bg-success/10 text-success hover:bg-success/15 disabled:opacity-50`}
          >
            {isLoading ? 'Removing\u2026' : 'Connected'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onConnect(connection.id)}
            disabled={isLoading}
            className={`${BTN_BASE} bg-foreground text-white hover:translate-y-[-1px] hover:bg-foreground/90 disabled:opacity-50`}
          >
            {isLoading ? 'Connecting\u2026' : 'Connect'}
          </button>
        )}
      </div>
    </article>
  )
}

interface ConnectionsGridProps {
  onConnectionStateChange?: (hasConnection: boolean) => void
  onConnectedIdsChange?: (connectedIds: string[]) => void
  variant?: 'dashboard' | 'onboarding'
  showHeader?: boolean
  showCategoryTabs?: boolean
}

export function ConnectionsGrid({
  onConnectionStateChange,
  onConnectedIdsChange,
  variant = 'dashboard',
  showHeader = true,
  showCategoryTabs = true,
}: ConnectionsGridProps) {
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [statuses, setStatuses] = useState<Record<string, ConnectionStatus>>(buildDisconnectedStatuses)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ConnectModalMode>('api_key')
  const [modalChannelId, setModalChannelId] = useState('')
  const [modalChannelName, setModalChannelName] = useState('')
  const handledCallbackRef = useRef<string | null>(null)

  const filteredConnections = useMemo(() => {
    const base = activeCategory === 'all'
      ? CONNECTIONS
      : CONNECTIONS.filter((connection) => connection.category === activeCategory)

    if (variant !== 'onboarding') {
      return base
    }

    return [...base].sort((left, right) => Number(Boolean(right.featured)) - Number(Boolean(left.featured)))
  }, [activeCategory, variant])

  const fetchStatuses = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch('/api/channels/status')
      if (!response.ok) throw new Error('Failed to fetch status')

      const data = (await response.json()) as { channels?: ChannelStatusResponse[] }
      const nextStatuses = mergeConnectionStatuses(data.channels ?? [])
      const connectedIds = getConnectedIds(nextStatuses)

      setStatuses(nextStatuses)
      setLoadingId((current) => reconcileLoadingConnection(current, nextStatuses))
      onConnectionStateChange?.(connectedIds.length > 0)
      onConnectedIdsChange?.(connectedIds)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Error fetching connection statuses', { error: message })
      toast('error', 'Could not load connections')
      setError('Could not load connections right now')
      setStatuses(buildDisconnectedStatuses())
      onConnectionStateChange?.(false)
      onConnectedIdsChange?.([])
    }
  }, [onConnectedIdsChange, onConnectionStateChange, toast])

  useEffect(() => {
    void fetchStatuses()
  }, [fetchStatuses])

  useEffect(() => {
    const handleFocus = () => {
      void fetchStatuses()
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchStatuses])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return

      const payload = event.data as
        | { type?: string; kind?: 'success' | 'error'; provider?: string; error?: string }
        | undefined

      if (payload?.type !== 'bb-connection-callback') return

      if (payload.kind === 'success' && payload.provider) {
        toast('success', `${payload.provider} connected`)
      }

      if (payload.kind === 'error' && payload.error) {
        toast('error', payload.error)
      }

      setLoadingId((current) => reconcileLoadingAfterOAuthEvent(
        current,
        payload as ConnectionCallbackPayload,
      ))
      void fetchStatuses()
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [fetchStatuses, toast])

  useEffect(() => {
    const connected = searchParams.get('connected')
    const callbackError = searchParams.get('error')

    if (!connected && !callbackError) return

    const callbackKey = `${connected ?? ''}:${callbackError ?? ''}`
    if (handledCallbackRef.current === callbackKey) return
    handledCallbackRef.current = callbackKey

    if (connected) {
      toast('success', `${connected} connected`)
    }

    if (callbackError) {
      toast('error', callbackError)
    }

    const callbackMessage = connected
      ? { type: 'bb-connection-callback' as const, kind: 'success' as const, provider: connected }
      : { type: 'bb-connection-callback' as const, kind: 'error' as const, error: callbackError ?? 'Connection failed' }

    setLoadingId((current) => reconcileLoadingAfterOAuthEvent(current, callbackMessage))
    void fetchStatuses()

    if (window.opener && window.opener !== window) {
      try {
        window.opener.postMessage(callbackMessage, window.location.origin)
      } catch {
        // best effort only
      }

      window.setTimeout(() => {
        window.close()
      }, 150)
      return
    }

    window.history.replaceState({}, '', window.location.pathname)
  }, [fetchStatuses, searchParams, toast])

  const handleConnect = useCallback(async (id: string) => {
    const connection = CONNECTIONS.find((candidate) => candidate.id === id)
    if (!connection) return

    try {
      setLoadingId(id)

      if (connection.auth === 'oauth') {
        const response = await fetch('/api/channels/connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: id }),
        })

        if (!response.ok) throw new Error('Failed to initiate OAuth')

        const data = (await response.json()) as {
          redirect?: boolean
          url?: string
          error?: string
        }

        if (!data.redirect || !data.url) {
          throw new Error(data.error || 'Missing OAuth redirect URL')
        }

        const popup = window.open(
          data.url,
          `connect_${id}`,
          'width=600,height=720,scrollbars=yes',
        )

        if (!popup) {
          window.location.assign(data.url)
          return
        }

        const pollTimer = window.setInterval(() => {
          if (!popup.closed) return
          window.clearInterval(pollTimer)
          setLoadingId((current) => reconcileLoadingAfterOAuthEvent(current, {
            type: 'popup_closed',
            provider: id,
          }))
          void fetchStatuses()
        }, 500)
        return
      }

      if (connection.auth === 'api_key' || connection.auth === 'whatsapp_qr') {
        setModalChannelId(connection.id)
        setModalChannelName(connection.name)
        setModalMode(connection.auth === 'whatsapp_qr' ? 'whatsapp_qr' : 'api_key')
        setModalOpen(true)
        setLoadingId(null)
        return
      }

      logger.info(`Opening API key dialog for ${id}`)
      toast('info', `${connection.name} key setup is next`)
      setLoadingId(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`Error connecting ${id}`, { error: message })
      toast('error', `Could not connect ${connection.name}`)
      setLoadingId(null)
    }
  }, [fetchStatuses, toast])

  const handleDisconnect = useCallback(async (id: string) => {
    const connection = CONNECTIONS.find((candidate) => candidate.id === id)

    try {
      setLoadingId(id)

      const response = await fetch('/api/channels/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: id }),
      })

      if (!response.ok) throw new Error('Failed to disconnect')

      await fetchStatuses()
      toast('success', `${connection?.name || id} disconnected`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`Error disconnecting ${id}`, { error: message })
      toast('error', `Could not disconnect ${connection?.name || id}`)
    } finally {
      setLoadingId(null)
    }
  }, [fetchStatuses, toast])

  const containerClassName = variant === 'onboarding'
    ? 'grid gap-3'
    : 'grid gap-6'

  const gridClassName = variant === 'onboarding'
    ? 'grid gap-3 sm:grid-cols-2'
    : 'grid gap-4 md:grid-cols-2 xl:grid-cols-3'

  return (
    <section className={containerClassName}>
      {error ? (
        <Empty>
          <EmptyMedia variant="icon"><IconAlertCircle size={20} /></EmptyMedia>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => { setError(null); void fetchStatuses(); }}>Retry</Button>
          </EmptyContent>
        </Empty>
      ) : null}

      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-medium tracking-[-0.02em] text-foreground">
            Connections
          </h2>
          <div className="rounded-lg bg-accent/10 px-3 py-1 text-base font-medium text-accent">
            {getConnectedIds(statuses).length} connected
          </div>
        </div>
      ) : null}

      {showCategoryTabs ? (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Connection categories">
          {CATEGORIES.map((category) => {
            const active = activeCategory === category.id
            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveCategory(category.id)}
                className={`rounded-lg px-4 py-2 text-base font-medium uppercase tracking-[0.16em] transition ${
                  active
                    ? 'bg-foreground text-white'
                    : 'border border-black/[0.06] bg-white/72 text-muted-foreground hover:text-foreground'
                }`}
              >
                {category.label}
              </button>
            )
          })}
        </div>
      ) : null}

      <div className={gridClassName}>
        {filteredConnections.map((connection) => (
          <ConnectionCard
            key={connection.id}
            connection={connection}
            status={statuses[connection.id] || { connected: false }}
            variant={variant}
            isLoading={loadingId === connection.id}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        ))}
      </div>

      <ConnectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode={modalMode}
        channel={modalChannelId}
        channelName={modalChannelName}
        onSuccess={() => {
          void fetchStatuses()
          toast('success', `${modalChannelName} connected`)
        }}
        onError={(message) => {
          toast('error', message)
        }}
      />

      {filteredConnections.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No connections configured</EmptyTitle>
            <EmptyDescription>Connect your services to let BitBit start working for you</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </section>
  )
}
