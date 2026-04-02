'use client'

import {
  IconBrain,
  IconFilter,
  IconAdjustments,
  IconPlug,
  IconFileInvoice,
  IconTargetArrow,
} from '@tabler/icons-react'
import type { Icon as TablerIcon } from '@tabler/icons-react'

interface Feature {
  Icon: TablerIcon
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    Icon: IconBrain,
    title: 'Contextual Memory',
    description:
      'Remembers every conversation, relationship, and project detail. Knows who your clients are, what the scope was, and whether it\'s been invoiced.',
  },
  {
    Icon: IconFilter,
    title: 'Smart Triage',
    description:
      'Automatically categorises and prioritises incoming messages across email, WhatsApp, and Slack. Important stuff floats to the top.',
  },
  {
    Icon: IconAdjustments,
    title: 'Graduated Autonomy',
    description:
      'You control how much BitBit does. Observer mode watches. Co-pilot drafts for approval. Autopilot handles it end to end.',
  },
  {
    Icon: IconFileInvoice,
    title: 'Invoice & Payments',
    description:
      'Generate professional invoices, track payments, chase overdue accounts. Connected to Stripe, Xero, and your bank.',
  },
  {
    Icon: IconTargetArrow,
    title: 'Lead Capture',
    description:
      'Responds to inbound leads in under 2 minutes. Qualifies, books meetings, and pipes straight into your CRM.',
  },
  {
    Icon: IconPlug,
    title: '20+ Integrations',
    description:
      'Gmail, Outlook, WhatsApp, Slack, Stripe, Calendar, Asana, and more. BitBit meets your team where they already work.',
  },
]

export default function FeaturesSection() {
  return (
    <section className="relative z-[5] px-5 py-24" id="features">
      <div className="mx-auto max-w-[1100px]">
        {/* Header */}
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-[clamp(24px,4vw,40px)] font-medium tracking-tight text-foreground">
            Everything your business needs to run itself
          </h2>
          <p className="mx-auto max-w-[560px] text-base leading-relaxed text-muted-foreground">
            Not another chatbot. BitBit is a full operations layer that understands context and gets things done.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, description }) => (
            <div
              key={title}
              className="group rounded-2xl border border-border/40 bg-card/50 p-6 transition-all duration-300 hover:border-emerald-500/20 hover:bg-card/80"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-border/50 bg-muted/30 transition-colors group-hover:border-emerald-500/30 group-hover:bg-emerald-500/[0.06]">
                <Icon size={20} className="text-muted-foreground transition-colors group-hover:text-emerald-400" />
              </div>
              <h3 className="mb-2 text-sm font-medium text-foreground">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
