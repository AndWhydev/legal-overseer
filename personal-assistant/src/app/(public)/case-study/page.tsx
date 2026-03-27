import type { Metadata } from 'next'
import CaseStudyContent from '@/components/marketing/case-study-content'
import Footer from '@/components/marketing/footer'

export const metadata: Metadata = {
  title: 'All Webbed Up Case Study | BitBit',
  description:
    'How a Brisbane marketing agency automated operations with BitBit AI agents. 10+ hours/week saved, 50+ messages triaged daily.',
}

export default function CaseStudyPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-primary, #0a0f1a)' }}>
      <CaseStudyContent />
      <Footer />
    </main>
  )
}
