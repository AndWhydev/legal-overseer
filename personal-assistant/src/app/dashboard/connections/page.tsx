'use client'

import { Suspense, useState } from 'react'
import { ConnectionsGrid } from '@/components/connections/connections-grid'
import { ConnectionDetailDrawer } from '@/components/connections/connection-detail-drawer'
import type { OrgConnection } from '@/lib/connections'

function ConnectionsPageInner() {
  const [selectedConnection, setSelectedConnection] = useState<OrgConnection | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  function handleConnectionClick(connection: OrgConnection) {
    setSelectedConnection(connection)
    setDrawerOpen(true)
  }

  function handleDisconnect(_id: string) {
    // The grid manages actual disconnect logic; close drawer and let grid re-fetch
    setDrawerOpen(false)
    setSelectedConnection(null)
  }

  return (
    <>
      <ConnectionsGrid onConnectionClick={handleConnectionClick} />
      <ConnectionDetailDrawer
        connection={selectedConnection}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onDisconnect={handleDisconnect}
      />
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
