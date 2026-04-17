'use client'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { createBrowserClient } from '@supabase/ssr'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BridgePairingPanel, type FlyBridgeProtocol } from '@/components/onboarding/bridge-pairing-panel'
import { TelegramPairingPanel } from '@/components/onboarding/telegram-pairing-panel'
import { trackOnboardingEvent } from '@/lib/onboarding/analytics'

/**
 * /onboard/connect/[surface] — post-chat pairing for non-web surfaces.
 *
 * The onboarding chat at /onboard captures `primary_chat_surface` on the
 * profile. This page picks it up and drives the actual pairing:
 *
 *   imessage           → BridgePairingPanel (Apple ID + noVNC)
 *   whatsapp           → BridgePairingPanel (QR code)
 *   android-messages   → BridgePairingPanel (QR code)
 *   telegram           → TelegramPairingPanel (bot deep-link)
 *
 * On success we mark onboarding_completed and route to the dashboard.
 * On skip we mark completed anyway — user can pair later from settings.
 */

type Surface = FlyBridgeProtocol | 'telegram'

const SURFACE_LABELS: Record<Surface, string> = {
  imessage: 'iMessage',
  whatsapp: 'WhatsApp',
  'android-messages': 'Android Messages',
  telegram: 'Telegram',
}

const SURFACE_BLURBS: Record<Surface, string> = {
  imessage:
    "Let's get BitBit onto iMessage. We spin up a fresh Mac in the cloud and sign in to Messages with your Apple ID — takes about a minute.",
  whatsapp:
    "Let's link BitBit to WhatsApp. Scan the QR code with your phone and you'll be able to text BitBit from WhatsApp like any other contact.",
  'android-messages':
    "Let's link BitBit to Android Messages. Scan the QR code with your phone and you'll be able to text BitBit from Messages like any other contact.",
  telegram:
    "Let's find BitBit on Telegram. Open the bot, tap Start, and we'll connect the chat to this account.",
}

function isSurface(value: string): value is Surface {
  return value === 'imessage' || value === 'whatsapp' || value === 'android-messages' || value === 'telegram'
}

export default function ConnectSurfacePage({
  params,
}: {
  params: Promise<{ surface: string }>
}) {
  const { surface: surfaceParam } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [emailHint, setEmailHint] = useState<string | undefined>(undefined)

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    void (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      // Pre-fill Apple ID email from auth.email for iMessage — saves the user
      // retyping when most of them use the same address.
      if (surfaceParam === 'imessage' && user.email) {
        setEmailHint(user.email)
      }

      setLoading(false)
    })()
  }, [router, surfaceParam])

  const markCompletedAndGo = useCallback(
    async (outcome: 'linked' | 'skipped') => {
      try {
        await fetch('/api/profile/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ onboarding_completed: true, onboarding_stage: 'complete' }),
        })
      } catch {
        // Non-fatal — user still gets to the dashboard.
      }

      trackOnboardingEvent(outcome === 'linked' ? 'chat_surface_connected' : 'onboarding_completed')

      router.replace('/dashboard')
    },
    [router],
  )

  if (!isSurface(surfaceParam)) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <Card className="max-w-md p-8 text-center">
          <h1 className="mb-2 text-xl font-semibold">Unknown surface</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            {`"${surfaceParam}" isn't a chat surface we recognise.`}
          </p>
          <Button onClick={() => router.replace('/onboard')}>Back to setup</Button>
        </Card>
      </div>
    )
  }

  const surface: Surface = surfaceParam

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">One moment…</p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-6 py-10 md:py-16">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Connect your chat surface
          </p>
          <h1 className="mb-3 text-2xl font-semibold md:text-3xl">
            {SURFACE_LABELS[surface]}
          </h1>
          <p className="mb-8 text-sm text-muted-foreground md:text-base">
            {SURFACE_BLURBS[surface]}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="flex-1"
        >
          <Card className="p-6 md:p-8">
            {surface === 'telegram' ? (
              <TelegramPairingPanel
                onLinked={() => void markCompletedAndGo('linked')}
                onSkip={() => void markCompletedAndGo('skipped')}
              />
            ) : (
              <BridgePairingPanel
                protocol={surface}
                initialAppleIdEmail={emailHint}
                onLinked={() => void markCompletedAndGo('linked')}
                onSkip={() => void markCompletedAndGo('skipped')}
              />
            )}
          </Card>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Changed your mind? You can pair a different surface later from{' '}
            <button
              type="button"
              onClick={() => void markCompletedAndGo('skipped')}
              className="underline underline-offset-2 hover:text-foreground"
            >
              Settings → Connections
            </button>
            .
          </p>
        </motion.div>
      </div>
    </div>
  )
}
