'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

const CHANNELS = ['Gmail', 'WhatsApp', 'Slack', 'Outlook', 'Stripe', 'Calendar']

export default function HeroSection() {
  return (
    <section className="relative flex min-h-[92vh] items-center justify-center overflow-hidden px-5 py-20">
      {/* Gradient orbs */}
      <div className="pointer-events-none absolute -top-[30%] right-[10%] h-[500px] w-[500px] rounded-full bg-emerald-500/[0.07] blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-[20%] left-[5%] h-[400px] w-[400px] rounded-full bg-white/[0.03] blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-[860px] text-center">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-1.5 text-xs font-medium tracking-wide text-emerald-400">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Now in public beta
        </div>

        {/* Headline */}
        <h1 className="mb-6 text-[clamp(36px,7vw,68px)] font-medium leading-[1.08] tracking-tighter text-foreground">
          Your business,{' '}
          <span className="bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent">
            on autopilot.
          </span>
        </h1>

        {/* Subheadline */}
        <p className="mx-auto mb-12 max-w-[620px] text-[clamp(15px,1.8vw,18px)] leading-relaxed text-muted-foreground">
          BitBit reads your emails, manages invoices, follows up with clients,
          and remembers everything. AI operations for agencies, trades, and
          professional services.
        </p>

        {/* CTAs */}
        <div className="mb-16 flex flex-wrap justify-center gap-4">
          <Button asChild size="lg" className="h-12 rounded-xl px-8 text-base bg-emerald-500 hover:bg-emerald-600 text-white">
            <Link href="/onboard">Start Free Trial</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 rounded-xl px-8 text-base border-border/50 hover:border-border hover:bg-muted/30">
            <Link href="/pricing">See Pricing</Link>
          </Button>
        </div>

        {/* Channel pills */}
        <div className="flex flex-col items-center gap-4">
          <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground/50">
            Works with your stack
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {CHANNELS.map((ch) => (
              <span
                key={ch}
                className="rounded-lg border border-border/40 bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-emerald-500/30 hover:text-foreground"
              >
                {ch}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
