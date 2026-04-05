'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  IconPlugOff,
  IconRefresh,
  IconTestPipe,
  IconLoader2,
  IconCircleCheck,
  IconCircleX,
  IconCircleDot,
} from '@tabler/icons-react'
import type { OrgConnection, SyncLogEntry } from '@/lib/connections'

const timeSince = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}

interface ConnectionDetailDrawerProps {
  connection: OrgConnection | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDisconnect: (id: string) => void
}

export function ConnectionDetailDrawer({
  connection,
  open,
  onOpenChange,
  onDisconnect,
}: ConnectionDetailDrawerProps) {
  const [logs, setLogs] = useState<SyncLogEntry[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)

  const fetchLogs = useCallback(async () => {
    if (!connection) return
    setLogsLoading(true)
    try {
      const res = await fetch(`/api/connections/${connection.id}/logs?limit=10`)
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs ?? [])
      }
    } catch {
      // silently ignore
    } finally {
      setLogsLoading(false)
    }
  }, [connection])

  useEffect(() => {
    if (open && connection) {
      setTestResult(null)
      void fetchLogs()
    }
  }, [open, connection, fetchLogs])

  async function handleSync() {
    if (!connection) return
    setSyncing(true)
    try {
      await fetch(`/api/connections/${connection.id}/sync`, { method: 'POST' })
      void fetchLogs()
    } finally {
      setSyncing(false)
    }
  }

  async function handleTest() {
    if (!connection) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`/api/connections/${connection.id}/test`, { method: 'POST' })
      const data = await res.json()
      setTestResult(res.ok ? 'Connection OK' : (data.error ?? 'Test failed'))
    } catch {
      setTestResult('Network error')
    } finally {
      setTesting(false)
    }
  }

  function handleDisconnect() {
    if (!connection) return
    if (!confirm(`Disconnect ${connection.display_name}? Your synced messages will be preserved.`)) return
    onDisconnect(connection.id)
    onOpenChange(false)
  }

  const accountEmail = connection?.config?.account_email as string | undefined

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {connection ? (
          <>
            <SheetHeader className="border-b border-border pb-4">
              <SheetTitle>{connection.display_name}</SheetTitle>
              {accountEmail ? (
                <SheetDescription>{accountEmail}</SheetDescription>
              ) : null}
            </SheetHeader>

            <div className="flex flex-col gap-6 px-4 py-4">
              {/* Status badges */}
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={connection.status === 'connected' ? 'default' : 'secondary'}
                >
                  {connection.status}
                </Badge>
                <Badge variant="outline">{connection.transport}</Badge>
              </div>

              <Separator />

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-semibold text-foreground">{connection.message_count}</p>
                  <p className="text-xs text-muted-foreground">Messages</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    {connection.last_sync_at ? timeSince(connection.last_sync_at) : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">Last sync</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">
                    {connection.last_error ? 1 : 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              </div>

              <Separator />

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSync}
                  disabled={syncing || connection.transport === 'bridge'}
                  className="flex-1"
                >
                  {syncing ? (
                    <IconLoader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <IconRefresh className="mr-1.5 h-4 w-4" />
                  )}
                  Sync Now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing}
                  className="flex-1"
                >
                  {testing ? (
                    <IconLoader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <IconTestPipe className="mr-1.5 h-4 w-4" />
                  )}
                  Test
                </Button>
              </div>

              {testResult ? (
                <p className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground">
                  {testResult}
                </p>
              ) : null}

              <Separator />

              {/* Activity log */}
              <div>
                <h3 className="mb-3 text-sm font-medium text-foreground">Activity</h3>
                {logsLoading ? (
                  <div className="flex justify-center py-4">
                    <IconLoader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {logs.map((entry) => {
                      const StatusIcon =
                        entry.status === 'success'
                          ? IconCircleCheck
                          : entry.status === 'error'
                          ? IconCircleX
                          : IconCircleDot
                      const dotColor =
                        entry.status === 'success'
                          ? 'text-green-500'
                          : entry.status === 'error'
                          ? 'text-red-500'
                          : 'text-yellow-500'

                      return (
                        <div
                          key={entry.id}
                          className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/50 px-3 py-2"
                        >
                          <StatusIcon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${dotColor}`} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground">
                              {entry.error_message
                                ? entry.error_message
                                : `${entry.messages_inserted} inserted${entry.duplicates ? `, ${entry.duplicates} dupes` : ''}`}
                            </p>
                          </div>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {timeSince(entry.created_at)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <Separator />

              {/* Setup guide link */}
              <a
                href="/docs/connections/bridge"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Setup guide →
              </a>

              {/* Disconnect */}
              <div className="border-t border-border pt-2">
                <Button
                  variant="outline"
                  className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
                  onClick={handleDisconnect}
                >
                  <IconPlugOff className="mr-2 h-4 w-4" />
                  Disconnect
                </Button>
                <p className="mt-1.5 text-center text-xs text-muted-foreground">
                  Synced messages will be preserved
                </p>
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
