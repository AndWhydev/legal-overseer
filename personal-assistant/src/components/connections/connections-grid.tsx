'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { ConnectModal, type ConnectModalMode } from '@/components/channels/connect-modal'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@/components/ui/empty'
import { IconAlertCircle, IconSearch } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { logger } from '@/lib/core/logger'
import { useConnectionCatalog } from '@/lib/connections'
import { isBespokeFlow } from '@/lib/connections/bespoke-flows'
import type { CatalogApp, OrgConnection } from '@/lib/connections'
import { AppIcon } from './app-icon'

/* ──────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────── */

interface ConnectionStatus {
  connected: boolean
  connectedAt?: string
}

interface ChannelStatusResponse {
  type: string
  connected: boolean
  connectedAt?: string | null
}

type ConnectionCallbackPayload =
  | { type: 'bb-connection-callback'; kind: 'success'; provider?: string }
  | { type: 'bb-connection-callback'; kind: 'error'; error?: string }
  | { type: 'popup_closed'; provider: string }

const CONNECTION_STATUS_ALIASES: Record<string, string> = {
  calendar: 'google-calendar',
  'google-calendar': 'google-calendar',
}

const FEATURED_IDS = ['gmail', 'google-calendar', 'whatsapp', 'stripe', 'asana', 'slack']

const BTN_BASE =
  'inline-flex min-w-[5.5rem] items-center justify-center rounded-lg px-4 py-2 text-base font-medium transition'

/* ──────────────────────────────────────────────────────────────────────────
 * Exports kept for backwards compatibility with existing tests / callers
 * ────────────────────────────────────────────────────────────────────────── */

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
  if (event.kind === 'error') return null
  if (!event.provider || event.provider === loadingId) return null
  return loadingId
}

export function getConnectionDisplayName(id: string): string {
  return id
}

/* ──────────────────────────────────────────────────────────────────────────
 * Bespoke flow router
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Map a bespoke flow id to a `ConnectModalMode`. Returns null when no modal
 * mode exists for that id — e.g. iMessage, which is flagged bespoke in
 * BESPOKE_FLOWS but has no dedicated `ConnectModal` variant yet.
 */
function resolveConnectModalMode(id: string): ConnectModalMode | null {
  if (id === 'whatsapp') return 'whatsapp_qr'
  if (id === 'stripe') return 'api_key'
  return null
}

/* ──────────────────────────────────────────────────────────────────────────
 * Card
 * ────────────────────────────────────────────────────────────────────────── */

interface ConnectionCardProps {
  app: CatalogApp
  isLoading: boolean
  orgConnection?: OrgConnection
  onConnect: (app: CatalogApp) => void
  onDisconnect: (app: CatalogApp) => void
  onConnectedClick?: (connection: OrgConnection) => void
}

