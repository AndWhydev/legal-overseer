'use client'

import Link from 'next/link'
import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BitBitLogoVideo } from '@/components/chat/bitbit-logo-video'

type LoginStatus = 'idle' | 'loading' | 'sent' | 'error'
type LoginMethod = 'email' | 'google' | 'apple' | null
type OAuthProvider = 'google' | 'apple'

function resolveAuthRedirectOrigin(): string {
  if (typeof window === 'undefined') {
    return 'https://app.bitbit.chat'
  }

  const { hostname, origin } = window.location

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local')
  ) {
    return origin
  }

  if (hostname === 'app.bitbit.chat') {
    return 'https://app.bitbit.chat'
  }

  if (hostname === 'bitbit.chat' || hostname.endsWith('.bitbit.chat')) {
    return 'https://app.bitbit.chat'
  }

  return origin
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M12 10.2v3.98h5.57c-.24 1.28-.97 2.37-2.05 3.11l3.32 2.58c1.93-1.78 3.04-4.39 3.04-7.49 0-.73-.07-1.44-.2-2.13H12z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.89 6.63-2.41l-3.32-2.58c-.92.62-2.1.99-3.31.99-2.54 0-4.69-1.72-5.46-4.03l-3.43 2.65A10 10 0 0012 22z"
      />
      <path
        fill="#4A90E2"
        d="M6.54 13.97A5.98 5.98 0 016.2 12c0-.68.12-1.34.34-1.97L3.11 7.38A10 10 0 002 12c0 1.61.38 3.14 1.11 4.62l3.43-2.65z"
      />
      <path
        fill="#FBBC05"
        d="M12 6c1.47 0 2.8.51 3.84 1.5l2.88-2.88A9.95 9.95 0 0012 2a10 10 0 00-8.89 5.38l3.43 2.65C7.31 7.72 9.46 6 12 6z"
      />
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.36 12.48c.02 2.26 1.98 3.01 2 3.02-.01.05-.31 1.06-1.03 2.11-.62.9-1.27 1.8-2.28 1.82-1 .02-1.32-.59-2.47-.59-1.14 0-1.5.57-2.45.61-1 .04-1.75-.99-2.38-1.88-1.29-1.86-2.27-5.25-.95-7.56.66-1.14 1.84-1.86 3.12-1.88.97-.02 1.89.65 2.47.65.57 0 1.66-.8 2.8-.68.48.02 1.84.2 2.72 1.48-.07.04-1.62.95-1.6 2.9zm-2.4-5.32c.52-.63.87-1.5.77-2.37-.75.03-1.65.5-2.2 1.12-.48.56-.9 1.44-.79 2.28.84.06 1.7-.43 2.22-1.03z"
      />
    </svg>
  )
}

