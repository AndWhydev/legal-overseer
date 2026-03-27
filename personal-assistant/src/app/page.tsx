import type { Metadata } from 'next'
import HeroSection from '@/components/marketing/hero-section'
import FeaturesSection from '@/components/marketing/features-section'
import RolesSection from '@/components/marketing/roles-section'
import SocialProofSection from '@/components/marketing/social-proof-section'
import CTASection from '@/components/marketing/cta-section'
import Footer from '@/components/marketing/footer'

export const metadata: Metadata = {
  title: 'BitBit - AI Operations That Actually Work',
  description:
    'BitBit reads your emails, manages invoices, follows up with clients, and remembers everything. AI business operations for agencies, trades, and professional services.',
  openGraph: {
    title: 'BitBit - AI Operations That Actually Work',
    description:
      'AI that handles your business admin so you can do the work you are good at.',
  },
}

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'BitBit',
  url: 'https://bitbit.chat',
  logo: 'https://bitbit.chat/bitbit-app-icon-192.png',
  description:
    'AI operations platform for digital agencies, trades, and professional services',
  sameAs: [],
}

const softwareJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'BitBit',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  url: 'https://bitbit.chat',
  description:
    'Autonomous AI agents that handle invoicing, lead capture, client communications, and business operations',
  offers: {
    '@type': 'AggregateOffer',
    lowPrice: '0',
    highPrice: '599',
    priceCurrency: 'AUD',
    offerCount: '4',
  },
}

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <div className="overflow-hidden bg-background text-foreground">
        <HeroSection />
        <FeaturesSection />
        <RolesSection />
        <SocialProofSection />
        <CTASection />
        <Footer />
      </div>
    </>
  )
}