function ConnectionCard({
  app,
  isLoading,
  orgConnection,
  onConnect,
  onDisconnect,
  onConnectedClick,
}: ConnectionCardProps) {
  const handleConnectedClick = useCallback(() => {
    if (orgConnection && onConnectedClick) {
      onConnectedClick(orgConnection)
    } else {
      onDisconnect(app)
    }
  }, [orgConnection, onConnectedClick, onDisconnect, app])

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm transition duration-300 hover:translate-y-[-1px] hover:shadow-md">
      <div className="flex items-center gap-3">
        <AppIcon id={app.id} name={app.name} logo={app.logo} size={40} />
        <div className="min-w-0">
          <h3 className="truncate text-base font-medium leading-tight text-foreground">
            {app.name}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-base leading-tight text-muted-foreground">
            {app.description}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end">
        {app.connected ? (
          <button
            type="button"
            onClick={handleConnectedClick}
            disabled={isLoading}
            className={`${BTN_BASE} border border-success bg-success/10 text-success hover:bg-success/15 disabled:opacity-50`}
          >
            {isLoading ? 'Removing\u2026' : 'Connected'}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onConnect(app)}
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

/* ──────────────────────────────────────────────────────────────────────────
 * Grid
 * ────────────────────────────────────────────────────────────────────────── */

export interface ConnectionsGridProps {
  onConnectionStateChange?: (hasConnection: boolean) => void
  onConnectedIdsChange?: (connectedIds: string[]) => void
  onConnectionClick?: (connection: OrgConnection) => void
  /** Phase 04 wires this to the Composio OAuth popup initiator. */
  onConnectComposio?: (app: CatalogApp) => void
  /** Phase 04 uses this to refresh the catalog after an OAuth success. */
  onRefetchReady?: (refetch: () => void) => void
  showHeader?: boolean
  showCategoryTabs?: boolean
}

export function ConnectionsGrid({
  onConnectionStateChange,
  onConnectedIdsChange,
  onConnectionClick,
  onConnectComposio,
  onRefetchReady,
  showHeader = true,
  showCategoryTabs = true,
}: ConnectionsGridProps) {
  const { toast } = useToast()
  const searchParams = useSearchParams()

  const [searchInput, setSearchInput] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [orgConnections, setOrgConnections] = useState<OrgConnection[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<ConnectModalMode>('api_key')
  const [modalChannelId, setModalChannelId] = useState('')
  const [modalChannelName, setModalChannelName] = useState('')
  const handledCallbackRef = useRef<string | null>(null)

  /* Debounce search input → debouncedQuery (300 ms) */
  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(searchInput.trim()), 300)
    return () => window.clearTimeout(id)
  }, [searchInput])

  const { data, isLoading, error, refetch } = useConnectionCatalog({
    q: debouncedQuery || undefined,
    category: activeCategory === 'all' ? undefined : activeCategory,
  })

  /* Expose refetch to parent (Phase 04 needs it after OAuth success). */
  useEffect(() => {
    if (onRefetchReady) onRefetchReady(() => void refetch())
  }, [onRefetchReady, refetch])

  const fetchOrgConnections = useCallback(async () => {
    try {
      const response = await fetch('/api/connections')
      if (!response.ok) return
      const body = (await response.json()) as { connections?: OrgConnection[] }
      const fetched = body.connections ?? []
      setOrgConnections(fetched)
      const connectedIds = fetched
        .filter(c => c.status === 'connected')
        .map(c => c.provider)
      onConnectionStateChange?.(connectedIds.length > 0)
      onConnectedIdsChange?.(connectedIds)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      logger.error('Error fetching org connections', { error: message })
    }
  }, [onConnectionStateChange, onConnectedIdsChange])

  useEffect(() => {
    void fetchOrgConnections()
  }, [fetchOrgConnections])

  useEffect(() => {
    const handleFocus = () => {
      void fetchOrgConnections()
      void refetch()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchOrgConnections, refetch])

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
      setLoadingId(current =>
        reconcileLoadingAfterOAuthEvent(current, payload as ConnectionCallbackPayload),
      )
      void fetchOrgConnections()
      void refetch()
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [fetchOrgConnections, refetch, toast])

  useEffect(() => {
    const connected = searchParams.get('connected')
    const callbackError = searchParams.get('error')
    if (!connected && !callbackError) return

    const key = `${connected ?? ''}:${callbackError ?? ''}`
    if (handledCallbackRef.current === key) return
    handledCallbackRef.current = key

    if (connected) toast('success', `${connected} connected`)
    if (callbackError) toast('error', callbackError)

    const msg: ConnectionCallbackPayload = connected
      ? { type: 'bb-connection-callback', kind: 'success', provider: connected }
      : { type: 'bb-connection-callback', kind: 'error', error: callbackError ?? 'Connection failed' }

    setLoadingId(current => reconcileLoadingAfterOAuthEvent(current, msg))
    void fetchOrgConnections()
    void refetch()

    if (window.opener && window.opener !== window) {
      try {
        window.opener.postMessage(msg, window.location.origin)
      } catch {
        /* best effort */
      }
      window.setTimeout(() => window.close(), 150)
      return
    }
    window.history.replaceState({}, '', window.location.pathname)
  }, [fetchOrgConnections, refetch, searchParams, toast])

  /* ────────────────────────────────────────────────────────────────────
   * Derived
   * ──────────────────────────────────────────────────────────────────── */

  const apps = data?.apps ?? []
  const softError = data?.error

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const app of apps) {
      for (const cat of app.categories) {
        if (!cat) continue
        counts.set(cat, (counts.get(cat) ?? 0) + 1)
      }
    }
    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([cat]) => cat)
    return ['all', ...top]
  }, [apps])

  const { featured, rest } = useMemo(() => {
    if (debouncedQuery || activeCategory !== 'all') {
      return { featured: [] as CatalogApp[], rest: apps }
    }
    const byId = new Map(apps.map(a => [a.id, a]))
    const feat: CatalogApp[] = []
    for (const id of FEATURED_IDS) {
      const app = byId.get(id)
      if (app) feat.push(app)
    }
    const featuredIds = new Set(feat.map(a => a.id))
    return { featured: feat, rest: apps.filter(a => !featuredIds.has(a.id)) }
  }, [apps, debouncedQuery, activeCategory])

  /* ────────────────────────────────────────────────────────────────────
   * Handlers
   * ──────────────────────────────────────────────────────────────────── */

  const handleConnect = useCallback(
    (app: CatalogApp) => {
      if (isBespokeFlow(app.id)) {
        const mode = resolveConnectModalMode(app.id)
        if (mode) {
          setModalChannelId(app.id)
          setModalChannelName(app.name)
          setModalMode(mode)
          setModalOpen(true)
          return
        }
        logger.warn(
          `No bespoke ConnectModal mode for ${app.id}; falling back to Composio router`,
        )
      }

      if (onConnectComposio) {
        setLoadingId(app.id)
        onConnectComposio(app)
        return
      }
      console.warn(
        `[ConnectionsGrid] onConnectComposio not wired; cannot connect ${app.id}`,
      )
      toast('info', `${app.name} connect flow is coming soon`)
    },
    [onConnectComposio, toast],
  )

  const handleDisconnect = useCallback(
    async (app: CatalogApp) => {
      const orgConn = orgConnections.find(c => c.provider === app.id)
      try {
        setLoadingId(app.id)
        if (orgConn) {
          const response = await fetch(`/api/connections/${orgConn.id}`, { method: 'DELETE' })
          if (!response.ok) throw new Error('Failed to disconnect')
        } else {
          const response = await fetch('/api/channels/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: app.id }),
          })
          if (!response.ok) throw new Error('Failed to disconnect')
        }
        await fetchOrgConnections()
        await refetch()
        toast('success', `${app.name} disconnected`)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        logger.error(`Error disconnecting ${app.id}`, { error: message })
        toast('error', `Could not disconnect ${app.name}`)
      } finally {
        setLoadingId(null)
      }
    },
    [fetchOrgConnections, orgConnections, refetch, toast],
  )

  /* ────────────────────────────────────────────────────────────────────
   * Render
   * ──────────────────────────────────────────────────────────────────── */

  const connectedCount = data?.connected_count ?? 0
  const gridCls = 'grid gap-4 md:grid-cols-2 xl:grid-cols-3'

  if (error) {
    return (
      <section className="grid gap-6" data-testid="connections-grid">
        <Empty>
          <EmptyMedia variant="icon">
            <IconAlertCircle size={20} />
          </EmptyMedia>
          <EmptyTitle>Could not load connections</EmptyTitle>
          <EmptyDescription>{error.message || 'Something went wrong'}</EmptyDescription>
          <EmptyContent>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </EmptyContent>
        </Empty>
      </section>
    )
  }

  return (
    <section className="grid gap-6" data-testid="connections-grid">
      {showHeader ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-medium tracking-[-0.02em] text-foreground">Connections</h2>
          <div className="rounded-lg bg-accent/10 px-3 py-1 text-base font-medium text-accent">
            {connectedCount} connected
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <IconSearch
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search services\u2026"
            aria-label="Search connections"
            className="pl-9"
          />
        </div>
      </div>

      {showCategoryTabs && categoryOptions.length > 1 ? (
        <div
          className="flex flex-wrap gap-2"
          role="tablist"
          aria-label="Connection categories"
        >
          {categoryOptions.map(cat => {
            const active = activeCategory === cat
            const label = cat === 'all' ? 'All' : cat.replace(/-/g, ' ')
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveCategory(cat)}
                className={`rounded-lg px-4 py-2 text-sm font-medium capitalize tracking-[0.04em] transition ${
                  active
                    ? 'bg-foreground text-white'
                    : 'border border-black/[0.06] bg-white/72 text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      ) : null}

      {softError ? (
        <div
          role="alert"
          data-testid="connections-soft-error"
          className="flex items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50/70 px-4 py-3 text-sm text-amber-900"
        >
          <IconAlertCircle size={16} />
          <span>{softError}</span>
        </div>
      ) : null}

      {isLoading ? (
        <div className={gridCls} data-testid="connections-loading">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-[9px]" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="ml-auto h-9 w-24" />
            </div>
          ))}
        </div>
      ) : apps.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No services available</EmptyTitle>
            <EmptyDescription>
              {softError
                ? 'Once Composio is configured, available services will appear here.'
                : 'No services match your search. Try a different query.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-6">
          {featured.length > 0 ? (
            <div className="grid gap-3">
              <h3 className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Featured
              </h3>
              <div className={gridCls} data-testid="connections-featured">
                {featured.map(app => (
                  <ConnectionCard
                    key={app.id}
                    app={app}
                    isLoading={loadingId === app.id}
                    orgConnection={orgConnections.find(c => c.provider === app.id)}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    onConnectedClick={onConnectionClick}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className={gridCls} data-testid="connections-all">
            {rest.map(app => (
              <ConnectionCard
                key={app.id}
                app={app}
                isLoading={loadingId === app.id}
                orgConnection={orgConnections.find(c => c.provider === app.id)}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                onConnectedClick={onConnectionClick}
              />
            ))}
          </div>
        </div>
      )}

      <ConnectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        mode={modalMode}
        channel={modalChannelId}
        channelName={modalChannelName}
        onSuccess={() => {
          void fetchOrgConnections()
          void refetch()
          toast('success', `${modalChannelName} connected`)
        }}
        onError={message => {
          toast('error', message)
        }}
      />
    </section>
  )
}
