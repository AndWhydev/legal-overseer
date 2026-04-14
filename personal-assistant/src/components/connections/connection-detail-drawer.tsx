'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  IconRefresh,
  IconPlugOff,
  IconTestPipe,
  IconLoader2,
  IconX,
  IconKey,
  IconAlertTriangle,
} from '@tabler/icons-react'
import type { OrgConnection, SyncLogEntry } from '@/lib/connections'
import { ConnectionStateBadge } from './connection-state-badge'

interface ConnectionDetailDrawerProps {
  connection: OrgConnection
  onClose: () => void
  /**
   * Called after a successful disconnect so the parent can refetch.
   * The drawer handles the network request itself now.
   */
  onDisconnect: (id: string) => void
  /** Called when the user asks to reconnect an expired integration. */
  onReconnect?: (connection: OrgConnection) => void
}

function timeSince(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}

function timeUntil(iso: string): { label: string; expired: boolean } {
  const delta = new Date(iso).getTime() - Date.now()
  if (delta <= 0) return { label: 'expired', expired: true }
  const mins = Math.floor(delta / 60_000)
  if (mins < 60) return { label: `in ${mins}m`, expired: false }
  const hours = Math.floor(mins / 60)
  if (hours < 48) return { label: `in ${hours}h`, expired: false }
  const days = Math.floor(hours / 24)
  return { label: `in ${days}d`, expired: false }
}

/**
 * Transport-aware disconnect confirmation copy. We don't want to show
 * the iMessage user "This revokes BitBit's access in Gmail" — context
 * matters for trust + understanding.
 */
function disconnectCopy(connection: OrgConnection): string {
  if (connection.transport === 'composio') {
    return `Disconnect ${connection.display_name}? This revokes BitBit's access and removes the connected account in Composio.`
  }
  if (connection.transport === 'bridge') {
    return `Disconnect ${connection.display_name}? This destroys the bridge instance and removes all linked state.`
  }
  if (connection.transport === 'webhook') {
    return `Disconnect ${connection.display_name}? The incoming webhook secret will be rotated and new events will be rejected.`
  }
  return `Disconnect ${connection.display_name}?`
}

export function ConnectionDetailContent({
  connection,
  onClose,
  onDisconnect,
  onReconnect,
}: ConnectionDetailDrawerProps) {
  const [logs, setLogs] = useState<SyncLogEntry[]>([])
  const [syncing, setSyncing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

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

  const handleConfirmDisconnect = async () => {
    setDisconnecting(true)
    try {
      const res = await fetch(`/api/connections/${connection.id}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hard: true, reason: 'user_action' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setTestResult(data.error || 'Disconnect failed')
        return
      }
      onDisconnect(connection.id)
      setConfirmOpen(false)
    } finally {
      setDisconnecting(false)
    }
  }

  const accountEmail =
    (connection.config as Record<string, string>)?.account_email || connection.provider

  const DISPLAY_NAMES: Record<string, string> = {
    imessage: 'iMessage',
    gmail: 'Gmail',
    outlook: 'Outlook',
    whatsapp: 'WhatsApp',
    'google-calendar': 'Google Calendar',
  }
  const displayName = DISPLAY_NAMES[connection.provider] || connection.display_name

  const expiryInfo = useMemo(() => {
    if (!connection.auth_expires_at) return null
    return timeUntil(connection.auth_expires_at)
  }, [connection.auth_expires_at])

  const needsReconnect =
    connection.status === 'auth_expired' ||
    connection.status === 'needs_reauth' ||
    (expiryInfo?.expired ?? false)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">{displayName}</h3>
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
          <ConnectionStateBadge
            status={connection.status}
            error={connection.last_error}
            authExpiresAt={connection.auth_expires_at}
          />
          <Badge variant="outline" className="text-[11px]">{connection.transport}</Badge>
          {connection.consecutive_failures > 0 && (
            <Badge variant="outline" className="text-[11px]" title="Consecutive health-check failures">
              {connection.consecutive_failures} recent failure{connection.consecutive_failures > 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        {/* Reconnect callout */}
        {needsReconnect && onReconnect && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
            <IconKey size={14} className="mt-0.5 shrink-0 text-amber-500" />
            <div className="flex-1">
              <p className="font-medium text-amber-700 dark:text-amber-300">
                Re-authorisation required
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {connection.last_error ?? 'The linked account token is no longer valid.'}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7 text-xs"
                onClick={() => onReconnect(connection)}
              >
                Reconnect
              </Button>
            </div>
          </div>
        )}

        {/* Error callout */}
        {connection.status === 'error' && connection.last_error && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs">
            <IconAlertTriangle size={14} className="mt-0.5 shrink-0 text-red-500" />
            <p className="flex-1 text-red-600 dark:text-red-300">{connection.last_error}</p>
          </div>
        )}

        <div className="my-3" />

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
            <div className="text-lg font-semibold">
              {expiryInfo ? expiryInfo.label : '\u2014'}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {expiryInfo?.expired ? 'Auth expired' : 'Auth renews'}
            </div>
          </div>
        </div>

        <div className="my-3" />

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
          <div
            className={`mt-2 rounded-md p-2 text-xs ${testResult === 'passed' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}
          >
            {testResult === 'passed' ? 'Connection test passed' : testResult}
          </div>
        )}

        <div className="my-3" />

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
            Setup guide →
          </a>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t px-4 py-3">
        {confirmOpen ? (
          <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs text-foreground">{disconnectCopy(connection)}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs"
                onClick={() => setConfirmOpen(false)}
                disabled={disconnecting}
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 text-xs"
                onClick={handleConfirmDisconnect}
                disabled={disconnecting}
              >
                {disconnecting && <IconLoader2 className="mr-1.5 size-3.5 animate-spin" />}
                Yes, disconnect
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 text-xs"
            onClick={() => setConfirmOpen(true)}
          >
            <IconPlugOff className="mr-1.5 size-3.5" />
            Disconnect
          </Button>
        )}
      </div>
    </div>
  )
}
