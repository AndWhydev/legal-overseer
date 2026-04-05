'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function PortalLoginContent() {
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/portal'
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/portal/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, next }),
      })

      if (res.ok) {
        setSent(true)
      } else {
        const data = await res.json()
        setError(data.error ?? 'Failed to send login link')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex items-center justify-center"
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 50%, #F8FAFC 100%)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--background)',
          borderRadius: 16,
          border: '1px solid #E5E7EB',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.06)',
          padding: 40,
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7-6H4a2 2 0 0 0-2 2z" />
              <path d="M14 2v6h6" />
            </svg>
          </div>
          <h1 style={{ fontSize: 16, fontWeight: 500, color: 'var(--foreground)', margin: 0 }}>Client Portal</h1>
          <p style={{ fontSize: 14, color: 'var(--muted-foreground)', marginTop: 8 }}>
            Sign in with your email to access your portal
          </p>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: '#ECFDF5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 style={{ fontSize: 16, fontWeight: 500, color: 'var(--foreground)', margin: '0 0 8px' }}>
              Check your email
            </h2>
            <p style={{ fontSize: 14, color: 'var(--muted-foreground)', lineHeight: 1.6 }}>
              We sent a magic link to <strong style={{ color: 'var(--foreground)' }}>{email}</strong>. Click the link in the email to sign in.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--foreground)', marginBottom: 8 }}>
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: '1px solid #D1D5DB',
                  fontSize: 16,
                  color: 'var(--foreground)',
                  outline: 'none',
                  transition: 'border-color 200ms',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: '#FEF2F2',
                  border: '1px solid #FECACA',
                  color: 'var(--destructive)',
                  fontSize: 14,
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: 8,
                background: '#2563EB',
                color: 'var(--primary-foreground)',
                fontSize: 16,
                fontWeight: 500,
                border: 'none',
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading || !email.trim() ? 0.6 : 1,
                transition: 'opacity 150ms',
              }}
            >
              {loading ? 'Sending...' : 'Send Magic Link'}
            </button>

            <p style={{ fontSize: 14, color: 'var(--muted-foreground)', textAlign: 'center', marginTop: 16 }}>
              You must have been invited to access this portal.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

export default function PortalLoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
      <PortalLoginContent />
    </Suspense>
  )
}
