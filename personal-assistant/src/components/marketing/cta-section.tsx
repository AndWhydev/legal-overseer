'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function CTASection() {
  return (
    <section className="py-24 px-5">
      <div className="max-w-[700px] mx-auto">
        <Card className="px-10 py-14 text-center">
          <h2 className="text-[clamp(24px,4vw,36px)] font-medium mb-4 tracking-tight text-foreground">
            Ready to stop doing admin?
          </h2>
          <p className="text-base text-muted-foreground mb-8 leading-relaxed max-w-[480px] mx-auto">
            Start your 30-day free trial. No credit card required.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Button asChild size="lg" className="h-12 px-8 text-base">
              <Link href="/onboard">
                Get Started Free
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-8 text-base">
              <Link href="/pricing">
                See Pricing
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    </section>
  )
}
