'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { pairingBreadcrumb } from './pairing-breadcrumbs'

/**
 * BridgePairingPanel
 *
 * Inline (non-Dialog) variant of `BridgeLinkModal` used by the full-page
 * /onboard/connect/[surface] route. Identical state machine + polling contract
 * against `/api/bridges/provision` and `/api/bridges/link-status`, extracted so
 * onboarding and settings-surface pairing share one implementation.
 *
 * Contract:
 *  - Render as a vertical card. No modal chrome.
 *  - `onLinked` fires once pairing completes; caller handles navigation.
 *  - `onSkip` lets the user move on without pairing (marks onboarding complete
 *    without a connected bridge; we'll email them when the bridge is ready).
 */

export type FlyBridgeProtocol = 'imessage' | 'whatsapp' | 'android-messages'

type LinkingState = 'idle' | 'provisioning' | 'linking' | 'connected' | 'error'
type SignInState = 'waiting_for_password' | 'waiting_for_2fa' | 'verifying' | 'connected' | 'error'

interface VncInfo {
  ip: string
  port: number
  password: string
}

interface BridgePairingPanelProps {
  protocol: FlyBridgeProtocol
  onLinked: () => void
  onSkip?: () => void
  /** Pre-filled Apple ID email for iMessage — skips the idle-state input. */
  initialAppleIdEmail?: string
}

const PROTOCOL_CONFIG: Record<FlyBridgeProtocol, {
  name: string
  instructions: string[]
}> = {
  imessage: {
    name: 'iMessage',
    instructions: [
      'Enter your Apple ID email address',
      'Sign in to Messages on the remote Mac we spin up for you',
      'Approve the 2FA prompt on your Apple device',
    ],
  },
  whatsapp: {
    name: 'WhatsApp',
    instructions: [
      'Open WhatsApp on your phone',
      'Go to Settings → Linked Devices',
      'Tap "Link a Device"',
      'Scan the QR code we show here',
    ],
  },
  'android-messages': {
    name: 'Android Messages',
    instructions: [
      'Open Messages on your Android phone',
      'Tap ⋮ (menu) → Device pairing',
      'Tap "QR code scanner"',
      'Scan the QR code we show here',
    ],
  },
}

const SIGN_IN_STATE_LABELS: Record<SignInState, string> = {
  waiting_for_password: 'Enter your Apple ID credentials in Messages…',
  waiting_for_2fa: 'Check your Apple device for the 2FA code…',
  verifying: 'Verifying with Apple…',
  connected: 'Apple ID connected!',
  error: 'Sign-in failed. Try again.',
}

