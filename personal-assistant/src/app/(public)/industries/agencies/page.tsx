import type { Metadata } from 'next'
import {
  FileText,
  Clock,
  Repeat,
  Receipt,
} from 'lucide-react'
import IndustryPageTemplate from '@/components/marketing/industry-page-template'

export const metadata: Metadata = {
  title: 'BitBit for Marketing Agencies',
  description:
    'AI operations built for agencies. Automate proposals, triage client messages, manage invoices, and nurture leads -- all in one platform.',
  keywords: [
    'marketing agency automation',
    'agency AI operations',
    'digital agency AI assistant',
    'agency proposal automation',
  ],
  openGraph: {
    title: 'BitBit for Marketing Agencies',
    description:
      'AI operations built for agencies. Automate proposals, triage client messages, manage invoices, and nurture leads.',
    url: 'https://bitbit.chat/industries/agencies',
  },
}

const webPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'BitBit for Marketing Agencies',
  description:
    'AI operations built for marketing agencies. Automate proposals, triage client messages, manage invoices, and nurture leads.',
  url: 'https://bitbit.chat/industries/agencies',
}

export default function AgenciesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <IndustryPageTemplate
      industry="Marketing Agencies"
      headline="Stop drowning in client admin"
      subheadline="Agencies juggle multiple client accounts, proposals, content calendars, and reporting. BitBit handles the admin across all of them so your team can focus on the creative work that actually wins clients."
      painPoints={[
        {
          icon: FileText,
          title: 'Proposal bottleneck',
          description:
            'Hours spent writing proposals that could be drafted in minutes. Every delayed proposal is a lost opportunity.',
        },
        {
          icon: Clock,
          title: 'Lead response time',
          description:
            'Hot leads go cold while you are servicing existing clients. By the time you reply, they have moved on.',
        },
        {
          icon: Repeat,
          title: 'Content treadmill',
          description:
            '5 clients, 4 platforms, weekly posts. The volume never stops. One missed deadline and client trust erodes.',
        },
        {
          icon: Receipt,
          title: 'Invoice chase',
          description:
            'Chasing payments instead of doing client work. Late invoices stack up when you are too busy delivering.',
        },
      ]}
      roles={[
        {
          name: 'Finance',
          description:
            'Automated invoicing, collections reminders, and cash flow tracking across all client accounts.',
          example:
            'BitBit invoices the client the day the project is marked complete -- no more 3-week delays.',
        },
        {
          name: 'Comms',
          description:
            'Triage across email, Slack, and WhatsApp. Response drafting in your voice. Follow-up tracking.',
          example:
            'Triages 200 overnight messages. Drafts replies for the 8 that matter. Flags 2 that need your eyes.',
        },
        {
          name: 'Sales',
          description:
            'Proposal drafting, lead nurture sequences, onboarding workflows, pipeline analytics.',
          example:
            'New enquiry at 11pm? BitBit sends a personalised response before you wake up.',
        },
        {
          name: 'Content Creator',
          description:
            'Social post generation, blog drafts, and content calendar management across all client accounts.',
          example:
            'Weekly content batches drafted and queued for review -- across every client, every platform.',
        },
        {
          name: 'Ad Script Generator',
          description:
            'Platform-adapted ad copy for Meta, Google, LinkedIn, and TikTok.',
          example:
            'One brief in, four platform-ready scripts out. BitBit adapts tone and format automatically.',
        },
      ]}
      recommendedTier="Growth"
      tierPrice="$349/mo"
    />
    </>
  )
}
