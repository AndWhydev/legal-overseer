'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'

// Preload Stripe.js for fraud detection and faster checkout redirect
// The promise triggers Stripe.js loading; actual checkout uses URL redirect
const _stripePreload = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null

interface Tier {
  name: string
  price: string
  priceNum: number | null
  period: string
  description: string
  cogs: string
  features: string[]
  cta: string
  tier: string | null // null for Enterprise (no checkout)
  href: string | null // only for Enterprise mailto
  highlighted: boolean
}

const TIERS: Tier[] = [
  {
    name: 'Starter',
    price: '$199',
    priceNum: 199,
    period: '/mo',
    description: 'For solo operators getting started with AI ops.',
    cogs: 'Low COGS ~$51',
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
    cogs: 'Medium COGS ~$65',
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
    cogs: 'High COGS ~$106',
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
    cogs: 'Custom pricing',
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

  async function handleCheckout(tier: string) {
    setLoadingTier(tier)
    setError(null)

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier,
          successUrl: `${window.location.origin}/dashboard?checkout=success`,
          cancelUrl: `${window.location.origin}/pricing?checkout=cancelled`,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        // If not authenticated, redirect to login with checkout intent
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

      // Redirect to Stripe Checkout page
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoadingTier(null)
    }
  }

  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center mb-14">
          <h1 className="text-4xl font-semibold mb-3">Simple, transparent pricing</h1>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            AI-powered operations for digital agencies. Start with a 30-day free trial, no
            credit card required.
          </p>
        </div>

        {error && (
          <div className="mb-8 mx-auto max-w-md p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm text-center">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-500 hover:text-red-700 font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={[
                'rounded-xl border p-6 flex flex-col',
                tier.highlighted
                  ? 'border-blue-500 ring-2 ring-blue-100 shadow-lg'
                  : 'border-gray-200',
              ].join(' ')}
            >
              {tier.highlighted && (
                <span className="text-xs font-medium text-blue-600 bg-blue-50 rounded-full px-3 py-1 self-start mb-3">
                  Most Popular
                </span>
              )}
              <h2 className="text-xl font-semibold">{tier.name}</h2>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold">{tier.price}</span>
                {tier.period && (
                  <span className="text-gray-500 text-sm">{tier.period}</span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-2">{tier.description}</p>

              <ul className="mt-6 space-y-2 flex-1">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check size={16} className="text-green-500 mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {tier.tier ? (
                <button
                  onClick={() => handleCheckout(tier.tier!)}
                  disabled={loadingTier !== null}
                  className={[
                    'mt-6 block w-full text-center rounded-lg px-4 py-2.5 text-sm font-medium transition',
                    tier.highlighted
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-gray-900 text-white hover:bg-gray-800',
                    loadingTier === tier.tier ? 'opacity-60 cursor-wait' : '',
                    loadingTier !== null && loadingTier !== tier.tier ? 'opacity-40 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {loadingTier === tier.tier ? 'Redirecting...' : tier.cta}
                </button>
              ) : (
                <Link
                  href={tier.href!}
                  className={[
                    'mt-6 block text-center rounded-lg px-4 py-2.5 text-sm font-medium transition',
                    'bg-gray-900 text-white hover:bg-gray-800',
                  ].join(' ')}
                >
                  {tier.cta}
                </Link>
              )}

              <p className="text-xs text-gray-400 mt-2 text-center">{tier.cogs}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center text-sm text-gray-500">
          <p>All prices in AUD, exclusive of GST. 30-day free trial on all plans.</p>
          <p className="mt-1">
            <Link href="/terms" className="underline hover:text-gray-700">Terms</Link>
            {' | '}
            <Link href="/privacy" className="underline hover:text-gray-700">Privacy</Link>
          </p>
        </div>
      </div>
    </main>
  )
}
