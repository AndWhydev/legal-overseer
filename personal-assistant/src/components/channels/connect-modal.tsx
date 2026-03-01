'use client'

import { useState } from 'react'
import { CreditCard, Phone, Loader2, QrCode, Smartphone } from 'lucide-react'
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

      if (res.ok && data.success) {
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
  const [initiating, setInitiating] = useState(false)
  const [sessionStarted, setSessionStarted] = useState(false)

  async function handleInitiate() {
    setInitiating(true)
    try {
      const res = await fetch('/api/channels/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      })
      const data = await res.json()

      if (res.ok && data.success) {
        setSessionStarted(true)
        // In Phase 15, this will poll for QR code and connection status
        // For now, just mark as initiated
        onSuccess()
      } else {
        onError(data.error || `Failed to start ${channelName} pairing`)
      }
    } catch {
      onError(`Network error connecting ${channelName}`)
    } finally {
      setInitiating(false)
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
        {/* QR Code placeholder */}
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-secondary/30 p-8">
          {sessionStarted ? (
            <>
              <div className="flex h-40 w-40 items-center justify-center rounded-lg bg-white">
                <QrCode className="h-24 w-24 text-gray-300" />
              </div>
              <p className="text-xs text-muted-foreground">
                QR code generation available in Phase 15 (Baileys bridge)
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
            disabled={initiating || sessionStarted}
            className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:bg-[#25D366]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {initiating && <Loader2 className="h-4 w-4 animate-spin" />}
            {initiating ? 'Starting...' : sessionStarted ? 'Session Active' : 'Start Pairing'}
          </button>
        </div>
      </div>
    </>
  )
}
