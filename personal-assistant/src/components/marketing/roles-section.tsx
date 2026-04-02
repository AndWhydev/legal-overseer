'use client'

import {
  IconCurrencyDollar,
  IconMessage,
  IconTrendingUp,
  IconBriefcase,
} from '@tabler/icons-react'
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
    handles: 'Invoicing · Collections · Cash flow · Payment tracking',
    example:
      '"Invoice Dave for the kitchen job" — knows the rate, the scope, and whether it\'s been sent before.',
  },
  {
    Icon: IconMessage,
    name: 'Comms',
    handles: 'Triage · Response drafting · Follow-ups · Relationship health',
    example:
      'Triages 200 messages overnight. Drafts replies in your voice. Flags the three that actually need you.',
  },
  {
    Icon: IconTrendingUp,
    name: 'Sales',
    handles: 'Proposals · Lead nurture · Onboarding · Pipeline analytics',
    example:
      'A lead fills your form at 11pm. BitBit sends a personalised response before you wake up.',
  },
  {
    Icon: IconBriefcase,
    name: 'Operations',
    handles: 'Task management · Scheduling · Tender hunting · Reporting',
    example:
      'Finds government tenders matching your capabilities, scores them, and drafts the response.',
  },
]

export default function RolesSection() {
  return (
    <section className="relative px-5 py-24">
      {/* Subtle divider gradient */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      <div className="mx-auto max-w-[1100px]">
        {/* Header */}
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-[clamp(24px,4vw,40px)] font-medium tracking-tight text-foreground">
            Autonomous roles, not dumb chatbots
          </h2>
          <p className="mx-auto max-w-[580px] text-base leading-relaxed text-muted-foreground">
            Each role understands its domain, remembers context, and operates at the autonomy level you choose.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {ROLES.map(({ Icon, name, handles, example }) => (
            <div
              key={name}
              className="group rounded-2xl border border-border/40 bg-card/50 p-6 transition-all duration-300 hover:border-emerald-500/20 hover:bg-card/80"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-muted/30 transition-colors group-hover:border-emerald-500/30 group-hover:bg-emerald-500/[0.06]">
                  <Icon size={20} className="text-muted-foreground transition-colors group-hover:text-emerald-400" />
                </div>
                <h3 className="text-sm font-medium text-foreground">{name}</h3>
              </div>

              <p className="mb-4 text-sm text-muted-foreground">{handles}</p>

              <div className="rounded-xl border border-border/30 bg-muted/15 px-4 py-3 text-sm italic leading-relaxed text-muted-foreground/80">
                {example}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground/50">
          + Growth tools: SEO Monitor · Tender Hunter · Content Creator · Ad Script Generator · Website Builder
        </p>
      </div>
    </section>
  )
}
