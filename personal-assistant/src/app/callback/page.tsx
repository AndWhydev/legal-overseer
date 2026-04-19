'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { logger } from '@/lib/core/logger'
import { extractAuthCallbackPayload } from '@/lib/auth/callback'
import { buildLoginErrorRedirect } from '@/lib/auth/login-redirect'
import { loadOnboardingProfile } from '@/lib/onboarding/profile'
import { getCanonicalOnboardingRedirect } from '@/lib/onboarding/state'
import { consumePendingTier } from '@/lib/billing/pending-tier'
import { startCheckoutRedirect } from '@/lib/billing/start-checkout-browser'

export default function CallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const payload = extractAuthCallbackPayload(window.location.href)

    // Supabase (and the upstream OAuth provider) redirects back here with
    // ?error=...&error_description=... when the OAuth handshake fails. Catch
    // those before treating them as a generic "no tokens" case so the user
    // sees the real reason (e.g. "Unsupported provider: provider is not enabled").
    function extractOAuthError(href: string): string | null {
      try {
        const url = new URL(href)
        const hash = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash)
        const qs = url.searchParams
        const description =
          hash.get('error_description') ??
          qs.get('error_description') ??
          hash.get('error') ??
          qs.get('error')
        return description ? description.replace(/\+/g, ' ') : null
      } catch {
        return null
      }
    }

    async function completeAuth() {
      if (payload.kind === 'none') {
        const oauthError = extractOAuthError(window.location.href)
        router.replace(
          buildLoginErrorRedirect(
            'callback_missing',
            oauthError ?? 'No auth tokens in callback URL',
          ),
        )
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
          router.replace(buildLoginErrorRedirect('set_session', error?.message))
          return
        }

        userId = data.user.id
      }

      if (payload.kind === 'exchange_code') {
        const { error, data } = await supabase.auth.exchangeCodeForSession(payload.code)

        if (error || !data.user) {
          logger.error('exchangeCodeForSession error:', error)
          router.replace(buildLoginErrorRedirect('exchange_code', error?.message))
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
          router.replace(buildLoginErrorRedirect('otp_verify', error?.message))
          return
        }

        userId = data.user.id
      }

      if (!userId) {
        router.replace(buildLoginErrorRedirect('no_user'))
        return
      }

      // Signup flows stash a selected tier before the OAuth round-trip;
      // honour it by kicking off checkout before we bother loading the
      // onboarding profile (paying users are redirected to Stripe anyway).
      const pendingTier = consumePendingTier()
      if (pendingTier && (await startCheckoutRedirect(pendingTier)).ok) return

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
