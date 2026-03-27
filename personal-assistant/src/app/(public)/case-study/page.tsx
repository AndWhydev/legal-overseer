import type { Metadata } from 'next'
import CaseStudyContent from '@/components/marketing/case-study-content'
import Footer from '@/components/marketing/footer'

export const metadata: Metadata = {
  title: 'All Webbed Up Case Study | BitBit',
  description:
    'How a Brisbane marketing agency automated operations with BitBit AI agents. 10+ hours/week saved, 50+ messages triaged daily.',
  openGraph: {
    title: 'How All Webbed Up Automated Agency Operations with BitBit',
    description:
      'Case study: Brisbane marketing agency saves 10+ hours per week with AI agents.',
    url: 'https://bitbit.chat/case-study',
    type: 'article',
  },
}

const articleJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'How All Webbed Up Automated Agency Operations with BitBit',
  description:
    'Case study: Brisbane marketing agency saves 10+ hours per week with AI agents',
  author: { '@type': 'Organization', name: 'BitBit' },
  publisher: { '@type': 'Organization', name: 'BitBit' },
  datePublished: '2026-03-26',
  url: 'https://bitbit.chat/case-study',
}

export default function CaseStudyPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <main style={{ minHeight: '100vh', background: 'var(--bg-primary, #0a0f1a)' }}>
        <CaseStudyContent />
        <Footer />
      </main>
    </>
  )
}
