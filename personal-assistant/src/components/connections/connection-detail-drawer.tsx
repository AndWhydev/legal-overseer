'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { IconRefresh, IconPlugOff, IconTestPipe, IconLoader2, IconX } from '@tabler/icons-react'
import type { OrgConnection, SyncLogEntry } from '@/lib/connections'

interface ConnectionDetailDrawerProps {
  connection: OrgConnection
  onClose: () => void
  onDisconnect: (id: string) => void
}

function timeSince(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}

export function ConnectionDetailContent({
  connection,
  onClose,
  onDisconnect,
}: ConnectionDetailDrawerProps) {
  const [logs, setLogs] = useState<SyncLogEntry[]>([])
  const [syncing, setSyncing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    const res = await fetch(`/api/connections/${connection.id}/logs?limit=10`)
    if (res.ok) {
      const data = await res.json()
      setLogs(data.logs || [])
    }
  }, [connection.id])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch(`/api/connections/${connection.id}/sync`, { method: 'POST' })
      if (res.ok) void fetchLogs()
    } finally {
      setSyncing(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`/api/connections/${connection.id}/test`, { method: 'POST' })
      const data = await res.json()
      setTestResult(data.ok ? 'passed' : data.error || 'failed')
    } finally {
      setTesting(false)
    }
  }

  const accountEmail = (connection.config as Record<string, string>)?.account_email || connection.provider

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">{connection.display_name}</h3>
          <p className="text-xs text-muted-foreground">{accountEmail}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="size-7">
          <IconX size={16} />
        </Button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Badges */}
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={connection.status === 'connected' ? 'default' : 'destructive'} className="text-[11px]">
            {connection.status}
          </Badge>
          <Badge variant="outline" className="text-[11px]">{connection.transport}</Badge>
        </div>

        <Separator className="my-4" />

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-semibold">{connection.message_count}</div>
            <div className="text-[11px] text-muted-foreground">Messages</div>
          </div>
          <div>
            <div className="text-lg font-semibold">
              {connection.last_sync_at ? timeSince(connection.last_sync_at) : '\u2014'}
            </div>
            <div className="text-[11px] text-muted-foreground">Last sync</div>
          </div>
          <div>
            <div className="text-lg font-semibold">{connection.last_error ? '1' : '0'}</div>
            <div className="text-[11px] text-muted-foreground">Errors</div>
          </div>
        </div>

        <Separator className="my-4" />

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={handleSync}
            disabled={syncing || connection.transport === 'bridge'}
          >
            {syncing ? <IconLoader2 className="mr-1.5 size-3.5 animate-spin" /> : <IconRefresh className="mr-1.5 size-3.5" />}
            Sync Now
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 text-xs"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? <IconLoader2 className="mr-1.5 size-3.5 animate-spin" /> : <IconTestPipe className="mr-1.5 size-3.5" />}
            Test
          </Button>
        </div>

        {testResult && (
          <div className={`mt-2 rounded-md p-2 text-xs ${testResult === 'passed' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
            {testResult === 'passed' ? 'Connection test passed' : testResult}
          </div>
        )}

        <Separator className="my-4" />

        {/* Activity */}
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">Recent activity</h4>
        <div className="space-y-1.5">
          {logs.length === 0 && (
            <p className="text-xs text-muted-foreground">No sync activity yet</p>
          )}
          {logs.map((log) => (
            <div key={log.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`size-1.5 rounded-full ${log.status === 'success' ? 'bg-green-500' : log.status === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                <span className="text-xs">
                  {log.status === 'success'
                    ? `${log.messages_inserted} inserted${log.duplicates ? `, ${log.duplicates} dupes` : ''}`
                    : log.status === 'error'
                    ? (log.error_message || 'Sync failed')
                    : `${log.messages_inserted}/${log.messages_found} partial`}
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">{timeSince(log.created_at)}</span>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <a
            href="https://docs.bitbit.chat/docs/connections/overview"
            target="_blank"
            rel="noopener"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Setup guide \u2192
          </a>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 text-xs"
          onClick={() => onDisconnect(connection.id)}
        >
          <IconPlugOff className="mr-1.5 size-3.5" />
          Disconnect
        </Button>
      </div>
    </div>
  )
}
