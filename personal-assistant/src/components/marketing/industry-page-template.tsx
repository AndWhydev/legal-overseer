'use client'

import Link from 'next/link'
import Footer from '@/components/marketing/footer'
import { Button } from '@/components/ui/button'
import type { ComponentType } from 'react'

interface PainPoint {
  icon: ComponentType<{ size?: number; className?: string }>
  title: string
  description: string
}

interface RoleInfo {
  name: string
  description: string
  example: string
}

export interface IndustryPageProps {
  industry: string
  headline: string
  subheadline: string
  painPoints: PainPoint[]
  roles: RoleInfo[]
  recommendedTier: string
  tierPrice: string
}

export default function IndustryPageTemplate({
  industry,
  headline,
  subheadline,
  painPoints,
  roles,
  recommendedTier,
  tierPrice,
}: IndustryPageProps) {
  return (
    <div className="overflow-hidden bg-background text-foreground">
      {/* Hero Banner */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0a0a0f] via-[#0f1419] to-[#141a23] px-5 pb-20 pt-[120px]">
        {/* Subtle background orb */}
        <div
          className="pointer-events-none absolute -right-[15%] -top-[30%] h-[500px] w-[500px] rounded-full bg-foreground/[0.04] blur-[80px]"
        />

        <div className="relative z-10 mx-auto max-w-[800px]">
          <p className="mb-4 text-sm font-medium uppercase tracking-[0.08em] text-muted-foreground">
            BitBit for {industry}
          </p>
          <h1 className="mb-6 text-[clamp(28px,5vw,48px)] font-medium leading-[1.15] tracking-tight">
            {headline}
          </h1>
          <p className="max-w-[640px] text-base leading-relaxed text-muted-foreground">
            {subheadline}
          </p>
        </div>
      </section>

      {/* Pain Points Grid */}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-[1100px]">
          <h2 className="mb-12 text-center text-[clamp(22px,3.5vw,32px)] font-medium tracking-tight">
            Problems you know too well
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-6">
            {painPoints.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="group rounded-xl border border-border bg-card p-7 transition-all hover:-translate-y-1 hover:border-border hover:bg-card"
              >
                <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-border bg-white/[0.04]">
                  <Icon size={20} className="text-muted-foreground" />
                </div>
                <h3 className="mb-2 text-base font-medium">
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How BitBit Helps - Roles */}
      <section className="bg-black/40 px-5 py-20">
        <div className="mx-auto max-w-[800px]">
          <h2 className="mb-12 text-center text-[clamp(22px,3.5vw,32px)] font-medium tracking-tight">
            How BitBit helps
          </h2>
          <div className="flex flex-col gap-5">
            {roles.map(({ name, description, example }) => (
              <div
                key={name}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
              >
                <h3 className="text-base font-medium">
                  {name}
                </h3>
                <p className="text-sm leading-normal text-muted-foreground">
                  {description}
                </p>
                <div className="rounded-lg border border-border bg-white/[0.02] px-3.5 py-2.5 text-sm italic leading-normal text-muted-foreground">
                  {example}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recommended Tier */}
      <section className="px-5 py-20">
        <div className="mx-auto max-w-[600px]">
          <div className="rounded-xl border border-border bg-card px-8 py-10 text-center">
            <p className="mb-3 text-sm font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Recommended for {industry}
            </p>
            <h3 className="mb-2 text-[clamp(22px,3vw,32px)] font-medium">
              {recommendedTier} Plan
            </h3>
            <p className="mb-2 font-mono text-[clamp(28px,4vw,40px)] font-medium tracking-tight">
              {tierPrice}
            </p>
            <p className="mb-8 text-sm text-muted-foreground">
              30-day free trial. No credit card required.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button asChild size="lg">
                <Link href={`/login?redirect=/dashboard&checkout_tier=${recommendedTier.toLowerCase()}`}>
                  Start Free Trial
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/pricing">
                  Compare All Plans
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
