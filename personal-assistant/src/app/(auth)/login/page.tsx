'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BitBitLogoVideo } from '@/components/chat/bitbit-logo-video'
import { ForceFieldBackground } from '@/components/ui/force-field-background'
import { extractAuthCallbackPayload } from '@/lib/auth/callback'

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
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
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
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M16.36 12.48c.02 2.26 1.98 3.01 2 3.02-.01.05-.31 1.06-1.03 2.11-.62.9-1.27 1.8-2.28 1.82-1 .02-1.32-.59-2.47-.59-1.14 0-1.5.57-2.45.61-1 .04-1.75-.99-2.38-1.88-1.29-1.86-2.27-5.25-.95-7.56.66-1.14 1.84-1.86 3.12-1.88.97-.02 1.89.65 2.47.65.57 0 1.66-.8 2.8-.68.48.02 1.84.2 2.72 1.48-.07.04-1.62.95-1.6 2.9zm-2.4-5.32c.52-.63.87-1.5.77-2.37-.75.03-1.65.5-2.2 1.12-.48.56-.9 1.44-.79 2.28.84.06 1.7-.43 2.22-1.03z"
      />
    </svg>
  )
}

/* ── Spinner for loading states ── */
function Spinner() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      style={{ animation: 'bb-login-spin 0.7s linear infinite' }}
    >
      <circle cx="9" cy="9" r="7" stroke="rgba(0,0,0,0.1)" strokeWidth="2" />
      <path
        d="M9 2a7 7 0 0 1 7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
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
      ? 'Couldn\'t complete sign-in. Use the email linked to your BitBit invite.'
      : ''
  )
  const [sentTo, setSentTo] = useState('')

  const isBusy = activeMethod !== null
  const canSubmit = email.trim().length > 3 && !isBusy

  useEffect(() => {
    const payload = extractAuthCallbackPayload(window.location.href)

    if (payload.kind === 'none') {
      return
    }

    const nextUrl = `/callback${window.location.search}${window.location.hash}`
    window.location.replace(nextUrl)
  }, [])

  async function handleOAuthSignIn(provider: OAuthProvider) {
    setActiveMethod(provider)
    setStatus('loading')
    setErrorMessage('')

    const supabase = createClient()
    if (!supabase) {
      setStatus('error')
      setErrorMessage('Supabase is not configured for this environment')
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
            ? 'No invite found for this email. Try the address you were invited with, or ask your admin.'
            : data.error || 'Couldn\'t send the sign-in link. Try again.',
        )
        setActiveMethod(null)
        return
      }
    } catch {
      setStatus('error')
      setErrorMessage('Network issue. Try again.')
      setActiveMethod(null)
      return
    }

    setSentTo(normalizedEmail)
    setStatus('sent')
    setActiveMethod(null)
  }

  return (
    <div style={{
      position: 'relative',
      minHeight: '100dvh',
      width: '100%',
      overflow: 'hidden',
      background: '#FAFAFA',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      colorScheme: 'light',
    }}>
      {/* ── Particle background (white bg, black dots) ── */}
      <ForceFieldBackground
        spacing={16}
        minStroke={1}
        maxStroke={2.5}
        forceStrength={14}
        magnifierRadius={160}
        friction={0.88}
        restoreSpeed={0.04}
        bgColor="#FAFAFA"
        particleRgb="0,0,0"
      />

      {/* ── Subtle radial vignette (light) ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 40%, transparent 0%, rgba(250,250,250,0.4) 60%, rgba(250,250,250,0.8) 100%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* ── Edge light reflections ── */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'hidden' }}>
        {/* Top-left */}
        <div style={{
          position: 'absolute',
          top: -80,
          left: -80,
          width: 260,
          height: 260,
          background: 'radial-gradient(circle, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 70%)',
          filter: 'blur(40px)',
        }} />
        {/* Top-right */}
        <div style={{
          position: 'absolute',
          top: -60,
          right: -60,
          width: 200,
          height: 200,
          background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 70%)',
          filter: 'blur(35px)',
        }} />
        {/* Bottom-left */}
        <div style={{
          position: 'absolute',
          bottom: -60,
          left: -40,
          width: 200,
          height: 200,
          background: 'radial-gradient(circle, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 70%)',
          filter: 'blur(35px)',
        }} />
        {/* Bottom-right */}
        <div style={{
          position: 'absolute',
          bottom: -80,
          right: -80,
          width: 260,
          height: 260,
          background: 'radial-gradient(circle, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 70%)',
          filter: 'blur(40px)',
        }} />
      </div>

      {/* ── Main content ── */}
      <main
        style={{
          position: 'relative',
          zIndex: 2,
          width: '100%',
          maxWidth: 420,
          padding: 'clamp(20px, 4vw, 40px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
        }}
      >
        {/* ── Logo (black silhouette) ── */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bitbit-idle.apng"
          alt="BitBit"
          width={80}
          height={80}
          style={{
            width: 80,
            height: 80,
            objectFit: 'contain',
            display: 'block',
            filter: 'brightness(0)',
            opacity: 0.85,
            flexShrink: 0,
          }}
        />

        {/* ── Heading with gradient text ── */}
        <header style={{ textAlign: 'center' }}>
          <h1 style={{
            margin: 0,
            fontSize: 'clamp(28px, 5vw, 36px)',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            background: 'linear-gradient(180deg, #6b6b6b 0%, #1d1d1f 50%, #000 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Meet BitBit
          </h1>
          <p style={{
            margin: '8px 0 0',
            fontSize: 14,
            color: '#888',
            lineHeight: 1.4,
          }}>
            Sign in with your invited email
          </p>
        </header>

        {/* ── Auth card ── */}
        <section
          aria-live="polite"
          style={{
            width: '100%',
            padding: 24,
            borderRadius: 20,
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(20px) saturate(1.1)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.1)',
            border: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          {status === 'sent' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }}>
              <p style={{ fontSize: 18, fontWeight: 600, color: '#111', margin: 0 }}>
                Check your inbox
              </p>
              <p style={{ fontSize: 13, color: '#666', margin: 0, lineHeight: 1.5 }}>
                We sent a sign-in link to{' '}
                <span style={{ color: '#111', fontFamily: 'var(--font-mono, monospace)' }}>{sentTo}</span>.
                Open that inbox to continue.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStatus('idle')
                  setErrorMessage('')
                }}
                style={{
                  background: 'none',
                  border: '1px solid #ddd',
                  borderRadius: 12,
                  padding: '10px 16px',
                  color: '#555',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'border-color 150ms, color 150ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#bbb'
                  e.currentTarget.style.color = '#111'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#ddd'
                  e.currentTarget.style.color = '#555'
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleEmailSignIn}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              {/* ── Hint ── */}
              <p style={{
                margin: 0,
                fontSize: 12,
                color: '#999',
                textAlign: 'center',
                lineHeight: 1.4,
              }}>
                Use the sign-in method linked to your invite
              </p>

              {/* ── OAuth providers ── */}
              <div
                role="group"
                aria-label="Social sign in"
                data-login-providers=""
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => void handleOAuthSignIn('google')}
                  disabled={isBusy}
                  aria-label="Continue with Google"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    minHeight: 44,
                    borderRadius: 12,
                    border: '1px solid #e0e0e0',
                    background: '#fff',
                    color: '#333',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: isBusy ? 'not-allowed' : 'pointer',
                    opacity: isBusy && activeMethod !== 'google' ? 0.5 : 1,
                    transition: 'background 150ms, border-color 150ms, box-shadow 150ms',
                  }}
                  onMouseEnter={e => {
                    if (!isBusy) {
                      e.currentTarget.style.background = '#f8f8f8'
                      e.currentTarget.style.borderColor = '#ccc'
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#fff'
                    e.currentTarget.style.borderColor = '#e0e0e0'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  {activeMethod === 'google' ? <Spinner /> : <GoogleIcon />}
                  <span>Google</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleOAuthSignIn('apple')}
                  disabled={isBusy}
                  aria-label="Continue with Apple"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    minHeight: 44,
                    borderRadius: 12,
                    border: '1px solid #e0e0e0',
                    background: '#fff',
                    color: '#333',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: isBusy ? 'not-allowed' : 'pointer',
                    opacity: isBusy && activeMethod !== 'apple' ? 0.5 : 1,
                    transition: 'background 150ms, border-color 150ms, box-shadow 150ms',
                  }}
                  onMouseEnter={e => {
                    if (!isBusy) {
                      e.currentTarget.style.background = '#f8f8f8'
                      e.currentTarget.style.borderColor = '#ccc'
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#fff'
                    e.currentTarget.style.borderColor = '#e0e0e0'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  {activeMethod === 'apple' ? <Spinner /> : <AppleIcon />}
                  <span>Apple</span>
                </button>
              </div>

              {/* ── Divider ── */}
              <div
                aria-hidden="true"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  margin: '2px 0',
                }}
              >
                <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
                <span style={{
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase' as const,
                  color: '#aaa',
                  whiteSpace: 'nowrap' as const,
                }}>
                  or use email
                </span>
                <div style={{ flex: 1, height: 1, background: '#e5e5e5' }} />
              </div>

              {/* ── Email input ── */}
              <label
                htmlFor="email"
                style={{
                  fontSize: 11,
                  color: '#888',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase' as const,
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                Invited email address
              </label>
              <input
                id="email"
                type="text"
                inputMode="email"
                placeholder="name@yourcompany.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoFocus
                autoComplete="email"
                disabled={isBusy}
                data-login-input=""
                style={{
                  width: '100%',
                  height: 48,
                  padding: '0 16px',
                  borderRadius: 12,
                  fontSize: 14,
                  outline: 'none',
                  transition: 'border-color 150ms, box-shadow 150ms, background 150ms',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box' as const,
                }}
              />

              {/* ── Error ── */}
              {status === 'error' && (
                <p
                  role="alert"
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: '#dc2626',
                    lineHeight: 1.4,
                  }}
                >
                  {errorMessage}
                </p>
              )}

              {/* ── Submit button ── */}
              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  width: '100%',
                  minHeight: 48,
                  borderRadius: 14,
                  border: 'none',
                  background: canSubmit ? '#111' : '#e8e8e8',
                  color: canSubmit ? '#fff' : '#aaa',
                  fontSize: 14,
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  transition: 'transform 100ms, box-shadow 200ms, background 150ms',
                  boxShadow: canSubmit
                    ? '0 4px 16px rgba(0,0,0,0.15)'
                    : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => {
                  if (canSubmit) {
                    e.currentTarget.style.transform = 'translateY(-1px)'
                    e.currentTarget.style.background = '#000'
                    e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.2)'
                  }
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)'
                  if (canSubmit) {
                    e.currentTarget.style.background = '#111'
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)'
                  }
                }}
              >
                {activeMethod === 'email' && <Spinner />}
                {activeMethod === 'email' ? 'Sending link...' : 'Send sign-in link'}
              </button>

              {/* ── Privacy ── */}
              <p style={{
                margin: '2px 0 0',
                fontSize: 12,
                color: '#aaa',
                textAlign: 'center',
                lineHeight: 1.5,
              }}>
                By continuing you agree to our{' '}
                <Link
                  href="/privacy"
                  style={{ color: '#666', textDecoration: 'underline', textDecorationColor: 'rgba(0,0,0,0.25)', textUnderlineOffset: 2 }}
                >
                  Privacy Policy
                </Link>{' '}
                and{' '}
                <Link
                  href="/terms"
                  style={{ color: '#666', textDecoration: 'underline', textDecorationColor: 'rgba(0,0,0,0.25)', textUnderlineOffset: 2 }}
                >
                  Terms
                </Link>
              </p>
            </form>
          )}

          {process.env.NODE_ENV === 'development' && status !== 'sent' && (
            <DevPasswordLogin />
          )}
        </section>
      </main>

      {/* ── Keyframe for spinner ── */}
      <style>{`
        @keyframes bb-login-spin {
          to { transform: rotate(360deg); }
        }
        /* Force all login inputs to have visible borders and light backgrounds */
        [data-login-input] {
          background: #f7f7f7 !important;
          border: 1.5px solid #c0c0c0 !important;
          color: #111 !important;
          -webkit-appearance: none !important;
          appearance: none !important;
          color-scheme: light !important;
        }
        [data-login-input]:focus {
          background: #fff !important;
          border-color: #111 !important;
          box-shadow: 0 0 0 3px rgba(0,0,0,0.08) !important;
        }
        /* Override browser autofill dark-mode backgrounds */
        [data-login-input]:-webkit-autofill,
        [data-login-input]:-webkit-autofill:hover,
        [data-login-input]:-webkit-autofill:focus,
        [data-login-input]:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px #f7f7f7 inset !important;
          -webkit-text-fill-color: #111 !important;
          border: 1.5px solid #c0c0c0 !important;
          transition: background-color 5000s ease-in-out 0s;
        }
        /* Focus-visible ring for keyboard navigation */
        button:focus-visible,
        input:focus-visible,
        a:focus-visible {
          outline: 2px solid rgba(0,0,0,0.3);
          outline-offset: 2px;
        }
        /* Stack OAuth buttons on very small screens */
        @media (max-width: 380px) {
          [data-login-providers] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}

function LoginPageFallback() {
  return (
    <div style={{
      position: 'relative',
      minHeight: '100dvh',
      width: '100%',
      overflow: 'hidden',
      background: '#FAFAFA',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 20,
      }}>
        <BitBitLogoVideo size={80} variant="idle" />
        <h1 style={{
          margin: 0,
          fontSize: 32,
          fontWeight: 600,
          letterSpacing: '-0.03em',
          color: '#111',
        }}>
          Meet BitBit
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: '#999' }}>
          Loading...
        </p>
      </div>
    </div>
  )
}

function DevPasswordLogin() {
  const [devEmail, setDevEmail] = useState('')
  const [devPassword, setDevPassword] = useState('')
  const [devStatus, setDevStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [devError, setDevError] = useState('')
  const [expanded, setExpanded] = useState(false)

  async function handleDevLogin(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createClient()
    if (!supabase) {
      setDevError('Supabase not configured')
      setDevStatus('error')
      return
    }

    setDevStatus('loading')
    setDevError('')

    const { error } = await supabase.auth.signInWithPassword({
      email: devEmail.trim(),
      password: devPassword,
    })

    if (error) {
      setDevError(error.message)
      setDevStatus('error')
      return
    }

    window.location.href = '/dashboard'
  }

  return (
    <div style={{ borderTop: '1px solid #eee', marginTop: 16, paddingTop: 12 }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none', border: 'none', color: '#aaa',
          fontSize: 12, fontFamily: 'monospace', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4, padding: 0,
        }}
      >
        {expanded ? '\u25BE' : '\u25B8'} Dev: Password Login
      </button>
      {expanded && (
        <form onSubmit={handleDevLogin} style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="text"
            inputMode="email"
            placeholder="Email"
            value={devEmail}
            onChange={e => setDevEmail(e.target.value)}
            autoComplete="email"
            data-login-input=""
            style={{
              width: '100%',
              height: 44,
              padding: '0 14px',
              borderRadius: 10,
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box' as const,
              fontFamily: 'inherit',
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={devPassword}
            onChange={e => setDevPassword(e.target.value)}
            autoComplete="current-password"
            data-login-input=""
            style={{
              width: '100%',
              height: 44,
              padding: '0 14px',
              borderRadius: 10,
              fontSize: 13,
              outline: 'none',
              boxSizing: 'border-box' as const,
              fontFamily: 'inherit',
            }}
          />
          {devStatus === 'error' && (
            <p style={{ margin: 0, fontSize: 12, color: '#dc2626' }}>{devError}</p>
          )}
          <button
            type="submit"
            disabled={devStatus === 'loading' || !devEmail.trim() || !devPassword}
            style={{
              width: '100%',
              minHeight: 44,
              borderRadius: 10,
              border: '1px solid #e0e0e0',
              background: '#f5f5f5',
              color: '#333',
              fontSize: 13,
              fontWeight: 500,
              cursor: (!devEmail.trim() || !devPassword) ? 'not-allowed' : 'pointer',
              opacity: (!devEmail.trim() || !devPassword) ? 0.4 : 1,
              fontFamily: 'inherit',
            }}
          >
            {devStatus === 'loading' ? 'Signing in...' : 'Sign in with password'}
          </button>
        </form>
      )}
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