function LoginPageContent() {
  const searchParams = useSearchParams()
  const queryError = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<LoginStatus>(queryError ? 'error' : 'idle')
  const [activeMethod, setActiveMethod] = useState<LoginMethod>(null)
  const [errorMessage, setErrorMessage] = useState(
    queryError
      ? 'Your previous sign-in attempt could not be completed. Please try again.'
      : ''
  )
  const [sentTo, setSentTo] = useState('')

  const isBusy = activeMethod !== null
  const canSubmit = email.trim().length > 3 && !isBusy

  const logoVariant = useMemo(() => {
    if (status === 'loading') return 'loading'
    if (status === 'sent') return 'pulse'
    return 'idle'
  }, [status])

  async function handleOAuthSignIn(provider: OAuthProvider) {
    setActiveMethod(provider)
    setStatus('loading')
    setErrorMessage('')

    const supabase = createClient()
    if (!supabase) {
      setStatus('error')
      setErrorMessage('Supabase is not configured for this environment.')
      setActiveMethod(null)
      return
    }

    const redirectOrigin = resolveAuthRedirectOrigin()
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${redirectOrigin}/callback`,
      },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      setActiveMethod(null)
    }
  }

  async function handleEmailSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || isBusy) return

    setActiveMethod('email')
    setStatus('loading')
    setErrorMessage('')

    const redirectOrigin = resolveAuthRedirectOrigin()

    try {
      const res = await fetch('/api/auth/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          redirectTo: `${redirectOrigin}/callback`,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Unknown error' }))
        setStatus('error')
        setErrorMessage(
          data.error === 'not_registered'
            ? 'This email isn\u2019t registered. BitBit is invite-only \u2014 contact your administrator to get access.'
            : data.error || 'Failed to send sign-in email',
        )
        setActiveMethod(null)
        return
      }
    } catch {
      setStatus('error')
      setErrorMessage('Network error. Please try again.')
      setActiveMethod(null)
      return
    }

    setSentTo(normalizedEmail)
    setStatus('sent')
    setActiveMethod(null)
  }

  return (
    <div className="bb-auth-page bb-backdrop">
      <div className="bb-auth-page__aura bb-auth-page__aura--one" aria-hidden="true" />
      <div className="bb-auth-page__aura bb-auth-page__aura--two" aria-hidden="true" />

      <div className="bb-auth-page__ambient-logo" aria-hidden="true">
        <BitBitLogoVideo size={108} variant={logoVariant} />
      </div>
      <div className="bb-auth-page__noise" aria-hidden="true" />

      <main className="bb-auth-page__content bb-stagger">
        <section className="bb-auth-page__hero" aria-label="BitBit sign in">
          <h1 className="bb-auth-page__title">Sign in to BitBit</h1>
        </section>

        <section className="bb-card bb-auth-card" aria-live="polite">
          {status === 'sent' ? (
            <div className="bb-auth-card__sent">
              <p className="bb-auth-card__sent-title">Check your inbox</p>
              <p className="bb-auth-card__sent-copy">
                We sent a sign-in link to <span>{sentTo}</span>. Open your email and continue from that link.
              </p>
              <button
                type="button"
                className="bb-btn bb-btn--ghost bb-auth-card__ghost"
                onClick={() => {
                  setStatus('idle')
                  setErrorMessage('')
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form className="bb-auth-card__form" onSubmit={handleEmailSignIn}>
              <div className="bb-auth-card__providers" role="group" aria-label="Social sign in">
                <button
                  type="button"
                  className="bb-auth-provider-btn"
                  onClick={() => void handleOAuthSignIn('google')}
                  disabled={isBusy}
                >
                  <span className="bb-auth-provider-btn__icon" aria-hidden="true"><GoogleIcon /></span>
                  Continue with Google
                </button>

                <button
                  type="button"
                  className="bb-auth-provider-btn"
                  onClick={() => void handleOAuthSignIn('apple')}
                  disabled={isBusy}
                >
                  <span className="bb-auth-provider-btn__icon" aria-hidden="true"><AppleIcon /></span>
                  Continue with Apple
                </button>
              </div>

              <div className="bb-auth-card__divider" aria-hidden="true">
                <span>or continue with email</span>
              </div>

              <label htmlFor="email" className="bb-auth-card__label">
                Email address
              </label>
              <input
                id="email"
                type="email"
                className="bb-input bb-input--lg bb-auth-card__input"
                placeholder="you@app.bitbit.chat"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoFocus
                autoComplete="email"
                disabled={isBusy}
              />

              {status === 'error' && (
                <p className="bb-auth-card__error">{errorMessage}</p>
              )}

              <button
                type="submit"
                className="bb-auth-card__submit"
                disabled={!canSubmit}
              >
                {activeMethod === 'email' ? 'Sending sign-in email...' : 'Continue with email'}
              </button>

              <p className="bb-auth-card__privacy">
                By continuing, you agree to our <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms</Link>.
              </p>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}

function LoginPageFallback() {
  return (
    <div className="bb-auth-page bb-backdrop">
      <div className="bb-auth-page__aura bb-auth-page__aura--one" aria-hidden="true" />
      <div className="bb-auth-page__aura bb-auth-page__aura--two" aria-hidden="true" />
      <div className="bb-auth-page__ambient-logo" aria-hidden="true">
        <BitBitLogoVideo size={108} variant="idle" />
      </div>
      <div className="bb-auth-page__noise" aria-hidden="true" />

      <main className="bb-auth-page__content bb-stagger">
        <section className="bb-auth-page__hero" aria-label="BitBit sign in">
          <h1 className="bb-auth-page__title">Sign in to BitBit</h1>
        </section>
        <section className="bb-card bb-auth-card" aria-live="polite">
          <p className="bb-auth-card__privacy">Loading sign-in...</p>
        </section>
      </main>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  )
}
