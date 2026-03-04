'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

export default function CallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (!accessToken || !refreshToken) {
      router.replace('/login?error=auth')
      return
    }

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    }).then(async ({ error, data }) => {
      if (error || !data.user) {
        console.error('setSession error:', error)
        router.replace('/login?error=auth')
        return
      }

      // Check if user already has an org profile.
      // New users have no profile row → send to onboarding.
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, org_id')
        .eq('id', data.user.id)
        .maybeSingle()

      if (profileErr) {
        console.warn('Profile check failed, going to dashboard anyway:', profileErr.message)
        router.replace('/dashboard')
        return
      }

      if (!profile?.org_id) {
        // No org — first-time user, kick off workspace setup
        router.replace('/onboard')
      } else {
        router.replace('/dashboard')
      }
    })
  }, [router])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p>Signing in…</p>
    </div>
  )
}
