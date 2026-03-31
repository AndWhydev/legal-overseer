"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { BlurFade } from "@/components/ui/blur-fade";
import { NumberTicker } from "@/components/ui/number-ticker";

const TESTIMONIALS = [
  {
    id: 1,
    initials: "MR",
    name: "Marcus Reid",
    role: "Operations Director",
    company: "Digital Forward Agency",
    quote:
      "BitBit has cut our admin overhead by 60%. My team can now focus on client strategy instead of triaging emails all day.",
  },
  {
    id: 2,
    initials: "PM",
    name: "Priya Menon",
    role: "Founder & CEO",
    company: "Momentum Ventures",
    quote:
      "The approval queue feature gives us the control we need while the AI handles the repetitive work. Best decision we made.",
  },
  {
    id: 3,
    initials: "JK",
    name: "James Ko",
    role: "Operations Manager",
    company: "TechScale Consulting",
    quote:
      "Being able to remember context across 20+ Slack channels and email threads has transformed how we service our clients.",
  },
];

const METRICS = [
  { value: 500, suffix: "+", label: "Messages Processed" },
  { value: 99.9, suffix: "%", label: "Uptime" },
  { value: 20, suffix: "+", label: "Integrations" },
];

const PARTNERS = [
  { name: "AI Partner" },
  { name: "Supabase" },
  { name: "Vercel" },
  { name: "Stripe" },
  { name: "Pinecone" },
];

export default function TestimonialsSection() {
  return (
    <section className="bg-secondary px-6 py-24">
      <Separator className="mb-24" />
      <div className="mx-auto max-w-5xl">
        {/* Section Header */}
        <div className="mb-20 text-center">
          <BlurFade delay={0.1} inView>
            <h2 className="mb-4 font-serif text-[clamp(1.75rem,5vw,3rem)] tracking-tight text-foreground">
              Loved by operations teams
            </h2>
          </BlurFade>
          <BlurFade delay={0.2} inView>
            <p className="mx-auto max-w-lg text-base text-muted-foreground">
              See what beta users are saying about BitBit.
            </p>
          </BlurFade>
        </div>

        {/* Testimonials Grid */}
        <div className="mb-20 grid gap-6 md:grid-cols-3">
          {TESTIMONIALS.map((testimonial, i) => (
            <BlurFade key={testimonial.id} delay={0.2 + i * 0.1} inView>
              <Card className="h-full transition-all hover:-translate-y-1 hover:shadow-md">
                <CardContent className="flex h-full flex-col pt-2">
                  {/* Star rating */}
                  <div className="mb-4 flex gap-0.5 text-[#FF5A1F]">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <svg key={j} className="size-4 fill-current" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    ))}
                  </div>

                  <p className="mb-6 flex-1 text-base italic leading-relaxed text-foreground">
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>

                  <div className="flex items-center gap-3">
                    <Avatar className="size-11 border border-[#FF5A1F]/20 bg-[#FF5A1F]/5">
                      <AvatarFallback className="bg-[#FF5A1F]/10 text-xs font-medium text-[#FF5A1F]">
                        {testimonial.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {testimonial.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {testimonial.role} at {testimonial.company}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </BlurFade>
          ))}
        </div>

        {/* Metrics Bar */}
        <BlurFade delay={0.5} inView>
          <Card className="mb-20 border-[#FF5A1F]/10">
            <CardContent className="grid gap-8 px-8 py-10 text-center sm:grid-cols-3">
              {METRICS.map((metric) => (
                <div key={metric.label}>
                  <div className="mb-2 text-lg font-semibold text-[#FF5A1F]">
                    <NumberTicker value={metric.value} />
                    {metric.suffix}
                  </div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    {metric.label}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </BlurFade>

        {/* Partner Badges */}
        <BlurFade delay={0.6} inView>
          <div className="text-center">
            <p className="mb-6 text-xs uppercase tracking-wide text-muted-foreground">
              Built with trust from
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {PARTNERS.map((partner) => (
                <Badge
                  key={partner.name}
                  variant="outline"
                  className="px-4 py-2 text-sm font-medium transition-colors hover:border-[#FF5A1F]/20 hover:bg-[#FF5A1F]/5"
                >
                  {partner.name}
                </Badge>
              ))}
            </div>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}