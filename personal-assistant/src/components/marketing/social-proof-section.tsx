'use client'

import Link from 'next/link'
import { IconArrowRight } from '@tabler/icons-react'

const STATS = [
  { value: '2,400+', label: 'Messages triaged' },
  { value: '87%', label: 'Admin automated' },
  { value: '<2min', label: 'Avg lead response' },
]

export default function SocialProofSection() {
  return (
    <section className="relative px-5 py-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      <div className="mx-auto max-w-[1100px]">
        {/* Header */}
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-[clamp(24px,4vw,40px)] font-medium tracking-tight text-foreground">
            Built in production, not a lab
          </h2>
          <p className="mx-auto max-w-[560px] text-base leading-relaxed text-muted-foreground">
            BitBit runs real operations for Australian agencies every day.
          </p>
        </div>

        {/* Case study card */}
        <div className="rounded-2xl border border-border/40 bg-card/50 p-8 md:p-10">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.15em] text-emerald-400/80">
            Case Study
          </div>
          <h3 className="mb-3 text-xl font-medium text-foreground md:text-2xl">
            All Webbed Up — a Brisbane agency running on BitBit
          </h3>
          <p className="mb-8 max-w-[600px] text-sm leading-relaxed text-muted-foreground">
            &ldquo;This thing can be sold to a marketing agency worldwide and they&rsquo;d
            probably jump at it.&rdquo;
          </p>

          {/* Stats */}
          <div className="mb-8 grid grid-cols-3 gap-4">
            {STATS.map(({ value, label }) => (
              <div
                key={label}
                className="rounded-xl border border-border/30 bg-muted/15 px-4 py-5 text-center"
              >
                <div className="mb-1 font-mono text-2xl font-medium tracking-tight text-foreground">
                  {value}
                </div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/60">
                  {label}
                </div>
              </div>
            ))}
          </div>

          <Link
            href="/case-study"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 transition-colors hover:text-emerald-300"
          >
            Read full case study <IconArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  )
}
