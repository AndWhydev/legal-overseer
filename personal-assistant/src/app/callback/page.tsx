'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { logger } from '@/lib/core/logger'
import { extractAuthCallbackPayload } from '@/lib/auth/callback'
import { loadOnboardingProfile } from '@/lib/onboarding/profile'
import { getCanonicalOnboardingRedirect } from '@/lib/onboarding/state'

export default function CallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const payload = extractAuthCallbackPayload(window.location.href)

    async function completeAuth() {
      if (payload.kind === 'none') {
        router.replace('/login?error=auth')
        return
      }

      let userId: string | null = null

      if (payload.kind === 'session_tokens') {
        const { error, data } = await supabase.auth.setSession({
          access_token: payload.accessToken,
          refresh_token: payload.refreshToken,
        })

        if (error || !data.user) {
          logger.error('setSession error:', error)
          router.replace('/login?error=auth')
          return
        }

        userId = data.user.id
      }

      if (payload.kind === 'exchange_code') {
        const { error, data } = await supabase.auth.exchangeCodeForSession(payload.code)

        if (error || !data.user) {
          logger.error('exchangeCodeForSession error:', error)
          router.replace('/login?error=auth')
          return
        }

        userId = data.user.id
      }

      if (payload.kind === 'verify_token_hash') {
        const { error, data } = await supabase.auth.verifyOtp({
          token_hash: payload.tokenHash,
          type: payload.type,
        })

        if (error || !data.user) {
          logger.error('verifyOtp error:', error)
          router.replace('/login?error=auth')
          return
        }

        userId = data.user.id
      }

      if (!userId) {
        router.replace('/login?error=auth')
        return
      }

      const { data: profile, error: profileErr } = await loadOnboardingProfile(
        supabase as any,
        userId,
        { includeId: true },
      )

      if (profileErr) {
        logger.warn('Profile check failed, going to dashboard anyway:', profileErr.message)
        router.replace('/dashboard')
        return
      }

      router.replace(getCanonicalOnboardingRedirect(profile))
    }

    void completeAuth()
  }, [router])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p>Signing in…</p>
    </div>
  )
}
