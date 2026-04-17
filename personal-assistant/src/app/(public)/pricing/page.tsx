import type { Metadata } from 'next'
import PricingPageClient from './pricing-page-client'

export const metadata: Metadata = {
  title: 'Pricing | BitBit',
  description:
    'AI operations pricing for agencies. Pick a plan and meet your AI operator — cancel anytime. Invite codes applied at checkout.',
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
      name: 'How do invite codes work?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Invite codes are privately distributed to beta users and high-intent prospects. Apply one at Stripe checkout and your first month is on us. Standard billing resumes in month two — cancel anytime before then to pay nothing.',
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
        text: 'No. Pick where you want to chat with BitBit — iMessage, WhatsApp, Android Messages, Telegram, or our web app — then connect your email and other sources. Most teams are fully operational within an hour.',
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