export function BridgePairingPanel({
  protocol,
  onLinked,
  onSkip,
  initialAppleIdEmail,
}: BridgePairingPanelProps) {
  const [state, setState] = useState<LinkingState>('idle')
  const [qrData, setQrData] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Track the connection_id so we can DELETE the in-flight bridge if the
  // user skips mid-provisioning — otherwise the Fly Machine / Mac VPS stays
  // orphaned and keeps billing ($1.90–$7.70/mo each).
  const [connectionId, setConnectionId] = useState<string | null>(null)

  // iMessage-specific
  const [appleIdEmail, setAppleIdEmail] = useState(initialAppleIdEmail ?? '')
  const [vncInfo, setVncInfo] = useState<VncInfo | null>(null)
  const [signInState, setSignInState] = useState<SignInState>('waiting_for_password')
  const [showFullDesktop, setShowFullDesktop] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const vncContainerRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<unknown>(null)
  const config = PROTOCOL_CONFIG[protocol]
  const isImessage = protocol === 'imessage'

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => () => cleanup(), [cleanup])

  // Connect noVNC when VNC info arrives and we're linking iMessage.
  useEffect(() => {
    if (state !== 'linking' || !isImessage || !vncInfo || !vncContainerRef.current) return

    let cancelled = false

    const connectVnc = async () => {
      try {
        const { default: RFB } = await import('@novnc/novnc/lib/rfb')
        if (cancelled || !vncContainerRef.current) return

        if (rfbRef.current) {
          try {
            (rfbRef.current as { disconnect: () => void }).disconnect()
          } catch {
            // ignore
          }
        }

        const wsUrl = `wss://${vncInfo.ip}:${vncInfo.port}`
        const rfb = new RFB(vncContainerRef.current, wsUrl, {
          credentials: { password: vncInfo.password },
        })

        rfb.scaleViewport = !showFullDesktop
        rfb.resizeSession = false
        rfbRef.current = rfb
      } catch (err) {
        if (!cancelled) console.error('[noVNC] connection failed', err)
      }
    }

    void connectVnc()

    return () => {
      cancelled = true
      if (rfbRef.current) {
        try {
          (rfbRef.current as { disconnect: () => void }).disconnect()
        } catch {
          // ignore
        }
        rfbRef.current = null
      }
    }
  }, [state, isImessage, vncInfo, showFullDesktop])

  const startProvisioning = async () => {
    pairingBreadcrumb({ surface: protocol, event: 'provisioning_started' })
    setState('provisioning')
    setError(null)

    try {
      const body: Record<string, string> = { protocol }
      if (isImessage && appleIdEmail) body.apple_id_email = appleIdEmail.trim().toLowerCase()

      const res = await fetch('/api/bridges/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? 'Failed to provision bridge')
      }

      const data = await res.json() as {
        connection_id: string
        link_data?: { vnc?: VncInfo } | null
      }

      setConnectionId(data.connection_id)
      if (isImessage && data.link_data?.vnc) setVncInfo(data.link_data.vnc)

      pairingBreadcrumb({
        surface: protocol,
        event: 'provisioning_succeeded',
        data: { connection_id: data.connection_id, has_vnc: !!data.link_data?.vnc },
      })
      setState('linking')

      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/bridges/link-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connection_id: data.connection_id }),
          })

          if (!statusRes.ok) return
          const statusData = await statusRes.json() as {
            status: 'waiting' | 'linked' | 'error'
            qr?: string
            vnc?: VncInfo
            sign_in_state?: SignInState
            error?: string
          }

          if (statusData.qr) setQrData(statusData.qr)
          if (isImessage) {
            if (statusData.vnc) setVncInfo(statusData.vnc)
            if (statusData.sign_in_state) setSignInState(statusData.sign_in_state)
          }

          if (statusData.status === 'linked') {
            cleanup()
            pairingBreadcrumb({ surface: protocol, event: 'linked' })
            setState('connected')
            setTimeout(() => onLinked(), 1200)
          } else if (statusData.status === 'error') {
            cleanup()
            pairingBreadcrumb({
              surface: protocol,
              event: 'link_status_error',
              level: 'error',
              data: { error: statusData.error ?? 'unknown' },
            })
            setState('error')
            setError(statusData.error ?? 'Linking failed')
          }
        } catch {
          // Transient polling error, keep trying.
        }
      }, 2500)
    } catch (err) {
      pairingBreadcrumb({
        surface: protocol,
        event: 'provisioning_failed',
        level: 'error',
        data: { error: err instanceof Error ? err.message : String(err) },
      })
      setState('error')
      setError(err instanceof Error ? err.message : 'Provisioning failed')
    }
  }

  const handleRetry = () => {
    setState('idle')
    setError(null)
    setVncInfo(null)
    setQrData(null)
    setSignInState('waiting_for_password')
  }

  // Skip with cleanup: if we've already provisioned a bridge (state is
  // anything beyond 'idle'), tear it down before navigating — otherwise the
  // Fly Machine / Mac VPS persists and keeps billing. Fire-and-forget; the
  // user shouldn't wait for teardown on their exit path.
  const handleSkip = useCallback(() => {
    if (!onSkip) return
    if (connectionId && state !== 'idle' && state !== 'connected') {
      cleanup()
      void fetch(`/api/bridges/${connectionId}`, { method: 'DELETE' }).catch(() => {
        // Intentionally swallow — user is leaving. The cost-leak cron
        // (/api/cron/bridge-cost-leak) will catch anything we miss here.
      })
    }
    onSkip()
  }, [connectionId, state, cleanup, onSkip])

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Idle — instructions + start button */}
      {state === 'idle' && (
        <div className="flex flex-col gap-5">
          <div className="space-y-2">
            {config.instructions.map((instruction, i) => (
              <div key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                  {i + 1}
                </span>
                <span className="pt-0.5">{instruction}</span>
              </div>
            ))}
          </div>

          {isImessage && (
            <div className="flex flex-col gap-2">
              <label htmlFor="apple-id-email" className="text-xs font-medium text-muted-foreground">
                Apple ID email
              </label>
              <Input
                id="apple-id-email"
                placeholder="you@icloud.com"
                value={appleIdEmail}
                onChange={e => setAppleIdEmail(e.target.value)}
                type="email"
                autoComplete="email"
              />
              <p className="text-xs text-muted-foreground">
                We spin up a fresh Mac in the cloud and sign you in to Messages with this Apple ID —
                nothing runs on your laptop.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              className="flex-1"
              onClick={startProvisioning}
              disabled={isImessage && !appleIdEmail.trim()}
            >
              Connect {config.name}
            </Button>
            {onSkip && (
              <Button variant="ghost" onClick={handleSkip}>
                Skip for now
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Provisioning — spinner */}
      {state === 'provisioning' && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Setting up your {config.name} bridge…
          </p>
          <p className="text-xs text-muted-foreground">This takes about 30 seconds.</p>
        </div>
      )}

      {/* Linking — iMessage noVNC */}
      {state === 'linking' && isImessage && (
        <div className="space-y-3">
          <div
            ref={vncContainerRef}
            className="relative w-full overflow-hidden rounded-lg border border-border bg-black"
            style={{ height: showFullDesktop ? '520px' : '360px' }}
          >
            {!vncInfo && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Badge variant="outline" className="gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              {SIGN_IN_STATE_LABELS[signInState]}
            </Badge>
            <p className="text-xs text-muted-foreground">
              Sign in to Messages with <strong>{appleIdEmail}</strong> using the remote desktop above.
              Once iMessage activates, this screen will advance automatically.
            </p>
          </div>

          <button
            type="button"
            className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => setShowFullDesktop(v => !v)}
          >
            {showFullDesktop ? 'Show compact view' : 'Having trouble? Show full desktop'}
          </button>
        </div>
      )}

      {/* Linking — WhatsApp / Android QR */}
      {state === 'linking' && !isImessage && (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex h-56 w-56 items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted">
            {qrData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrData} alt="Pairing QR Code" className="h-full w-full rounded-xl" />
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Generating QR…</p>
              </div>
            )}
          </div>
          <Badge variant="outline" className="gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            Waiting for scan…
          </Badge>
          <p className="max-w-xs text-center text-xs text-muted-foreground">
            The QR expires in a few minutes. If you don&apos;t see it, refresh and try again.
          </p>
        </div>
      )}

      {/* Connected */}
      {state === 'connected' && (
        <div className="flex flex-col items-center gap-3 py-10">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <p className="text-base font-medium">{config.name} connected!</p>
          <p className="text-sm text-muted-foreground">
            Taking you to the dashboard…
          </p>
        </div>
      )}

      {/* Error */}
      {state === 'error' && (
        <div className="flex flex-col items-center gap-3 py-8">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="max-w-sm text-center text-sm text-destructive">
            {error ?? 'Something went wrong'}
          </p>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleRetry}>
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
