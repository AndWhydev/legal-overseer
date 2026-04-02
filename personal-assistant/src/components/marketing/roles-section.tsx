'use client'

import { IconCurrencyDollar, IconMessage, IconTrendingUp } from '@tabler/icons-react'
import { Card, CardContent } from '@/components/ui/card'
import type { Icon as TablerIcon } from '@tabler/icons-react'

interface Role {
  Icon: TablerIcon
  name: string
  handles: string
  example: string
}

const ROLES: Role[] = [
  {
    Icon: IconCurrencyDollar,
    name: 'Finance',
    handles: 'Invoicing, collections, cash flow tracking, payment learning',
    example: '"Hey Bit, invoice Dave for the kitchen job" -- and it knows the rate, the scope, and whether it has been sent before.',
  },
  {
    Icon: IconMessage,
    name: 'Comms',
    handles: 'Triage, response drafting, follow-ups, relationship health',
    example: 'Triages 200 messages overnight. Drafts replies in your voice. Flags the three that actually need you.',
  },
  {
    Icon: IconTrendingUp,
    name: 'Sales',
    handles: 'Proposals, lead nurture, onboarding, pipeline analytics',
    example: 'A new lead fills out your form at 11pm. BitBit sends a personalised response before you wake up.',
  },
]

export default function RolesSection() {
  return (
    <section className="py-24 px-5 bg-muted/20 relative">
      <div className="max-w-[1100px] mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-[clamp(24px,4vw,36px)] font-medium mb-4 tracking-tight text-foreground">
            Autonomous roles, not dumb agents
          </h2>
          <p className="text-base text-muted-foreground max-w-[640px] mx-auto leading-relaxed">
            Each role understands its domain, remembers context, and operates at the autonomy level you choose.
          </p>
        </div>

        {/* Role cards */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6 mb-12">
          {ROLES.map(({ Icon, name, handles, example }) => (
            <Card
              key={name}
              className="py-8 px-6 transition-all duration-300 hover:bg-muted/50 hover:border-border/80 hover:-translate-y-1"
            >
              <CardContent className="p-0 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-muted/50 border border-border flex items-center justify-center shrink-0">
                    <Icon size={20} className="text-muted-foreground" />
                  </div>
                  <h3 className="text-base font-medium text-foreground">
                    {name}
                  </h3>
                </div>

                <p className="text-sm text-muted-foreground leading-relaxed">
                  {handles}
                </p>

                <div className="p-3 px-4 rounded-lg bg-muted/30 border border-border text-sm text-muted-foreground/80 leading-relaxed italic">
                  {example}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Additional roles note */}
        <p className="text-center text-sm text-muted-foreground/60">
          + Growth tools: SEO Monitor, Tender Hunter, Content Creator, Ad Scripts
        </p>
      </div>
    </section>
  )
}
