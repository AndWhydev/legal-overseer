'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check, ArrowRight, Zap } from 'lucide-react'
import { S, C } from '@/lib/styles/design-tokens'

interface Tier {
  name: string
  price: string
  priceNum: number | null
  period: string
  description: string
  features: string[]
  cta: string
  tier: string | null
  href: string | null
  highlighted: boolean
}

const TIERS: Tier[] = [
  {
    name: 'Starter',
    price: '$199',
    priceNum: 199,
    period: '/mo',
    description: 'For solo operators getting started with AI ops.',
    features: [
      '1 user',
      '3 channel integrations',
      'Sentry (monitoring agent)',
      'Lead Swarm (lead capture)',
      'Invoice Flow (billing agent)',
      'Email + WhatsApp triage',
      '50k AI tokens/mo',
    ],
    cta: 'Start 30-Day Free Trial',
    tier: 'starter',
    href: null,
    highlighted: false,
  },
  {
    name: 'Growth',
    price: '$349',
    priceNum: 349,
    period: '/mo',
    description: 'For growing agencies automating client ops.',
    features: [
      '5 users',
      'All channel integrations',
      'All Starter agents',
      'SEO Monitor',
      'Ad Script Generator',
      'Content Creator',
      'Proposal generation',
      'Priority support',
      '200k AI tokens/mo',
    ],
    cta: 'Start 30-Day Free Trial',
    tier: 'growth',
    href: null,
    highlighted: true,
  },
  {
    name: 'Scale',
    price: '$599',
    priceNum: 599,
    period: '/mo',
    description: 'For agencies running full AI-powered operations.',
    features: [
      '15 users',
      'All channel integrations',
      'All Growth agents',
      'Tender Hunter',
      'Advanced analytics & MRR',
      'Custom voice profiles',
      '500k AI tokens/mo',
    ],
    cta: 'Start 30-Day Free Trial',
    tier: 'scale',
    href: null,
    highlighted: false,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    priceNum: null,
    period: '',
    description: 'For agencies needing bespoke configuration.',
    features: [
      'Unlimited users',
      'Dedicated infrastructure',
      'Custom agent development',
      'SLA guarantee',
      'On-prem option',
      'Unlimited AI tokens',
      'White-label available',
      'Dedicated support manager',
    ],
    cta: 'Contact Sales',
    tier: null,
    href: 'mailto:sales@bitbit.au',
    highlighted: false,
  },
]

