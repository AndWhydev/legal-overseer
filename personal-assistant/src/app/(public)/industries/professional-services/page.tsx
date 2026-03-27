import type { Metadata } from 'next'
import {
  UserX,
  CalendarDays,
  FileCheck,
  UserPlus,
} from 'lucide-react'
import IndustryPageTemplate from '@/components/marketing/industry-page-template'

export const metadata: Metadata = {
  title: 'BitBit for Professional Services',
  description:
    'AI operations for accountants, lawyers, consultants, and service firms. Manage client relationships, automate follow-ups, and keep every relationship healthy.',
}

export default function ProfessionalServicesPage() {
  return (
    <IndustryPageTemplate
      industry="Professional Services"
      headline="Your AI back-office that never sleeps"
      subheadline="Accountants, lawyers, dentists, consultants -- anyone managing many client relationships, appointments, and follow-ups. BitBit keeps every relationship healthy and every detail remembered."
      painPoints={[
        {
          icon: UserX,
          title: 'Relationship decay',
          description:
            'Important clients go quiet and you do not notice until it is too late. By then, they have found someone else.',
        },
        {
          icon: CalendarDays,
          title: 'Scheduling overhead',
          description:
            'Calendar Tetris across dozens of clients. Double-bookings, missed appointments, and constant rescheduling.',
        },
        {
          icon: FileCheck,
          title: 'Compliance paperwork',
          description:
            'Regulatory documentation eats into billable hours. Forms, filings, and audits never stop.',
        },
        {
          icon: UserPlus,
          title: 'Client onboarding',
          description:
            'New client setup takes days of manual work. Welcome packs, data collection, and account creation across systems.',
        },
      ]}
      roles={[
        {
          name: 'Comms',
          description:
            'Relationship health monitoring, follow-up tracking, tone adaptation for each client.',
          example:
            'BitBit notices a key client has gone quiet for 3 weeks and drafts a check-in message in your voice.',
        },
        {
          name: 'Finance',
          description:
            'Invoicing, cash flow projections, and automated payment reminders for all client accounts.',
          example:
            'End of month: BitBit generates invoices for all completed work and sends them -- zero manual effort.',
        },
        {
          name: 'Sales',
          description:
            'Client onboarding workflows, intake forms, and new client setup automation.',
          example:
            'New client signs up? BitBit creates their profile, sends the welcome pack, and schedules the intro call.',
        },
        {
          name: 'Intelligence',
          description:
            'Client Health Score, Revenue Radar, and relationship analytics across your entire book.',
          example:
            'Dashboard shows which clients are at risk, which are growing, and where revenue gaps are forming.',
        },
      ]}
      recommendedTier="Growth"
      tierPrice="$349/mo"
    />
  )
}
