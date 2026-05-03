'use client'

import type { CSSProperties } from 'react'
import { useState } from 'react'
import Link from 'next/link'
import { Check, ArrowRight, Zap, ChevronDown } from 'lucide-react'
import PricingComparisonTable from '@/components/marketing/pricing-comparison-table'
import Footer from '@/components/marketing/footer'
import { isPaidTier, TIER_DISPLAY, type PaidTier } from '@/lib/billing/checkout'
import { startCheckoutRedirect } from '@/lib/billing/start-checkout-browser'

/**
 * Inline tokens — formerly imported from @/lib/styles/design-tokens (removed).
 * This page's inline-style approach is a legacy pattern (see
 * docs/archive/2026-04-STYLE_GUIDE-DEPRECATED.md). Migrate to Tailwind +
 * shadcn components (see personal-assistant/COMPONENT_CONTRACTS.md) in a
 * dedicated refactor — not in-scope for the design-tokens.ts removal.
 */
const C = {
  bgPage: 'var(--bg-primary, #0a0f1a)',
  bgCard: 'var(--card)',
  bgCardLight: 'var(--secondary)',
  bgHoverStrong: 'var(--accent)',
  bgInput: 'var(--input)',
  textPrimary: 'var(--text-primary, #F1F5F9)',
  textSecondary: 'var(--text-secondary, #94A3B8)',
  textDim: 'var(--text-dim, #475569)',
  borderSubtle: 'var(--border-subtle, rgba(255, 255, 255, 0.03))',
  borderVisible: 'var(--border)',
  borderHover: 'var(--border-active, rgba(255, 255, 255, 0.1))',
  statusError: '#ef4444',
  statusErrorBg: 'rgba(239, 68, 68, 0.12)',
  statusSuccess: '#22c55e',
} as const

const SHADOW = 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.15))'

const S = {
  card: {
    padding: 20,
    borderRadius: 16,
    background: C.bgCard,
    border: `1px solid ${C.borderSubtle}`,
    boxShadow: SHADOW,
  } satisfies CSSProperties,
  cardLight: {
    padding: 16,
    borderRadius: 12,
    background: C.bgCardLight,
    border: `1px solid ${C.borderSubtle}`,
    boxShadow: SHADOW,
  } satisfies CSSProperties,
  mono: {
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    fontSize: 16,
    fontWeight: 500,
    color: C.textPrimary,
    letterSpacing: '-0.02em',
  } satisfies CSSProperties,
  button: {
    height: 40,
    padding: '0 20px',
    borderRadius: 8,
    border: 'none',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 8,
  } satisfies CSSProperties,
  buttonPrimary: {
    background: 'var(--btn-primary-bg, #F1F5F9)',
    color: 'var(--btn-primary-fg, #0a0f1a)',
  } satisfies CSSProperties,
  buttonGhost: {
    background: 'transparent',
    border: `1px solid ${C.borderVisible}`,
    color: C.textPrimary,
  } satisfies CSSProperties,
  badge: {
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    padding: '4px 12px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    background: C.bgHoverStrong,
    color: C.textSecondary,
  } satisfies CSSProperties,
} as const

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

// Name + price come from TIER_DISPLAY (single source of truth). Feature
// bullets, descriptions, and highlight state remain pricing-page concerns
// since they don't affect billing identity.
function paidTierRow(
  key: PaidTier,
  extra: Pick<Tier, 'description' | 'features' | 'highlighted'>,
): Tier {
  const meta = TIER_DISPLAY[key]
  return {
    name: meta.name,
    price: `$${meta.priceMonthlyAUD}`,
    priceNum: meta.priceMonthlyAUD,
    period: '/mo',
    cta: 'Start Trial',
    tier: key,
    href: null,
    ...extra,
  }
}

