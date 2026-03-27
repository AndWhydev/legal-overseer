import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'BitBit for Professional Services | BitBit',
  description:
    'AI operations for accountants, lawyers, consultants, and service firms. Manage client relationships, automate follow-ups, and keep every relationship healthy.',
  keywords: [
    'professional services AI',
    'client management automation',
    'accountant AI assistant',
    'law firm automation',
  ],
  openGraph: {
    title: 'BitBit for Professional Services',
    description:
      'AI operations for accountants, lawyers, consultants, and service firms. Manage client relationships and automate follow-ups.',
    url: 'https://bitbit.chat/industries/professional-services',
  },
}

export default function ProfessionalServicesLayout({ children }: { children: React.ReactNode }) {
  return children
}
