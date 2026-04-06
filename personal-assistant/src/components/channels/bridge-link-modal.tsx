'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, AlertCircle, Smartphone } from 'lucide-react'

type BridgeProtocol = 'imessage' | 'whatsapp' | 'android-messages'
type LinkingState = 'idle' | 'provisioning' | 'linking' | 'connected' | 'error'
type SignInState = 'waiting_for_password' | 'waiting_for_2fa' | 'verifying' | 'connected' | 'error'

interface VncInfo {
  ip: string
  port: number
  password: string
}

interface BridgeLinkModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  protocol: BridgeProtocol
  onSuccess: () => void
}

const PROTOCOL_CONFIG: Record<BridgeProtocol, {
  name: string
  icon: string
  color: string
  instructions: string[]
}> = {
  imessage: {
    name: 'iMessage',
    icon: '💬',
    color: '#34C759',
    instructions: [
      'Enter your Apple ID email address',
      'Sign in to Messages on the remote Mac',
      'Approve the 2FA prompt on your Apple device',
    ],
  },
  whatsapp: {
    name: 'WhatsApp',
    icon: '📱',
    color: '#25D366',
    instructions: [
      'Open WhatsApp on your phone',
      'Go to Settings → Linked Devices',
      'Tap "Link a Device"',
      'Scan the QR code below',
    ],
  },
  'android-messages': {
    name: 'Android Messages',
    icon: '💬',
    color: '#1A73E8',
    instructions: [
      'Open Messages on your Android phone',
      'Tap ⋮ (menu) → Device pairing',
      'Tap "QR code scanner"',
      'Scan the QR code below',
    ],
  },
}

const SIGN_IN_STATE_LABELS: Record<SignInState, string> = {
  waiting_for_password: 'Enter your Apple ID credentials in Messages...',
  waiting_for_2fa: 'Check your Apple device for the 2FA code...',
  verifying: 'Verifying with Apple...',
  connected: 'Apple ID connected!',
  error: 'Sign-in failed. Try again.',
}

