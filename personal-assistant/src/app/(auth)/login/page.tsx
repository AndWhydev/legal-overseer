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

function AppleIcon({ dark }: { dark?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill={dark ? '#ddd' : 'currentColor'}
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
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="2" opacity={0.15} />
      <path
        d="M9 2a7 7 0 0 1 7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* ── Dark mode detection — reads app theme from localStorage (bb-theme) ── */
function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('bb-theme') === 'midnight'
  })
  useEffect(() => {
    // Re-check in case SSR value differed
    setIsDark(localStorage.getItem('bb-theme') === 'midnight')
  }, [])
  return isDark
}

function LoginPageContent() {
  const searchParams = useSearchParams()
  const queryError = searchParams.get('error')
  const isDark = useDarkMode()

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

  /* ── Theme tokens ── */
  const bg = isDark ? '#0A0A0A' : '#FAFAFA'
  const cardBg = isDark ? 'rgba(20,20,20,0.85)' : 'rgba(255,255,255,0.85)'
  const cardBorder = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)'
  const cardShadow = isDark
    ? '0 8px 32px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)'
    : '0 8px 32px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)'
  const textPrimary = isDark ? '#f0f0f0' : '#111'
  const textMuted = isDark ? '#777' : '#888'
  const textDim = isDark ? '#666' : '#999'
  const textDimmer = isDark ? '#555' : '#aaa'
  const oauthBg = isDark ? '#1e1e1e' : '#fff'
  const oauthBorder = isDark ? '#383838' : '#e0e0e0'
  const oauthHoverBg = isDark ? '#252525' : '#f8f8f8'
  const oauthHoverBorder = isDark ? '#555' : '#ccc'
  const oauthColor = isDark ? '#ccc' : '#333'
  const dividerLine = isDark ? '#2a2a2a' : '#e5e5e5'
  const dividerText = isDark ? '#555' : '#aaa'
  const linkColor = isDark ? '#999' : '#666'
  const linkUnderline = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.25)'
  const errorColor = isDark ? '#ef4444' : '#dc2626'
  const headingGradient = isDark
    ? 'linear-gradient(180deg, #888 0%, #ccc 50%, #fff 100%)'
    : 'linear-gradient(180deg, #6b6b6b 0%, #1d1d1f 50%, #000 100%)'
  const logoFilter = isDark ? 'brightness(0) invert(1)' : 'brightness(0)'
  const sentEmailColor = isDark ? '#eee' : '#111'
  const sentTitleColor = isDark ? '#eee' : '#111'
  const sentCopyColor = isDark ? '#999' : '#666'
  const sentBtnBorder = isDark ? '#333' : '#ddd'
  const sentBtnColor = isDark ? '#999' : '#555'
  const sentBtnHoverBorder = isDark ? '#555' : '#bbb'
  const sentBtnHoverColor = isDark ? '#eee' : '#111'
  const oauthHoverShadow = isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.06)'

  return (
    <div data-theme={isDark ? 'dark' : 'light'} style={{
      position: 'relative',
      minHeight: '100dvh',
      width: '100%',
      overflow: 'hidden',
      background: bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      colorScheme: isDark ? 'dark' : 'light',
    }}>
      {/* ── Particle background ── */}
      <ForceFieldBackground
        spacing={16}
        minStroke={1}
        maxStroke={isDark ? 2 : 2.5}
        forceStrength={14}
        magnifierRadius={160}
        friction={0.88}
        restoreSpeed={0.04}
        bgColor={bg}
        particleRgb={isDark ? '255,255,255' : '0,0,0'}
      />

      {/* ── Subtle radial vignette ── */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background: isDark
            ? 'radial-gradient(ellipse at 50% 40%, transparent 0%, rgba(10,10,10,0.4) 60%, rgba(10,10,10,0.8) 100%)'
            : 'radial-gradient(ellipse at 50% 40%, transparent 0%, rgba(250,250,250,0.4) 60%, rgba(250,250,250,0.8) 100%)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* ── Edge light reflections ── */}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'hidden' }}>
        {isDark ? (
          <>
            <div style={{
              position: 'absolute', top: -100, left: -100, width: 300, height: 300,
              background: 'radial-gradient(circle, rgba(100,120,255,0.06) 0%, transparent 70%)',
              filter: 'blur(50px)',
            }} />
            <div style={{
              position: 'absolute', bottom: -100, right: -100, width: 300, height: 300,
              background: 'radial-gradient(circle, rgba(200,100,255,0.04) 0%, transparent 70%)',
              filter: 'blur(50px)',
            }} />
          </>
        ) : (
          <>
            <div style={{
              position: 'absolute', top: -80, left: -80, width: 260, height: 260,
              background: 'radial-gradient(circle, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0) 70%)',
              filter: 'blur(40px)',
            }} />
            <div style={{
              position: 'absolute', top: -60, right: -60, width: 200, height: 200,
              background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, rgba(255,255,255,0) 70%)',
              filter: 'blur(35px)',
            }} />
            <div style={{
              position: 'absolute', bottom: -60, left: -40, width: 200, height: 200,
              background: 'radial-gradient(circle, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0) 70%)',
              filter: 'blur(35px)',
            }} />
            <div style={{
              position: 'absolute', bottom: -80, right: -80, width: 260, height: 260,
              background: 'radial-gradient(circle, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 70%)',
              filter: 'blur(40px)',
            }} />
          </>
        )}
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
        {/* ── Logo ── */}
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
            filter: logoFilter,
            opacity: 0.85,
            flexShrink: 0,
          }}
        />

        {/* ── Heading ── */}
        <header style={{ textAlign: 'center' }}>
          <h1 style={{
            margin: 0,
            fontSize: 'clamp(28px, 5vw, 36px)',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            background: isDark
              ? 'linear-gradient(180deg, #f0f0f0 0%, #e0e0e0 50%, #888 85%, #555 100%)'
              : headingGradient,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Meet BitBit
          </h1>
          <p style={{
            margin: '8px 0 0',
            fontSize: 14,
            color: textMuted,
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
            background: cardBg,
            backdropFilter: 'blur(20px) saturate(1.1)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.1)',
            border: `1px solid ${cardBorder}`,
            boxShadow: cardShadow,
          }}
        >
          {status === 'sent' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center' }}>
              <p style={{ fontSize: 18, fontWeight: 600, color: sentTitleColor, margin: 0 }}>
                Check your inbox
              </p>
              <p style={{ fontSize: 13, color: sentCopyColor, margin: 0, lineHeight: 1.5 }}>
                We sent a sign-in link to{' '}
                <span style={{ color: sentEmailColor, fontFamily: 'var(--font-mono, monospace)' }}>{sentTo}</span>.
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
                  border: `1px solid ${sentBtnBorder}`,
                  borderRadius: 12,
                  padding: '10px 16px',
                  color: sentBtnColor,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'border-color 150ms, color 150ms',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = sentBtnHoverBorder
                  e.currentTarget.style.color = sentBtnHoverColor
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = sentBtnBorder
                  e.currentTarget.style.color = sentBtnColor
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
                color: textDim,
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
                    border: `1px solid ${oauthBorder}`,
                    background: oauthBg,
                    color: oauthColor,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: isBusy ? 'not-allowed' : 'pointer',
                    opacity: isBusy && activeMethod !== 'google' ? 0.5 : 1,
                    transition: 'background 150ms, border-color 150ms, box-shadow 150ms',
                  }}
                  onMouseEnter={e => {
                    if (!isBusy) {
                      e.currentTarget.style.background = oauthHoverBg
                      e.currentTarget.style.borderColor = oauthHoverBorder
                      e.currentTarget.style.boxShadow = oauthHoverShadow
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = oauthBg
                    e.currentTarget.style.borderColor = oauthBorder
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
                    border: `1px solid ${oauthBorder}`,
                    background: oauthBg,
                    color: oauthColor,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: isBusy ? 'not-allowed' : 'pointer',
                    opacity: isBusy && activeMethod !== 'apple' ? 0.5 : 1,
                    transition: 'background 150ms, border-color 150ms, box-shadow 150ms',
                  }}
                  onMouseEnter={e => {
                    if (!isBusy) {
                      e.currentTarget.style.background = oauthHoverBg
                      e.currentTarget.style.borderColor = oauthHoverBorder
                      e.currentTarget.style.boxShadow = oauthHoverShadow
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = oauthBg
                    e.currentTarget.style.borderColor = oauthBorder
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  {activeMethod === 'apple' ? <Spinner /> : <AppleIcon dark={isDark} />}
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
                <div style={{ flex: 1, height: 1, background: dividerLine }} />
                <span style={{
                  fontSize: 11,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase' as const,
                  color: dividerText,
                  whiteSpace: 'nowrap' as const,
                }}>
                  or use email
                </span>
                <div style={{ flex: 1, height: 1, background: dividerLine }} />
              </div>

              {/* ── Email input ── */}
              <label
                htmlFor="email"
                style={{
                  fontSize: 11,
                  color: textMuted,
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
                    color: errorColor,
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
                  borderRadius: 12,
                  border: `1px solid ${isDark ? '#383838' : '#e0e0e0'}`,
                  background: isDark ? '#1e1e1e' : '#f5f5f5',
                  color: isDark ? '#ccc' : '#333',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  opacity: canSubmit ? 1 : 0.4,
                  transition: 'border-color 150ms, background 150ms, opacity 150ms',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontFamily: 'inherit',
                }}
              >
                {activeMethod === 'email' && <Spinner />}
                {activeMethod === 'email' ? 'Sending link...' : 'Send sign-in link'}
              </button>

              {/* ── Privacy ── */}
              <p style={{
                margin: '2px 0 0',
                fontSize: 12,
                color: textDimmer,
                textAlign: 'center',
                lineHeight: 1.5,
              }}>
                By continuing you agree to our{' '}
                <Link
                  href="/privacy"
                  style={{ color: linkColor, textDecoration: 'underline', textDecorationColor: linkUnderline, textUnderlineOffset: 2 }}
                >
                  Privacy Policy
                </Link>{' '}
                and{' '}
                <Link
                  href="/terms"
                  style={{ color: linkColor, textDecoration: 'underline', textDecorationColor: linkUnderline, textUnderlineOffset: 2 }}
                >
                  Terms
                </Link>
              </p>
            </form>
          )}

          {process.env.NODE_ENV === 'development' && status !== 'sent' && (
            <DevPasswordLogin isDark={isDark} />
          )}
        </section>
      </main>

      {/* ── Styles ── */}
      <style>{`
        @keyframes bb-login-spin {
          to { transform: rotate(360deg); }
        }

        /* ── Base input reset (both modes) ── */
        [data-login-input] {
          -webkit-appearance: none !important;
          -moz-appearance: none !important;
          appearance: none !important;
          outline: none !important;
          box-shadow: none !important;
          font: inherit !important;
          font-size: 14px !important;
          margin: 0 !important;
        }
        /* Mask password field via CSS instead of type="password" to avoid browser styling */
        [data-login-password] {
          -webkit-text-security: disc !important;
        }

        /* ── Light mode inputs ── */
        [data-theme="light"] [data-login-input] {
          background: #f7f7f7 !important;
          border: 1.5px solid #c0c0c0 !important;
          color: #111 !important;
          -webkit-text-fill-color: #111 !important;
          color-scheme: light !important;
        }
        [data-theme="light"] [data-login-input]:focus {
          background: #fff !important;
          border-color: #aaa !important;
          box-shadow: none !important;
        }
        [data-theme="light"] [data-login-input]::placeholder {
          color: #999 !important;
          -webkit-text-fill-color: #999 !important;
          opacity: 1 !important;
        }
        [data-theme="light"] [data-login-input]:-webkit-autofill,
        [data-theme="light"] [data-login-input]:-webkit-autofill:hover,
        [data-theme="light"] [data-login-input]:-webkit-autofill:focus,
        [data-theme="light"] [data-login-input]:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px #f7f7f7 inset !important;
          -webkit-text-fill-color: #111 !important;
          border: 1.5px solid #c0c0c0 !important;
          transition: background-color 5000s ease-in-out 0s;
        }

        /* ── Dark mode inputs ── */
        [data-theme="dark"] [data-login-input] {
          background: #1e1e1e !important;
          border: 1.5px solid #383838 !important;
          color: #eee !important;
          -webkit-text-fill-color: #eee !important;
          color-scheme: dark !important;
        }
        [data-theme="dark"] [data-login-input]:focus {
          background: #252525 !important;
          border-color: #555 !important;
          box-shadow: none !important;
        }
        [data-theme="dark"] [data-login-input]::placeholder {
          color: #666 !important;
          -webkit-text-fill-color: #666 !important;
          opacity: 1 !important;
        }
        [data-theme="dark"] [data-login-input]:-webkit-autofill,
        [data-theme="dark"] [data-login-input]:-webkit-autofill:hover,
        [data-theme="dark"] [data-login-input]:-webkit-autofill:focus,
        [data-theme="dark"] [data-login-input]:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 1000px #1e1e1e inset !important;
          -webkit-text-fill-color: #eee !important;
          border: 1.5px solid #383838 !important;
          transition: background-color 5000s ease-in-out 0s;
        }

        /* Focus-visible ring for keyboard navigation */
        [data-theme="light"] button:focus-visible,
        [data-theme="light"] input:focus-visible,
        [data-theme="light"] a:focus-visible {
          outline: 2px solid rgba(0,0,0,0.3);
          outline-offset: 2px;
        }
        [data-theme="dark"] button:focus-visible,
        [data-theme="dark"] input:focus-visible,
        [data-theme="dark"] a:focus-visible {
          outline: 2px solid rgba(255,255,255,0.3);
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
  const isDark = useDarkMode()
  const bg = isDark ? '#0A0A0A' : '#FAFAFA'

  return (
    <div style={{
      position: 'relative',
      minHeight: '100dvh',
      width: '100%',
      overflow: 'hidden',
      background: bg,
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
          color: isDark ? '#eee' : '#111',
        }}>
          Meet BitBit
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: isDark ? '#666' : '#999' }}>
          Loading...
        </p>
      </div>
    </div>
  )
}

function DevPasswordLogin({ isDark }: { isDark: boolean }) {
  const [devEmail, setDevEmail] = useState('')
  const [devPassword, setDevPassword] = useState('')
  const [devStatus, setDevStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [devError, setDevError] = useState('')
  const [expanded, setExpanded] = useState(false)

  const borderColor = isDark ? '#2a2a2a' : '#eee'
  const toggleColor = isDark ? '#666' : '#aaa'
  const submitBg = isDark ? '#1e1e1e' : '#f5f5f5'
  const submitBorder = isDark ? '#383838' : '#e0e0e0'
  const submitColor = isDark ? '#ccc' : '#333'

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
    <div style={{ borderTop: `1px solid ${borderColor}`, marginTop: 16, paddingTop: 12 }}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none', border: 'none', color: toggleColor,
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
              borderRadius: 12,
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box' as const,
              fontFamily: 'inherit',
              transition: 'border-color 150ms, box-shadow 150ms, background 150ms',
            }}
          />
          <input
            type="text"
            placeholder="Password"
            value={devPassword}
            onChange={e => setDevPassword(e.target.value)}
            autoComplete="current-password"
            data-login-input=""
            data-login-password=""
            style={{
              width: '100%',
              height: 44,
              padding: '0 14px',
              borderRadius: 12,
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box' as const,
              fontFamily: 'inherit',
              transition: 'border-color 150ms, box-shadow 150ms, background 150ms',
            }}
          />
          {devStatus === 'error' && (
            <p style={{ margin: 0, fontSize: 12, color: isDark ? '#ef4444' : '#dc2626' }}>{devError}</p>
          )}
          <button
            type="submit"
            disabled={devStatus === 'loading' || !devEmail.trim() || !devPassword}
            style={{
              width: '100%',
              minHeight: 44,
              borderRadius: 12,
              border: `1px solid ${submitBorder}`,
              background: submitBg,
              color: submitColor,
              fontSize: 14,
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
