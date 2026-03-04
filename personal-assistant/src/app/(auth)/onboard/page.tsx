'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BitBitLogoVideo } from '@/components/chat/bitbit-logo-video'

type Plan = 'starter' | 'growth' | 'scale'

interface PlanOption {
  id: Plan
  name: string
  price: string
  period: string
  description: string
  features: string[]
  highlighted: boolean
}

const PLANS: PlanOption[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: '$199',
    period: '/mo',
    description: 'Solo operators getting started with AI ops.',
    features: ['1 user', '3 channel integrations', 'Email + WhatsApp triage', 'Basic analytics'],
    highlighted: false,
  },
  {
    id: 'growth',
    name: 'Growth',
    price: '$349',
    period: '/mo',
    description: 'Growing agencies automating client ops.',
    features: ['5 users', 'All channels', 'Proposal generation', 'Full analytics + ROI'],
    highlighted: true,
  },
  {
    id: 'scale',
    name: 'Scale',
    price: '$599',
    period: '/mo',
    description: 'Multi-team agencies running at full speed.',
    features: ['15 users', 'All channels', 'White-label output', 'Priority support'],
    highlighted: false,
  },
]

const INDUSTRIES = [
  { value: 'digital-agency', label: 'Digital / Marketing Agency' },
  { value: 'ecommerce', label: 'E-commerce' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'real-estate', label: 'Real Estate' },
  { value: 'professional-services', label: 'Professional Services' },
  { value: 'other', label: 'Other' },
]

export default function OnboardPage() {
  const router = useRouter()

  const [orgName, setOrgName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [industry, setIndustry] = useState('digital-agency')
  const [plan, setPlan] = useState<Plan>('growth')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgName.trim() || !ownerName.trim()) return

    setStatus('loading')
    setErrorMsg('')

    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgName.trim(),
          ownerName: ownerName.trim(),
          plan,
          industry,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }

      router.replace('/dashboard')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    }
  }

  const isBusy = status === 'loading'

  return (
    <div className="bb-auth-page bb-backdrop">
      <div className="bb-auth-page__aura bb-auth-page__aura--one" aria-hidden="true" />
      <div className="bb-auth-page__aura bb-auth-page__aura--two" aria-hidden="true" />
      <div className="bb-auth-page__noise" aria-hidden="true" />

      <main className="bb-auth-page__content bb-stagger" style={{ maxWidth: '640px' }}>
        {/* Logo */}
        <section className="bb-auth-page__hero" aria-label="BitBit setup">
          <div className="bb-auth-page__ambient-logo" aria-hidden="true" style={{ position: 'static', marginBottom: '1.5rem' }}>
            <BitBitLogoVideo size={48} />
          </div>
          <h1 className="bb-auth-page__title">Set up your workspace</h1>
          <p style={{ color: 'var(--bb-muted, #8b9db5)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
            You&rsquo;re in. Let&rsquo;s get your BitBit workspace ready.
          </p>
        </section>

        {/* Form card */}
        <section className="bb-card bb-auth-card" aria-live="polite" style={{ padding: '2rem' }}>
          <form onSubmit={(e) => void handleSubmit(e)}>

            {/* Business name */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="orgName"
                style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--bb-label, #c9d1d9)' }}
              >
                Business name
              </label>
              <input
                id="orgName"
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="All Webbed Up"
                required
                disabled={isBusy}
                className="bb-input"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--bb-border, rgba(255,255,255,0.1))',
                  background: 'var(--bb-input-bg, rgba(255,255,255,0.05))',
                  color: 'var(--bb-fg, #e6edf3)',
                  fontSize: '0.9rem',
                  outline: 'none',
                }}
              />
            </div>

            {/* Your name */}
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                htmlFor="ownerName"
                style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--bb-label, #c9d1d9)' }}
              >
                Your name
              </label>
              <input
                id="ownerName"
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Andy Smith"
                required
                disabled={isBusy}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--bb-border, rgba(255,255,255,0.1))',
                  background: 'var(--bb-input-bg, rgba(255,255,255,0.05))',
                  color: 'var(--bb-fg, #e6edf3)',
                  fontSize: '0.9rem',
                  outline: 'none',
                }}
              />
            </div>

            {/* Industry */}
            <div style={{ marginBottom: '1.75rem' }}>
              <label
                htmlFor="industry"
                style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--bb-label, #c9d1d9)' }}
              >
                Industry
              </label>
              <select
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                disabled={isBusy}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--bb-border, rgba(255,255,255,0.1))',
                  background: 'var(--bb-input-bg, rgba(30,30,40,0.95))',
                  color: 'var(--bb-fg, #e6edf3)',
                  fontSize: '0.9rem',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {INDUSTRIES.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Plan selection */}
            <div style={{ marginBottom: '1.75rem' }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--bb-label, #c9d1d9)' }}>
                Choose your plan
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                {PLANS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlan(p.id)}
                    disabled={isBusy}
                    style={{
                      padding: '1rem 0.75rem',
                      borderRadius: '10px',
                      border: plan === p.id
                        ? '2px solid var(--bb-accent, #58a6ff)'
                        : '1px solid var(--bb-border, rgba(255,255,255,0.1))',
                      background: plan === p.id
                        ? 'rgba(88,166,255,0.08)'
                        : 'var(--bb-input-bg, rgba(255,255,255,0.03))',
                      color: 'var(--bb-fg, #e6edf3)',
                      cursor: 'pointer',
                      textAlign: 'left' as const,
                      transition: 'all 0.15s ease',
                      position: 'relative' as const,
                    }}
                    aria-pressed={plan === p.id}
                  >
                    {p.highlighted && (
                      <span style={{
                        position: 'absolute',
                        top: '-10px',
                        right: '8px',
                        background: 'var(--bb-accent, #58a6ff)',
                        color: '#0d1117',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '6px',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                      }}>
                        Popular
                      </span>
                    )}
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.2rem' }}>{p.name}</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>
                      {p.price}<span style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.6 }}>{p.period}</span>
                    </div>
                    <ul style={{ marginTop: '0.6rem', paddingLeft: 0, listStyle: 'none', fontSize: '0.72rem', opacity: 0.75 }}>
                      {p.features.slice(0, 2).map((f) => (
                        <li key={f} style={{ marginBottom: '0.2rem' }}>✓ {f}</li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
              <p style={{ fontSize: '0.75rem', opacity: 0.5, marginTop: '0.6rem' }}>
                14-day free trial · Cancel anytime · All prices AUD excl. GST
              </p>
            </div>

            {/* Error */}
            {status === 'error' && (
              <div role="alert" style={{
                padding: '0.65rem 1rem',
                borderRadius: '8px',
                background: 'rgba(248,81,73,0.12)',
                border: '1px solid rgba(248,81,73,0.3)',
                color: '#ff7b72',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}>
                {errorMsg}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isBusy || !orgName.trim() || !ownerName.trim()}
              className="bb-btn bb-btn--primary"
              style={{ width: '100%' }}
            >
              {isBusy ? 'Creating workspace…' : 'Create workspace →'}
            </button>
          </form>
        </section>

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: '0.75rem', opacity: 0.4, marginTop: '1.5rem' }}>
          By continuing you agree to the{' '}
          <a href="/terms" style={{ color: 'inherit', textDecoration: 'underline' }}>Terms</a>
          {' '}and{' '}
          <a href="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>Privacy Policy</a>.
        </p>
      </main>
    </div>
  )
}
