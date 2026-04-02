'use client'

import { useState, useEffect, useRef } from 'react'
import { IconCreditCard, IconPhone, IconLoader2, IconDeviceMobile, IconCircleCheck } from '@tabler/icons-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

export type ConnectModalMode = 'api_key' | 'whatsapp_qr'

interface ConnectModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: ConnectModalMode
  channel: string
  channelName: string
  onSuccess: () => void
  onError: (message: string) => void
}

export function ConnectModal({
  open,
  onOpenChange,
  mode,
  channel,
  channelName,
  onSuccess,
  onError,
}: ConnectModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {mode === 'api_key' ? (
          <ApiKeyForm
            channel={channel}
            channelName={channelName}
            onSuccess={() => { onOpenChange(false); onSuccess(); }}
            onError={onError}
          />
        ) : (
          <WhatsAppQRPanel
            channelName={channelName}
            onSuccess={() => { onOpenChange(false); onSuccess(); }}
            onError={onError}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ApiKeyForm({
  channel,
  channelName,
  onSuccess,
  onError,
}: {
  channel: string
  channelName: string
  onSuccess: () => void
  onError: (msg: string) => void
}) {
  const [secretKey, setSecretKey] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!secretKey.trim()) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/channels/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, credentials: { secret_key: secretKey.trim() } }),
      })
      const data = await res.json()

      if (res.ok) {
        onSuccess()
      } else {
        onError(data.error || `Failed to connect ${channelName}`)
      }
    } catch {
      onError(`Network error connecting ${channelName}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <IconCreditCard className="h-5 w-5 text-[#635BFF]" />
          Connect {channelName}
        </DialogTitle>
        <DialogDescription>
          Enter your {channelName} API secret key to connect. You can find this in your {channelName} Dashboard under Developers &gt; API keys.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="secret-key" className="text-sm font-medium text-foreground">
            Secret Key
          </label>
          <input
            id="secret-key"
            type="password"
            value={secretKey}
            onChange={e => setSecretKey(e.target.value)}
            placeholder="sk_live_..."
            autoComplete="off"
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Your key is encrypted and stored securely. We never log or expose API keys.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="submit"
            disabled={submitting || !secretKey.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <IconLoader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </form>
    </>
  )
}

function WhatsAppQRPanel({
  channelName,
  onSuccess,
  onError,
}: {
  channelName: string
  onSuccess: () => void
  onError: (msg: string) => void
}) {
  const [bridgeStatus, setBridgeStatus] = useState<'idle' | 'starting' | 'pairing' | 'connected' | 'error'>('idle')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Track the session ID from the POST so we only accept 'connected' from OUR session
  const sessionIdRef = useRef<string | null>(null)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [])

  // Poll for QR code and connection status
  useEffect(() => {
    if (bridgeStatus !== 'pairing') return

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/channels/whatsapp/bridge')
        if (!res.ok) return

        const data = await res.json()

        // Only accept 'connected' if it matches the session we just started.
        // This prevents stale sessions from auto-closing the modal.
        const isOurSession = !sessionIdRef.current
          || data.sessionId === sessionIdRef.current

        if (data.status === 'connected' && isOurSession) {
          setBridgeStatus('connected')
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          onSuccess()
        } else if (data.qrCode) {
          setQrCode(data.qrCode)
        }
      } catch {
        // Silently retry on next interval
      }
    }, 3000)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [bridgeStatus, onSuccess])

  async function handleInitiate() {
    setBridgeStatus('starting')
    setQrCode(null)
    sessionIdRef.current = null

    try {
      const bridgeRes = await fetch('/api/channels/whatsapp/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!bridgeRes.ok) {
        const bridgeData = await bridgeRes.json()
        setBridgeStatus('error')
        onError(bridgeData.error || 'Failed to start WhatsApp bridge')
        return
      }

      const bridgeData = await bridgeRes.json()
      // Store the session ID so the poller only accepts this session's status
      sessionIdRef.current = bridgeData.sessionId ?? null

      // Bridge started, begin polling for QR code
      setBridgeStatus('pairing')
    } catch {
      setBridgeStatus('error')
      onError(`Network error connecting ${channelName}`)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <IconPhone className="h-5 w-5 text-[#25D366]" />
          Connect {channelName}
        </DialogTitle>
        <DialogDescription>
          Link your WhatsApp account by scanning a QR code with your phone.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        {/* QR Code display area */}
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/30 p-8">
          {bridgeStatus === 'connected' ? (
            <>
              <IconCircleCheck className="h-12 w-12 text-[#25D366]" />
              <p className="text-sm font-medium text-foreground">
                WhatsApp connected successfully
              </p>
            </>
          ) : bridgeStatus === 'starting' ? (
            <>
              <IconLoader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Starting WhatsApp bridge...
              </p>
            </>
          ) : bridgeStatus === 'pairing' && qrCode ? (
            <>
              <div className="flex h-48 w-48 items-center justify-center rounded-lg bg-white p-2">
                <img src={qrCode} alt="WhatsApp QR Code" className="h-full w-full" />
              </div>
              <p className="text-xs text-muted-foreground">
                Scan this QR code with your WhatsApp app
              </p>
            </>
          ) : bridgeStatus === 'pairing' ? (
            <>
              <div className="flex h-40 w-40 items-center justify-center rounded-lg bg-white">
                <IconLoader2 className="h-12 w-12 animate-spin text-gray-300" />
              </div>
              <p className="text-xs text-muted-foreground">
                Waiting for QR code...
              </p>
            </>
          ) : bridgeStatus === 'error' ? (
            <>
              <IconDeviceMobile className="h-12 w-12 text-destructive/50" />
              <p className="text-center text-sm text-destructive">
                Failed to start bridge. Try again.
              </p>
            </>
          ) : (
            <>
              <IconDeviceMobile className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-center text-sm text-muted-foreground">
                Click below to start a pairing session
              </p>
            </>
          )}
        </div>

        {/* Instructions */}
        <div className="rounded-lg bg-secondary/50 p-3">
          <p className="mb-2 text-xs font-medium text-foreground">How to connect:</p>
          <ol className="list-inside list-decimal text-xs text-muted-foreground [&>li+li]:mt-1">
            <li>Open WhatsApp on your phone</li>
            <li>Go to Settings &gt; Linked Devices</li>
            <li>Tap &quot;Link a Device&quot;</li>
            <li>Scan the QR code shown above</li>
          </ol>
        </div>

        {/* Action */}
        <div className="flex justify-end">
          <button
            onClick={handleInitiate}
            disabled={bridgeStatus === 'starting' || bridgeStatus === 'pairing' || bridgeStatus === 'connected'}
            className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#25D366]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bridgeStatus === 'starting' && <IconLoader2 className="h-4 w-4 animate-spin" />}
            {bridgeStatus === 'starting' ? 'Starting...'
              : bridgeStatus === 'pairing' ? 'Waiting for scan...'
              : bridgeStatus === 'connected' ? 'Connected'
              : bridgeStatus === 'error' ? 'Retry Pairing'
              : 'Start Pairing'}
          </button>
        </div>
      </div>
    </>
  )
}