export function BridgeLinkModal({ open, onOpenChange, protocol, onSuccess }: BridgeLinkModalProps) {
  const [state, setState] = useState<LinkingState>('idle')
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [qrData, setQrData] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // iMessage fields
  const [appleIdEmail, setAppleIdEmail] = useState('')
  const [vncInfo, setVncInfo] = useState<VncInfo | null>(null)
  const [signInState, setSignInState] = useState<SignInState>('waiting_for_password')
  const [showFullDesktop, setShowFullDesktop] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const vncContainerRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<unknown>(null)
  const config = PROTOCOL_CONFIG[protocol]

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!open) {
      cleanup()
      setState('idle')
      setConnectionId(null)
      setQrData(null)
      setError(null)
      setAppleIdEmail('')
      setVncInfo(null)
      setSignInState('waiting_for_password')
      setShowFullDesktop(false)
    }
  }, [open, cleanup])

  useEffect(() => {
    return cleanup
  }, [cleanup])

  // Connect noVNC when vncInfo becomes available and we're in linking state
  useEffect(() => {
    if (state !== 'linking' || protocol !== 'imessage' || !vncInfo || !vncContainerRef.current) {
      return
    }

    let cancelled = false

    const connectVnc = async () => {
      try {
        const { default: RFB } = await import('@novnc/novnc/lib/rfb')
        if (cancelled || !vncContainerRef.current) return

        // Clean up any existing connection
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
        if (!cancelled) {
          console.error('[noVNC] connection failed', err)
        }
      }
    }

    connectVnc()

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
  }, [state, protocol, vncInfo, showFullDesktop])

  const startProvisioning = async () => {
    setState('provisioning')
    setError(null)

    try {
      const body: Record<string, string> = { protocol }
      if (protocol === 'imessage' && appleIdEmail) {
        body.apple_id_email = appleIdEmail
      }

      const res = await fetch('/api/bridges/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to provision bridge')
      }

      const data = await res.json()
      setConnectionId(data.connection_id)

      // Parse VNC info from provision response for iMessage
      if (protocol === 'imessage' && data.link_data?.vnc) {
        setVncInfo(data.link_data.vnc as VncInfo)
      }

      setState('linking')

      // Start polling for link status
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch('/api/bridges/link-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ connection_id: data.connection_id }),
          })

          if (statusRes.ok) {
            const statusData = await statusRes.json()

            // Update QR data whenever the bridge delivers one (non-iMessage)
            if (statusData.qr) {
              setQrData(statusData.qr)
            }

            // iMessage: update VNC info and sign-in state from polling
            if (protocol === 'imessage') {
              if (statusData.vnc) {
                setVncInfo(statusData.vnc as VncInfo)
              }
              if (statusData.sign_in_state) {
                setSignInState(statusData.sign_in_state as SignInState)
              }
            }

            if (statusData.status === 'linked') {
              cleanup()
              setState('connected')
              setTimeout(() => {
                onSuccess()
                onOpenChange(false)
              }, 1500)
            } else if (statusData.status === 'error') {
              cleanup()
              setState('error')
              setError(statusData.error || 'Linking failed')
            }
          }
        } catch {
          // Polling error, continue
        }
      }, 2500)
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Provisioning failed')
    }
  }

  const isImessage = protocol === 'imessage'
  const showVnc = state === 'linking' && isImessage
  const modalWidth = showVnc ? 'sm:max-w-2xl' : 'sm:max-w-md'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={modalWidth}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{config.icon}</span>
            Connect {config.name}
          </DialogTitle>
          <DialogDescription>
            Link your {config.name} account to BitBit
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          {/* Idle state — show instructions and start button */}
          {state === 'idle' && (
            <>
              <div className="space-y-2">
                {config.instructions.map((instruction, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {i + 1}
                    </span>
                    {instruction}
                  </div>
                ))}
              </div>

              {/* iMessage: Apple ID email input before start */}
              {isImessage && (
                <Input
                  placeholder="Apple ID email"
                  value={appleIdEmail}
                  onChange={e => setAppleIdEmail(e.target.value)}
                  type="email"
                />
              )}

              <Button className="w-full" onClick={startProvisioning} disabled={isImessage && !appleIdEmail}>
                <Smartphone className="mr-2 h-4 w-4" />
                Start Connection
              </Button>
            </>
          )}

          {/* Provisioning state — spinner */}
          {state === 'provisioning' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Setting up your bridge...</p>
            </div>
          )}

          {/* Linking state — noVNC viewer for iMessage */}
          {showVnc && (
            <div className="space-y-3">
              <div
                ref={vncContainerRef}
                className="relative w-full overflow-hidden rounded-lg border border-border bg-black"
                style={{ height: showFullDesktop ? '480px' : '320px' }}
              >
                {!vncInfo && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Badge variant="outline" className="gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {SIGN_IN_STATE_LABELS[signInState]}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Sign in to Messages with <strong>{appleIdEmail}</strong> using the remote desktop above.
                </p>
              </div>

              <button
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={() => setShowFullDesktop(v => !v)}
              >
                {showFullDesktop ? 'Show compact view' : 'Having trouble? Show full desktop'}
              </button>
            </div>
          )}

          {/* Linking state — QR code for WhatsApp/Android Messages */}
          {state === 'linking' && !isImessage && (
            <div className="flex flex-col items-center gap-3">
              <div className="flex h-48 w-48 items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted">
                {qrData ? (
                  <img src={qrData} alt="QR Code" className="h-full w-full rounded-lg" />
                ) : (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                )}
              </div>
              <Badge variant="outline" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Waiting for scan...
              </Badge>
            </div>
          )}

          {/* Connected state — success */}
          {state === 'connected' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="text-sm font-medium">{config.name} connected!</p>
              <p className="text-xs text-muted-foreground">Messages will appear in your inbox shortly.</p>
            </div>
          )}

          {/* Error state */}
          {state === 'error' && (
            <div className="flex flex-col items-center gap-3 py-6">
              <AlertCircle className="h-10 w-10 text-red-500" />
              <p className="text-sm text-red-500">{error || 'Something went wrong'}</p>
              <Button variant="outline" onClick={() => { setState('idle'); setError(null) }}>
                Try Again
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
