'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { motion, AnimatePresence } from 'motion/react'
import { OnboardingChat } from '@/components/onboarding/onboarding-chat'
import { loadOnboardingProfile } from '@/lib/onboarding/profile'
import { hasCompletedFirstRunOnboarding, getWorkspaceId } from '@/lib/onboarding/state'
import { trackOnboardingEvent } from '@/lib/onboarding/analytics'

type PageState = 'loading' | 'onboarding' | 'transitioning'

export default function OnboardPage() {
  const router = useRouter()
  const [state, setState] = useState<PageState>('loading')
  const [hasConnection, setHasConnection] = useState(false)

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    async function bootstrap() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: profile } = await loadOnboardingProfile(supabase as never, user.id)

      if (hasCompletedFirstRunOnboarding(profile)) {
        router.replace('/dashboard')
        return
      }

      // Check if user has any connected channels
      const workspaceId = getWorkspaceId(profile)
      if (workspaceId) {
        const { data: connections } = await supabase
          .from('channel_connections')
          .select('channel_type')
          .eq('org_id', workspaceId)
          .eq('status', 'connected')
          .limit(1)

        if (connections && connections.length > 0) {
          setHasConnection(true)
        }
      }

      // Detect OAuth return
      const params = new URLSearchParams(window.location.search)
      const justConnected = params.get('connected')
      if (justConnected) {
        setHasConnection(true)
        window.history.replaceState({}, '', '/onboard')
      }

      trackOnboardingEvent('onboarding_started')
      setState('onboarding')
    }

    void bootstrap()
  }, [router])

  const handleComplete = useCallback(async (threadId: string) => {
    setState('transitioning')
    trackOnboardingEvent('onboarding_completed')

    await fetch('/api/profile/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboarding_completed: true, onboarding_stage: 'complete' }),
    }).catch(() => {})

    await new Promise(resolve => setTimeout(resolve, 1500))

    router.replace(`/dashboard?tab=chat&conversation=${threadId}`)
  }, [router])

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-background">
        <p className="text-sm text-muted-foreground">One moment...</p>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background relative">
      <AnimatePresence>
        {state === 'onboarding' && (
          <motion.div
            className="fixed inset-0 z-50"
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <OnboardingChat
              hasConnection={hasConnection}
              onComplete={handleComplete}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {state === 'transitioning' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-background"
        >
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-muted-foreground"
          >
            Setting up your dashboard...
          </motion.p>
        </motion.div>
      )}
    </div>
  )
}
