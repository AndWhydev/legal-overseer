import type { Metadata } from 'next'
import PricingPageClient from './pricing-page-client'

export const metadata: Metadata = {
  title: 'Pricing | BitBit',
  description:
    'AI operations pricing for agencies. Start free or trial any paid plan for 30 days, no credit card required.',
  keywords: [
    'AI business assistant pricing',
    'automated invoicing plans',
    'agency automation pricing',
    'AI operations cost',
  ],
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What happens after my free trial?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'After 30 days, your account downgrades to the Free plan automatically. You keep all your data, contacts, and configuration -- you just lose access to paid agents and higher token limits. Upgrade anytime to pick up where you left off.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can I change plans?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes. Upgrade or downgrade anytime from your billing settings. Upgrades take effect immediately with prorated billing. Downgrades apply at the end of your current billing cycle.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are AI tokens?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Tokens power every agent operation -- each message triage, invoice generation, lead qualification, and content creation uses tokens. The monthly allocation resets each billing cycle. Most agencies on Growth never hit their limit.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do you offer annual pricing?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Not yet, but it is coming soon. Subscribe to our newsletter to be the first to know when annual plans launch with a discount.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is there a setup fee?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No. Connect your email, WhatsApp, and other services, configure your agents, and you are running. Most teams are fully operational within an hour.',
      },
    },
  ],
}

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <PricingPageClient />
    </>
  )
}
