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

export default function LandingPage() {
  return (
    <div style={{ background: '#0a0a0f', color: '#F1F5F9', overflow: 'hidden' }}>
      <HeroSection />
      <FeaturesSection />
      <RolesSection />
      <SocialProofSection />
      <CTASection />
      <Footer />
    </div>
  )
}