const TIERS: Tier[] = [
  paidTierRow('starter', {
    description: 'For solo operators getting started with AI ops.',
    features: [
      'Modes: Chat + Inbox',
      '1 user',
      '3 channel integrations',
      'Sentry (monitoring agent)',
      'Lead Swarm (lead capture)',
      'Invoice Flow (billing agent)',
      'Email + WhatsApp triage',
      '50k AI tokens/mo',
    ],
    highlighted: false,
  }),
  paidTierRow('growth', {
    description: 'For growing agencies automating client ops.',
    features: [
      'All four modes: Chat · Inbox · Work · Money',
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
    highlighted: true,
  }),
  paidTierRow('scale', {
    description: 'For agencies running full AI-powered operations.',
    features: [
      'All four modes: Chat · Inbox · Work · Money',
      '15 users',
      'All channel integrations',
      'All Growth agents',
      'Tender Hunter',
      'Advanced analytics & MRR',
      'Custom voice profiles',
      '500k AI tokens/mo',
    ],
    highlighted: false,
  }),
  {
    name: 'Enterprise',
    price: 'Custom',
    priceNum: null,
    period: '',
    description: 'For agencies needing bespoke configuration.',
    features: [
      'All four modes: Chat · Inbox · Work · Money',
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

const FAQ_ITEMS = [
  {
    q: 'How do invite codes work?',
    a: 'Invite codes are privately distributed to beta users and high-intent prospects. Apply one at Stripe checkout and your first month is on us. Standard billing resumes in month two — cancel anytime before then to pay nothing.',
  },
  {
    q: 'Can I change plans?',
    a: 'Yes. Upgrade or downgrade anytime from your billing settings. Upgrades take effect immediately with prorated billing. Downgrades apply at the end of your current billing cycle.',
  },
  {
    q: 'What are AI tokens?',
    a: 'Tokens power every agent operation -- each message triage, invoice generation, lead qualification, and content creation uses tokens. The monthly allocation resets each billing cycle. Most agencies on Growth never hit their limit.',
  },
  {
    q: 'Do you offer annual pricing?',
    a: 'Not yet, but it is coming soon. Subscribe to our newsletter to be the first to know when annual plans launch with a discount.',
  },
  {
    q: 'Is there a setup fee?',
    a: 'No. Pick where you want to chat with BitBit — iMessage, WhatsApp, Android Messages, Telegram, or our web app — then connect your email and other sources. Most teams are fully operational within an hour.',
  },
]

export default function PricingPageClient() {
  const [loadingTier, setLoadingTier] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoveredTier, setHoveredTier] = useState<string | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  async function handleCheckout(tier: string) {
    if (!isPaidTier(tier)) return
    setLoadingTier(tier)
    setError(null)

    const result = await startCheckoutRedirect(tier)
    if (result.ok) return

    // Unauthed visitors get routed to signup, which resumes checkout post-auth.
    if (result.status === 401) {
      window.location.href = `/signup?tier=${tier}`
      return
    }

    setError(result.error ?? 'Failed to create checkout session')
    setLoadingTier(null)
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
            AI-powered operations for digital agencies. Got an invite code? Your first
            month is on us — apply it at checkout.
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
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

        {/* Feature Comparison Table */}
        <PricingComparisonTable />

        {/* FAQ Section */}
        <div style={{ marginTop: 64, maxWidth: 720, marginLeft: 'auto', marginRight: 'auto' }}>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: C.textPrimary,
              letterSpacing: '-0.01em',
              textAlign: 'center',
              margin: '0 0 32px 0',
            }}
          >
            Frequently asked questions
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FAQ_ITEMS.map((item, idx) => {
              const isOpen = openFaq === idx
              return (
                <div
                  key={idx}
                  style={{
                    ...S.cardLight,
                    padding: 0,
                    overflow: 'hidden',
                  }}
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '14px 16px',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary }}>
                      {item.q}
                    </span>
                    <ChevronDown
                      size={16}
                      style={{
                        color: C.textDim,
                        flexShrink: 0,
                        transition: 'transform 200ms',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                      }}
                    />
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 16px 14px' }}>
                      <p
                        style={{
                          fontSize: 14,
                          color: C.textSecondary,
                          lineHeight: 1.55,
                          margin: 0,
                        }}
                      >
                        {item.a}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer note */}
        <div
          style={{
            marginTop: 48,
            textAlign: 'center',
            fontSize: 14,
            color: C.textDim,
          }}
        >
          <p style={{ margin: 0 }}>
            All prices in AUD, exclusive of GST. Invite codes applied at Stripe checkout.
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

      <Footer />
    </main>
  )
}
