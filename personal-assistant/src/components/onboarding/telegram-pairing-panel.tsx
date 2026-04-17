'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, AlertCircle, ExternalLink, Copy, Check } from 'lucide-react'
import { pairingBreadcrumb } from './pairing-breadcrumbs'

/**
 * TelegramPairingPanel
 *
 * Telegram has no Fly-machine bridge — pairing is: we mint a one-time code,
 * user taps a deep-link to our bot (`t.me/<bot>?start=<code>`), the webhook
 * detects the `/start <code>` message, and we bind their telegram chat_id to
 * their org via `channel_identities`.
 *
 * Contract mirrors BridgePairingPanel:
 *  - On mount, POST `/api/bridges/telegram/pair` to mint a code + bot URL.
 *  - Poll `/api/bridges/telegram/status` every 2.5s until status=linked.
 *  - Fire `onLinked` when the pairing completes.
 */

type LinkingState = 'provisioning' | 'waiting' | 'connected' | 'error'

interface TelegramPairingPanelProps {
  onLinked: () => void
  onSkip?: () => void
}

export function TelegramPairingPanel({ onLinked, onSkip }: TelegramPairingPanelProps) {
  const [state, setState] = useState<LinkingState>('provisioning')
  const [botUrl, setBotUrl] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Track the connection row so Skip can scrub the pairing code and free the
  // provisioning slot (keeps org_connections from accumulating dead rows even
  // though there's no infra cost for telegram specifically).
  const [connectionId, setConnectionId] = useState<string | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  const startPairing = useCallback(async () => {
    pairingBreadcrumb({ surface: 'telegram', event: 'provisioning_started' })
    setState('provisioning')
    setError(null)

    try {
      const res = await fetch('/api/bridges/telegram/pair', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Failed to start Telegram pairing')
      }

      const data = await res.json() as {
        bot_url: string
        code: string
        connection_id: string
      }

      setBotUrl(data.bot_url)
      setCode(data.code)
      setConnectionId(data.connection_id)
      pairingBreadcrumb({
        surface: 'telegram',
        event: 'pairing_code_issued',
        data: { connection_id: data.connection_id },
      })
      setState('waiting')

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/bridges/telegram/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connection_id: data.connection_id }),
          })
          if (!statusRes.ok) return
          const statusData = await statusRes.json() as {
            status: 'waiting' | 'linked' | 'error'
            error?: string
          }
          if (statusData.status === 'linked') {
            cleanup()
            pairingBreadcrumb({ surface: 'telegram', event: 'linked' })
            setState('connected')
            setTimeout(() => onLinked(), 1200)
          } else if (statusData.status === 'error') {
            cleanup()
            pairingBreadcrumb({
              surface: 'telegram',
              event: 'link_status_error',
              level: 'error',
              data: { error: statusData.error ?? 'unknown' },
            })
            setState('error')
            setError(statusData.error ?? 'Pairing failed')
          }
        } catch {
          // Transient, continue polling.
        }
      }, 2500)
    } catch (err) {
      pairingBreadcrumb({
        surface: 'telegram',
        event: 'provisioning_failed',
        level: 'error',
        data: { error: err instanceof Error ? err.message : String(err) },
      })
      setState('error')
      setError(err instanceof Error ? err.message : 'Failed to start pairing')
    }
  }, [cleanup, onLinked])

  useEffect(() => {
    void startPairing()
  }, [startPairing])

  const handleCopy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard may be blocked; the code is already visible on screen.
    }
  }

  // Skip with cleanup: if we minted a pairing code but the user never used
  // it, DELETE the connection to scrub the unused code. Fire-and-forget.
  const handleSkip = useCallback(() => {
    if (!onSkip) return
    if (connectionId && state !== 'connected') {
      cleanup()
      void fetch(`/api/bridges/${connectionId}`, { method: 'DELETE' }).catch(() => {})
    }
    onSkip()
  }, [connectionId, state, cleanup, onSkip])

  return (
    <div className="flex flex-col gap-6 w-full">
      {state === 'provisioning' && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Generating your pairing code…</p>
        </div>
      )}

      {state === 'waiting' && botUrl && code && (
        <div className="flex flex-col gap-5">
          <div className="space-y-2">
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">1</span>
              <span className="pt-0.5">Open Telegram and tap the button below to find our bot.</span>
            </div>
            <div className="flex items-start gap-3 text-sm text-muted-foreground">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">2</span>
              <span className="pt-0.5">Tap <strong>Start</strong> in the Telegram chat. We&apos;ll detect it and this page will advance automatically.</span>
            </div>
          </div>

          <Button asChild size="lg" className="w-full">
            <a href={botUrl} target="_blank" rel="noreferrer noopener">
              Open BitBit in Telegram
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>

          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-xs text-muted-foreground mb-2">
              Can&apos;t tap the link? Open Telegram manually and send this to our bot:
            </p>
            <div className="flex items-center justify-between gap-2 rounded-md bg-background px-3 py-2 font-mono text-sm">
              <span className="truncate">/start {code}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="Copy pairing command"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Badge variant="outline" className="gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Waiting for Telegram…
            </Badge>
            {onSkip && (
              <Button variant="ghost" size="sm" onClick={handleSkip}>
                Skip for now
              </Button>
            )}
          </div>
        </div>
      )}

      {state === 'connected' && (
        <div className="flex flex-col items-center gap-3 py-10">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <p className="text-base font-medium">Telegram connected!</p>
          <p className="text-sm text-muted-foreground">Taking you to the dashboard…</p>
        </div>
      )}

      {state === 'error' && (
        <div className="flex flex-col items-center gap-3 py-8">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="max-w-sm text-center text-sm text-destructive">
            {error ?? 'Something went wrong'}
          </p>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => void startPairing()}>
              Try again
            </Button>
            {onSkip && (
              <Button variant="ghost" onClick={handleSkip}>
                Skip for now
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
