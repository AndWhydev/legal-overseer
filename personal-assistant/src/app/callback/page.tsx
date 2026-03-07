'use client'

import { useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { logger } from '@/lib/core/logger'
import { completeBrowserAuthFromUrl } from '@/lib/auth/browser-callback'

export default function CallbackPage() {
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    async function completeAuth() {
      const result = await completeBrowserAuthFromUrl(
        supabase,
        window.location.href,
        logger,
      )

      if (result.kind === 'redirect') {
        window.location.replace(result.destination)
      }
    }

    void completeAuth()
  }, [])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p>Signing in…</p>
    </div>
  )
}
