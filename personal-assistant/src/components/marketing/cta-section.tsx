'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function CTASection() {
  return (
    <section className="relative px-5 py-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />

      <div className="mx-auto max-w-[640px] text-center">
        <h2 className="mb-4 text-[clamp(24px,4vw,40px)] font-medium tracking-tight text-foreground">
          Ready to stop doing admin?
        </h2>
        <p className="mb-10 text-base leading-relaxed text-muted-foreground">
          Start your 30-day free trial. No credit card required.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button asChild size="lg" className="h-12 rounded-xl px-8 text-base bg-emerald-500 hover:bg-emerald-600 text-white">
            <Link href="/onboard">Get Started Free</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 rounded-xl px-8 text-base border-border/50 hover:border-border hover:bg-muted/30">
            <Link href="/pricing">See Pricing</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
