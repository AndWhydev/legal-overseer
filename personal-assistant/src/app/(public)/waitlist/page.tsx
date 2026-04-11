'use client'

import React, { useState, useEffect } from 'react'

const FEATURES = [
  { icon: '⚡', label: 'AI triage across every channel' },
  { icon: '🤖', label: 'Autonomous agent workflows' },
  { icon: '📊', label: 'Live ops intelligence dashboard' },
  { icon: '🔗', label: 'Deep CRM + billing integrations' },
]

export default function WaitlistPage() {
  const [email, setEmail] = useState('')
  const [referral, setReferral] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'already' | 'invited' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Pre-fill invite code from URL
    const params = new URLSearchParams(window.location.search)
    const code = params.get('invite') || params.get('code') || ''
    if (code) setInviteCode(code.toUpperCase())

    // Detect referral source from query string
    const ref = params.get('ref') || params.get('utm_source') || 'direct'
    setReferral(ref)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setStatus('loading')
    setErrorMsg('')

    // If invite code is present, validate it first and redirect to signup
    if (inviteCode.trim()) {
      try {
        const res = await fetch(`/api/waitlist?code=${encodeURIComponent(inviteCode.trim())}`)
        const data = await res.json()
        if (data.valid) {
          setStatus('invited')
          // Redirect to auth/onboard with invite code after short delay
          setTimeout(() => {
            window.location.href = `/auth/login?invite=${encodeURIComponent(inviteCode.trim())}&email=${encodeURIComponent(email.trim())}`
          }, 1800)
          return
        } else {
          setStatus('error')
          setErrorMsg(
            data.reason === 'expired'   ? 'That invite code has expired.' :
            data.reason === 'exhausted' ? 'That invite code has already been fully used.' :
            'Invalid invite code. Join the waitlist below instead.'
          )
          return
        }
      } catch {
        setStatus('error')
        setErrorMsg('Unable to validate invite code. Please try again.')
        return
      }
    }

    // No invite code — add to waitlist
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), referral_source: referral }),
      })
      const data = await res.json()

      if (res.status === 201) setStatus('success')
      else if (data.message === 'already_registered') setStatus('already')
      else {
        setStatus('error')
        setErrorMsg(data.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setStatus('error')
      setErrorMsg('Network error. Please check your connection and try again.')
    }
  }

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a0a0f 0%, #0d0d1a 40%, #0a0f1a 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
    position: 'relative',
    overflow: 'hidden',
  }

  const glowStyle: React.CSSProperties = {
    position: 'absolute',
    borderRadius: '50%',
    filter: 'blur(120px)',
    pointerEvents: 'none',
  }

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '24px',
    padding: '3rem 2.5rem',
    maxWidth: '480px',
    width: '100%',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    boxShadow: '0 32px 80px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
    position: 'relative',
    zIndex: 10,
  }

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(99, 102, 241, 0.15)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    borderRadius: '100px',
    padding: '6px 14px',
    fontSize: '12px',
    color: '#a5b4fc',
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    marginBottom: '1.5rem',
    fontWeight: 500,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '12px',
    padding: '14px 16px',
    fontSize: '15px',
    color: '#f1f5f9',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  }

  const buttonStyle: React.CSSProperties = {
    width: '100%',
    background: status === 'loading'
      ? 'rgba(99, 102, 241, 0.5)'
      : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    border: 'none',
    borderRadius: '12px',
    padding: '15px 24px',
    fontSize: '15px',
    fontWeight: 600,
    color: '#fff',
    cursor: status === 'loading' ? 'not-allowed' : 'pointer',
    transition: 'opacity 0.2s, transform 0.1s',
    marginTop: '12px',
    letterSpacing: '0.01em',
  }

  const successStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '1.5rem 0',
  }

  if (!mounted) return null

  return (
    <main style={containerStyle}>
      {/* Background glows */}
      <div style={{ ...glowStyle, width: 600, height: 600, background: 'rgba(99,102,241,0.12)', top: -200, left: -200 }} />
      <div style={{ ...glowStyle, width: 400, height: 400, background: 'rgba(139,92,246,0.1)', bottom: -100, right: -100 }} />

      <div style={cardStyle}>
        {/* Badge */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <span style={badgeStyle}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', display: 'inline-block' }} />
            Private Beta
          </span>
        </div>

        {/* Heading */}
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#f8fafc', textAlign: 'center', marginBottom: '0.75rem', lineHeight: 1.2 }}>
          AI that runs your ops.<br />
          <span style={{ background: 'linear-gradient(135deg, #6366f1, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            While you sleep.
          </span>
        </h1>

        <p style={{ color: '#94a3b8', textAlign: 'center', fontSize: '15px', marginBottom: '2rem', lineHeight: 1.6 }}>
          BitBit is an agentic ops platform for digital agencies. Join the waitlist for early access — or enter your invite code to jump straight in.
        </p>

        {/* Feature list */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '2rem' }}>
          {FEATURES.map(f => (
            <div key={f.label} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '10px',
              padding: '10px 12px',
              fontSize: '12.5px',
              color: '#cbd5e1',
            }}>
              <span style={{ fontSize: '16px' }}>{f.icon}</span>
              {f.label}
            </div>
          ))}
        </div>

        {/* Success states */}
        {status === 'success' && (
          <div style={successStyle}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🎉</div>
            <h2 style={{ color: '#f1f5f9', fontWeight: 600, marginBottom: '0.5rem' }}>You&apos;re on the list!</h2>
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>We&apos;ll email you when your spot is ready. Keep an eye on your inbox.</p>
          </div>
        )}

        {status === 'already' && (
          <div style={successStyle}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>✅</div>
            <h2 style={{ color: '#f1f5f9', fontWeight: 600, marginBottom: '0.5rem' }}>Already registered</h2>
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>Good news — you&apos;re already on the list. We haven&apos;t forgotten about you.</p>
          </div>
        )}

        {status === 'invited' && (
          <div style={successStyle}>
            <div style={{ fontSize: '3rem', marginBottom: '0.75rem' }}>🚀</div>
            <h2 style={{ color: '#f1f5f9', fontWeight: 600, marginBottom: '0.5rem' }}>Invite accepted!</h2>
            <p style={{ color: '#94a3b8', fontSize: '14px' }}>Taking you to setup…</p>
          </div>
        )}

        {/* Form — hide on terminal states */}
        {!['success', 'already', 'invited'].includes(status) && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px', fontWeight: 500 }}>
                Email address
              </label>
              <input
                type="email"
                placeholder="you@agency.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={inputStyle}
                onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.6)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
                autoComplete="email"
              />
            </div>

            <div>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px', fontWeight: 500 }}>
                Invite code <span style={{ color: '#64748b', fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="text"
                placeholder="BITBIT-XXXX"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                style={{ ...inputStyle, letterSpacing: '0.08em', fontFamily: 'monospace' }}
                onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.6)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.12)')}
                autoComplete="off"
              />
            </div>

            {status === 'error' && (
              <div style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: '10px',
                padding: '12px 14px',
                color: '#fca5a5',
                fontSize: '13.5px',
              }}>
                {errorMsg}
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              style={buttonStyle}
            >
              {status === 'loading'
                ? 'Processing…'
                : inviteCode.trim()
                  ? 'Use invite code →'
                  : 'Join the waitlist →'}
            </button>

            <p style={{ color: '#475569', fontSize: '12px', textAlign: 'center', marginTop: '4px' }}>
              No spam. Unsubscribe anytime. We&apos;ll only email you about your access.
            </p>
          </form>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: '2rem', color: '#334155', fontSize: '13px', textAlign: 'center', zIndex: 10 }}>
        Already have an account?{' '}
        <a href="/auth/login" style={{ color: '#6366f1', textDecoration: 'none' }}>Sign in</a>
        {' · '}
        <a href="/privacy" style={{ color: '#475569', textDecoration: 'none' }}>Privacy</a>
        {' · '}
        <a href="/terms" style={{ color: '#475569', textDecoration: 'none' }}>Terms</a>
      </div>
    </main>
  )
}
