'use client'

import Link from 'next/link'
import { IconMail, IconBrandWhatsapp, IconCreditCard, IconCalendar, IconHash, IconWorld } from '@tabler/icons-react'
import { Button } from '@/components/ui/button'
import type { Icon as TablerIcon } from '@tabler/icons-react'

const INTEGRATIONS: { name: string; Icon: TablerIcon }[] = [
  { name: 'Gmail', Icon: IconMail },
  { name: 'WhatsApp', Icon: IconBrandWhatsapp },
  { name: 'Stripe', Icon: IconCreditCard },
  { name: 'Calendar', Icon: IconCalendar },
  { name: 'Slack', Icon: IconHash },
  { name: 'Outlook', Icon: IconWorld },
]

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-5 py-20 bg-background overflow-hidden">
      {/* Background gradient orbs */}
      <div
        className="absolute -top-[40%] -right-[20%] w-[600px] h-[600px] rounded-full blur-[80px] opacity-[0.06] bg-foreground animate-[heroFloat_20s_ease-in-out_infinite]"
      />
      <div
        className="absolute -bottom-[30%] -left-[10%] w-[500px] h-[500px] rounded-full blur-[80px] opacity-[0.04] bg-foreground animate-[heroFloat_25s_ease-in-out_infinite_reverse]"
      />

      <div className="relative z-10 max-w-[900px] text-center">
        {/* Main Headline */}
        <h1 className="text-[clamp(32px,6vw,56px)] font-medium leading-[1.15] mb-6 tracking-tighter text-foreground">
          Your business, on autopilot.
        </h1>

        {/* Subheadline */}
        <p className="text-base text-muted-foreground mb-12 leading-relaxed max-w-[680px] mx-auto">
          BitBit reads your emails, manages invoices, follows up with clients, hunts tenders,
          and remembers everything. It handles the admin so you can do the work you&apos;re good at.
        </p>

        {/* Dual CTA */}
        <div className="flex gap-4 justify-center mb-14 flex-wrap">
          <Button asChild size="lg" className="h-12 px-8 text-base">
            <Link href="/signup">
              Start Trial
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 px-8 text-base">
            <Link href="/pricing">
              See Pricing
            </Link>
          </Button>
        </div>

        {/* Trust line + integration icons */}
        <div className="flex flex-col items-center gap-5">
          <p className="text-sm text-muted-foreground uppercase tracking-widest">
            Trusted by agencies across Australia
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            {INTEGRATIONS.map(({ name, Icon }) => (
              <div
                key={name}
                className="flex items-center justify-center w-11 h-11 rounded-xl bg-muted border border-border transition-colors hover:bg-muted hover:border-border"
                title={name}
              >
                <Icon size={18} className="text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes heroFloat {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(30px, -30px); }
        }
      `}</style>
    </section>
  )
}