export default function PricingPage() {
  const [loadingTier, setLoadingTier] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoveredTier, setHoveredTier] = useState<string | null>(null)

  async function handleCheckout(tier: string) {
    setLoadingTier(tier)
    setError(null)

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 401) {
          window.location.href = `/login?redirect=/dashboard&checkout_tier=${tier}`
          return
        }
        throw new Error((data as Record<string, string>).error || 'Failed to create checkout session')
      }

      const { url } = (await res.json()) as { sessionId: string; url: string }

      if (!url) {
        throw new Error('No checkout URL returned. Please try again.')
      }

      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoadingTier(null)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: C.bgPage }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 24px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h1
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: C.textPrimary,
              letterSpacing: '-0.01em',
              margin: '0 0 8px 0',
            }}
          >
            Simple, transparent pricing
          </h1>
          <p
            style={{
              fontSize: 14,
              color: C.textSecondary,
              maxWidth: 480,
              margin: '0 auto',
              lineHeight: 1.5,
            }}
          >
            AI-powered operations for digital agencies. Start with a 30-day free trial,
            no credit card required.
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              maxWidth: 480,
              margin: '0 auto 32px',
              padding: '12px 16px',
              borderRadius: 12,
              background: C.statusErrorBg,
              border: `1px solid rgba(239, 68, 68, 0.2)`,
              color: C.statusError,
              fontSize: 14,
              textAlign: 'center',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              style={{
                background: 'none',
                border: 'none',
                color: C.statusError,
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: 14,
                padding: '0 4px',
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Pricing grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          {TIERS.map((tier) => {
            const isHovered = hoveredTier === tier.name
            const isHighlighted = tier.highlighted

            return (
              <div
                key={tier.name}
                onMouseEnter={() => setHoveredTier(tier.name)}
                onMouseLeave={() => setHoveredTier(null)}
                style={{
                  ...S.card,
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  border: isHighlighted
                    ? `1px solid ${C.borderHover}`
                    : `1px solid ${isHovered ? C.borderHover : C.borderSubtle}`,
                  transition: 'border-color 200ms, transform 200ms',
                  transform: isHovered ? 'translateY(-2px)' : 'none',
                }}
              >
                {/* Popular badge */}
                {isHighlighted && (
                  <div style={{ marginBottom: 12 }}>
                    <span
                      style={{
                        ...S.badge,
                        fontSize: 14,
                        fontWeight: 500,
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: C.textPrimary,
                      }}
                    >
                      <Zap size={14} />
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Plan name */}
                <h2
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: C.textPrimary,
                    margin: 0,
                  }}
                >
                  {tier.name}
                </h2>

                {/* Price */}
                <div
                  style={{
                    marginTop: 8,
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      ...S.mono,
                      fontSize: 16,
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {tier.price}
                  </span>
                  {tier.period && (
                    <span style={{ fontSize: 14, color: C.textSecondary }}>
                      {tier.period}
                    </span>
                  )}
                </div>

                {/* Description */}
                <p
                  style={{
                    fontSize: 14,
                    color: C.textSecondary,
                    marginTop: 8,
                    marginBottom: 0,
                    lineHeight: 1.45,
                  }}
                >
                  {tier.description}
                </p>

                {/* Features list */}
                <ul
                  style={{
                    listStyle: 'none',
                    padding: 0,
                    marginTop: 20,
                    marginBottom: 0,
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        fontSize: 14,
                        color: C.textSecondary,
                      }}
                    >
                      <Check
                        size={16}
                        style={{
                          color: C.statusSuccess,
                          marginTop: 2,
                          flexShrink: 0,
                        }}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA button */}
                {tier.tier ? (
                  <button
                    onClick={() => handleCheckout(tier.tier!)}
                    disabled={loadingTier !== null}
                    style={{
                      ...S.button,
                      ...(isHighlighted ? S.buttonPrimary : S.buttonGhost),
                      width: '100%',
                      justifyContent: 'center',
                      marginTop: 24,
                      opacity:
                        loadingTier !== null && loadingTier !== tier.tier
                          ? 0.4
                          : loadingTier === tier.tier
                            ? 0.6
                            : 1,
                      cursor:
                        loadingTier !== null
                          ? loadingTier === tier.tier
                            ? 'wait'
                            : 'not-allowed'
                          : 'pointer',
                    }}
                  >
                    {loadingTier === tier.tier ? 'Redirecting...' : tier.cta}
                    {loadingTier !== tier.tier && <ArrowRight size={16} />}
                  </button>
                ) : (
                  <Link
                    href={tier.href!}
                    style={{
                      ...S.button,
                      ...S.buttonGhost,
                      width: '100%',
                      justifyContent: 'center',
                      marginTop: 24,
                      textDecoration: 'none',
                    }}
                  >
                    {tier.cta}
                    <ArrowRight size={16} />
                  </Link>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 48,
            textAlign: 'center',
            fontSize: 14,
            color: C.textDim,
          }}
        >
          <p style={{ margin: 0 }}>
            All prices in AUD, exclusive of GST. 30-day free trial on all plans.
          </p>
          <p style={{ margin: '8px 0 0 0' }}>
            <Link
              href="/terms"
              style={{ color: C.textSecondary, textDecoration: 'underline' }}
            >
              Terms
            </Link>
            {' | '}
            <Link
              href="/privacy"
              style={{ color: C.textSecondary, textDecoration: 'underline' }}
            >
              Privacy
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
