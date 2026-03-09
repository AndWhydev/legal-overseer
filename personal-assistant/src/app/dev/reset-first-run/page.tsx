'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetFirstRunPage() {
  const router = useRouter()
  const [message, setMessage] = useState('Resetting your account for a fresh first run')

  useEffect(() => {
    let active = true

    async function run() {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = supabase ? await supabase.auth.getUser() : { data: { user: null } }

        if (!user?.email) {
          throw new Error('No signed in user found')
        }

        setMessage('Resetting account state')
        await fetch('/api/auth/e2e/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email }),
        })

        try {
          window.localStorage.removeItem('bb-onboarding-complete')
        } catch {
          // ignore
        }

        setMessage('Signing out this browser')
        await fetch('/auth/signout', { method: 'POST' })
      } catch {
        if (!active) return
        setMessage('Could not complete the reset automatically Please sign out and try again')
        return
      }

      if (!active) return
      setMessage('Fresh first run ready Redirecting to login')
      router.replace('/login')
    }

    void run()

    return () => {
      active = false
    }
  }, [router])

  return (
    <main className="bb-auth-page bb-backdrop">
      <div className="bb-auth-page__aura bb-auth-page__aura--one" aria-hidden="true" />
      <div className="bb-auth-page__aura bb-auth-page__aura--two" aria-hidden="true" />
      <div className="bb-auth-page__noise" aria-hidden="true" />

      <section className="bb-auth-page__content">
        <div className="bb-card bb-auth-card">
          <p className="bb-auth-card__sent-title">Preparing a fresh first run</p>
          <p className="bb-auth-card__sent-copy">{message}</p>
        </div>
      </section>
    </main>
  )
}
