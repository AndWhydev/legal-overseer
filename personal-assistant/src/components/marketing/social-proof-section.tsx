'use client'

import Link from 'next/link'
import { IconArrowRight } from '@tabler/icons-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const CASE_STUDY_STATS = [
  { value: '2,400+', label: 'Messages triaged' },
  { value: '87%', label: 'Invoices automated' },
  { value: '<2min', label: 'Avg response time' },
]

const TESTIMONIALS = [
  {
    name: 'Marcus Reid',
    role: 'Operations Director',
    company: 'Digital Forward Agency',
    quote:
      'BitBit has cut our admin overhead by 60%. My team can now focus on client strategy instead of triaging emails all day.',
  },
  {
    name: 'Priya Menon',
    role: 'Founder & CEO',
    company: 'Momentum Ventures',
    quote:
      'The graduated autonomy gives us the control we need while the AI handles the repetitive work. Best decision we made.',
  },
]

export default function SocialProofSection() {
  return (
    <section className="py-24 px-5 relative">
      <div className="max-w-[1100px] mx-auto">
        {/* Section header */}
        <div className="text-center mb-16">
          <h2 className="text-[clamp(24px,4vw,36px)] font-medium mb-4 tracking-tight text-foreground">
            Real results, not demos
          </h2>
          <p className="text-base text-muted-foreground max-w-[600px] mx-auto leading-relaxed">
            BitBit is already running operations for Australian businesses.
          </p>
        </div>

        {/* AWU Case Study Card */}
        <Card className="px-8 py-10 mb-12">
          <CardContent className="p-0 flex flex-col gap-8">
            {/* Case study header */}
            <div>
              <p className="text-xs font-medium tracking-widest uppercase text-muted-foreground/60 mb-2">
                Case Study
              </p>
              <h3 className="text-[clamp(18px,3vw,24px)] font-medium text-foreground mb-2">
                All Webbed Up -- How a Brisbane agency automated their operations
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[640px]">
                &quot;Andy put it simply: this thing can be sold to a marketing agency worldwide and they&apos;d probably jump at it.&quot;
              </p>
            </div>

            {/* Stat boxes */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4">
              {CASE_STUDY_STATS.map(({ value, label }) => (
                <div
                  key={label}
                  className="p-5 px-4 rounded-xl bg-muted/30 border border-border text-center"
                >
                  <div className="text-[clamp(20px,3vw,28px)] font-medium text-foreground mb-1 font-mono tracking-tight">
                    {value}
                  </div>
                  <div className="text-xs text-muted-foreground/60 uppercase tracking-wider">
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div>
              <Button asChild variant="link" className="p-0 h-auto gap-2 text-sm font-medium">
                <Link href="/case-study">
                  Read the full case study
                  <IconArrowRight size={16} />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Testimonial cards */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6">
          {TESTIMONIALS.map((t) => (
            <Card
              key={t.name}
              className="py-8 px-6 transition-all duration-300 hover:bg-muted/50 hover:border-border/80 hover:-translate-y-1"
            >
              <CardContent className="p-0 flex flex-col h-full">
                <p className="text-base text-foreground leading-relaxed mb-6 italic flex-1">
                  &quot;{t.quote}&quot;
                </p>
                <div>
                  <p className="text-sm font-medium text-foreground mb-0.5">
                    {t.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t.role} at {t.company}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
