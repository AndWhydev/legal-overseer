'use client'

import { IconBrain, IconFilter, IconAdjustments, IconPlug } from '@tabler/icons-react'
import { Card, CardContent } from '@/components/ui/card'
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
      'Remembers every conversation, relationship, and project detail. BitBit knows who Sezer is, what the work was, and whether it has been invoiced.',
  },
  {
    Icon: IconFilter,
    title: 'Smart Triage',
    description:
      'Automatically categorises and prioritises all incoming messages across email, WhatsApp, and Slack. Your important stuff floats to the top.',
  },
  {
    Icon: IconAdjustments,
    title: 'Graduated Autonomy',
    description:
      'You control how much BitBit does. Observer mode watches and learns. Co-pilot drafts for your approval. Autopilot handles it end to end.',
  },
  {
    Icon: IconPlug,
    title: '20+ Integrations',
    description:
      'Gmail, Outlook, WhatsApp, Slack, Stripe, Calendar, and more. BitBit meets your team where they already work.',
  },
]

export default function FeaturesSection() {
  return (
    <section className="py-24 px-5 relative z-[5]">
      <div className="max-w-[1100px] mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-[clamp(24px,4vw,36px)] font-medium mb-4 tracking-tight text-foreground">
            Why BitBit?
          </h2>
          <p className="text-base text-muted-foreground max-w-[600px] mx-auto leading-relaxed">
            Built for businesses that need AI which understands context, respects boundaries, and actually gets things done.
          </p>
        </div>

        {/* Features grid - 2x2 */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
          {FEATURES.map(({ Icon, title, description }) => (
            <Card
              key={title}
              className="py-8 px-6 transition-all duration-300 hover:bg-muted hover:border-border hover:-translate-y-1"
            >
              <CardContent className="p-0">
                <div className="w-12 h-12 rounded-xl bg-muted border border-border flex items-center justify-center mb-4">
                  <Icon size={22} className="text-muted-foreground" />
                </div>
                <h3 className="text-base font-medium mb-2 text-foreground">
                  {title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
