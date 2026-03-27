import type { Metadata } from 'next'
import PricingPageClient from './pricing-page-client'

export const metadata: Metadata = {
  title: 'Pricing | BitBit',
  description:
    'AI operations pricing for agencies. Start free or trial any paid plan for 30 days, no credit card required.',
}

export default function PricingPage() {
  return <PricingPageClient />
}
