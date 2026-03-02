'use client'

import { useState, useEffect, useRef } from 'react'
import { CreditCard, Phone, Loader2, QrCode, Smartphone, CheckCircle2 } from 'lucide-react'
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
            channel={channel}
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
          <CreditCard className="h-5 w-5 text-[#635BFF]" />
          Connect {channelName}
        </DialogTitle>
        <DialogDescription>
          Enter your {channelName} API secret key to connect. You can find this in your {channelName} Dashboard under Developers &gt; API keys.
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
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
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#D4A574] focus:outline-none focus:ring-1 focus:ring-[#D4A574]"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Your key is encrypted and stored securely. We never log or expose API keys.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="submit"
            disabled={submitting || !secretKey.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#D4A574] px-4 py-2 text-sm font-medium text-background hover:bg-[#D4A574]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </form>
    </>
  )
}

function WhatsAppQRPanel({
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
  const [bridgeStatus, setBridgeStatus] = useState<'idle' | 'starting' | 'pairing' | 'connected' | 'error'>('idle')
  const [qrCode, setQrCode] = useState<string | null>(null)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

        if (data.status === 'connected') {
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
    try {
      // Step 1: Create pairing session via connect endpoint
      const connectRes = await fetch('/api/channels/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      })
      const connectData = await connectRes.json()

      if (!connectRes.ok) {
        setBridgeStatus('error')
        onError(connectData.error || `Failed to start ${channelName} pairing`)
        return
      }

      // Step 2: Start Baileys bridge
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
          <Phone className="h-5 w-5 text-[#25D366]" />
          Connect {channelName}
        </DialogTitle>
        <DialogDescription>
          Link your WhatsApp account by scanning a QR code with your phone.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* QR Code display area */}
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/30 p-8">
          {bridgeStatus === 'connected' ? (
            <>
              <CheckCircle2 className="h-12 w-12 text-[#25D366]" />
              <p className="text-sm font-medium text-foreground">
                WhatsApp connected successfully
              </p>
            </>
          ) : bridgeStatus === 'starting' ? (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
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
                <Loader2 className="h-12 w-12 animate-spin text-gray-300" />
              </div>
              <p className="text-xs text-muted-foreground">
                Waiting for QR code...
              </p>
            </>
          ) : bridgeStatus === 'error' ? (
            <>
              <Smartphone className="h-12 w-12 text-destructive/50" />
              <p className="text-sm text-destructive text-center">
                Failed to start bridge. Try again.
              </p>
            </>
          ) : (
            <>
              <Smartphone className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground text-center">
                Click below to start a pairing session
              </p>
            </>
          )}
        </div>

        {/* Instructions */}
        <div className="rounded-lg bg-secondary/50 p-3">
          <p className="text-xs font-medium text-foreground mb-2">How to connect:</p>
          <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
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
            className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:bg-[#25D366]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {bridgeStatus === 'starting' && <Loader2 className="h-4 w-4 animate-spin" />}
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
