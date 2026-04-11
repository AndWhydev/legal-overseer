'use client'

import {
  Moon,
  Clock,
  PhoneOff,
  FolderOpen,
} from 'lucide-react'
import IndustryPageTemplate from '@/components/marketing/industry-page-template'

const webPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'BitBit for Trades & Services',
  description:
    'AI operations for tradies. Invoice from the job site, automate follow-ups, and stop doing admin at 9pm. WhatsApp-first, voice-ready.',
  url: 'https://bitbit.chat/industries/trades',
}

export default function TradesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageJsonLd) }}
      />
      <IndustryPageTemplate
      industry="Trades & Services"
      headline="Invoice from the job site, not the office"
      subheadline="Tradies do real work during the day and admin at night. BitBit handles invoicing, follow-ups, and scheduling while your hands are dirty. WhatsApp-first, works from your phone."
      painPoints={[
        {
          icon: Moon,
          title: 'After-hours admin',
          description:
            'Billing and quoting happens at 9pm after a full day on tools. Admin eats into your evenings and weekends.',
        },
        {
          icon: Clock,
          title: 'Forgotten follow-ups',
          description:
            'Client asked for a quote 3 weeks ago -- forgot. By the time you remember, they have hired someone else.',
        },
        {
          icon: PhoneOff,
          title: 'Phone tag',
          description:
            'Missed calls from clients while on a job. Callbacks stack up. Some never happen.',
        },
        {
          icon: FolderOpen,
          title: 'Paper trail',
          description:
            'Receipts, permits, timesheets scattered across your truck, phone, and email. Finding anything takes forever.',
        },
      ]}
      roles={[
        {
          name: 'Finance (Invoice Flow)',
          description:
            'Invoice from a voice note or quick message. Automated payment reminders and collection tracking.',
          example:
            '"Hey Bit, invoice Dave for that kitchen job" -- BitBit knows the rate, the scope, and sends it.',
        },
        {
          name: 'Comms (Channel Triage)',
          description:
            'Monitors WhatsApp, SMS, and email. Auto-responds to common enquiries. Flags urgent calls.',
          example:
            'Client messages at 2pm while you are mid-job. BitBit confirms the booking and sends your availability.',
        },
        {
          name: 'Sentry',
          description:
            'Monitors all inbound channels for new opportunities, urgent requests, and overdue items.',
          example:
            'New quote request comes in via the website. BitBit captures details and adds it to your pipeline.',
        },
      ]}
      recommendedTier="Starter"
      tierPrice="$199/mo"
    />
    </>
  )
}
