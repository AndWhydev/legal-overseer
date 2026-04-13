'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ConnectionsGrid } from '@/components/connections/connections-grid'
import { ConnectionDetailContent } from '@/components/connections/connection-detail-drawer'
import { useToast } from '@/components/ui/toast'
import { logger } from '@/lib/core/logger'
import type { CatalogApp, OrgConnection } from '@/lib/connections'

function ConnectionsPageInner() {
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedConnection, setSelectedConnection] = useState<OrgConnection | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const refetchRef = useRef<(() => void) | null>(null)

  // Success / error query-param handling after a Composio OAuth redirect.
  const successFlag = searchParams.get('composio_success')
  const errorFlag = searchParams.get('composio_error')
  const appParam = searchParams.get('app')

  useEffect(() => {
    if (successFlag === 'true') {
      toast('success', appParam ? `${appParam} connected` : 'Connected')
      refetchRef.current?.()
      // Clear the success query params so a refresh doesn't re-trigger the toast.
      router.replace('/dashboard/connections')
    } else if (errorFlag) {
      toast(
        'error',
        appParam ? `Failed to connect ${appParam}. Please try again.` : 'Connection failed.',
      )
      router.replace('/dashboard/connections')
    }
  }, [successFlag, errorFlag, appParam, router, toast])

  function handleConnectionClick(connection: OrgConnection) {
    setSelectedConnection(connection)
    setDrawerOpen(true)
  }

  function handleDisconnect(_id: string) {
    setDrawerOpen(false)
    setSelectedConnection(null)
  }

  const handleRefetchReady = useCallback((refetch: () => void) => {
    refetchRef.current = refetch
  }, [])

  const handleConnectComposio = useCallback(
    async (app: CatalogApp) => {
      try {
        const res = await fetch('/api/connections/composio/connect', {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ appKey: app.id }),
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          const message =
            typeof body?.error === 'string'
              ? body.error
              : `Failed to initiate connection for ${app.name}.`
          toast('error', message)
          return
        }

        const data = (await res.json()) as { redirectUrl?: string }
        if (!data?.redirectUrl) {
          toast('error', `No redirect URL returned for ${app.name}.`)
          return
        }

        // Full-page redirect to Composio consent screen. The callback route
        // persists the ConnectedAccount and redirects back with query params.
        window.location.href = data.redirectUrl
      } catch (err) {
        logger.error('[connections] onConnectComposio failed', {
          appKey: app.id,
          error: err instanceof Error ? err.message : String(err),
        })
        toast('error', `Unable to start connection for ${app.name}.`)
      }
    },
    [toast],
  )

  return (
    <>
      <ConnectionsGrid
        onConnectionClick={handleConnectionClick}
        onConnectComposio={handleConnectComposio}
        onRefetchReady={handleRefetchReady}
      />
      {selectedConnection && (
        <ConnectionDetailContent
          connection={selectedConnection}
          onClose={() => setDrawerOpen(false)}
          onDisconnect={handleDisconnect}
        />
      )}
    </>
  )
}

export default function ConnectionsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Suspense fallback={<div className="py-12 text-center text-sm" style={{ color: 'var(--muted-foreground)' }}>Loading connections...</div>}>
        <ConnectionsPageInner />
      </Suspense>
    </div>
  )
}
