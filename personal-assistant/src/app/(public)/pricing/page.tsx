'use client'

import type { Metadata } from 'next'
import Link from 'next/link'
import { SFCheckmark } from 'sf-symbols-lib'

interface Tier {
  name: string
  price: string
  priceNum: number | null
  period: string
  description: string
  cogs: string
  features: string[]
  cta: string
  href: string
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
      'Email + WhatsApp triage',
      'Client comms drafting',
      'Basic analytics',
      '50k AI tokens/mo',
    ],
    cta: 'Start Free Trial',
    href: '/api/billing/checkout?tier=starter',
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
      'Proposal generation',
      'Revenue agents',
      'Client onboarding flows',
      'Priority support',
      '200k AI tokens/mo',
    ],
    cta: 'Start Free Trial',
    href: '/api/billing/checkout?tier=growth',
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
      'Ad script generator',
      'AI search optimiser',
      'Tender hunter',
      'Advanced analytics & MRR',
      'Custom voice profiles',
      '500k AI tokens/mo',
    ],
    cta: 'Start Free Trial',
    href: '/api/billing/checkout?tier=scale',
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
    href: 'mailto:sales@bitbit.au',
    highlighted: false,
  },
]

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="text-center mb-14">
          <h1 className="text-4xl font-semibold mb-3">Simple, transparent pricing</h1>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            AI-powered operations for digital agencies. Start with a 14-day free trial, no
            credit card required.
          </p>
        </div>

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
                    <SFCheckmark size={16} className="text-green-500 mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={tier.href}
                className={[
                  'mt-6 block text-center rounded-lg px-4 py-2.5 text-sm font-medium transition',
                  tier.highlighted
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-900 text-white hover:bg-gray-800',
                ].join(' ')}
              >
                {tier.cta}
              </Link>

              <p className="text-xs text-gray-400 mt-2 text-center">{tier.cogs}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center text-sm text-gray-500">
          <p>All prices in AUD, exclusive of GST. 14-day free trial on all plans.</p>
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
