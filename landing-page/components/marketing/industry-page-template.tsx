"use client";

import Link from "next/link";
import MarketingNav from "./marketing-nav";
import MarketingFooter from "./marketing-footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BlurFade } from "@/components/ui/blur-fade";
import type { LucideIcon } from "lucide-react";

interface PainPoint {
  icon: LucideIcon;
  title: string;
  description: string;
}

interface RoleInfo {
  name: string;
  description: string;
  example: string;
}

export interface IndustryPageProps {
  industry: string;
  headline: string;
  subheadline: string;
  painPoints: PainPoint[];
  roles: RoleInfo[];
  recommendedTier: string;
  tierPrice: string;
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
    <div className="min-h-screen bg-background text-foreground">
      <MarketingNav />

      {/* Hero Banner */}
      <section className="relative overflow-hidden px-6 pb-20 pt-32">
        {/* Decorative background */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <svg
            className="absolute -right-32 -top-20 size-[600px] animate-spin-slow opacity-[0.04]"
            viewBox="0 0 400 400"
            fill="none"
          >
            <circle cx="200" cy="200" r="180" stroke="currentColor" strokeWidth="1" strokeDasharray="8 6" className="text-primary" />
            <circle cx="200" cy="200" r="120" stroke="currentColor" strokeWidth="0.8" strokeDasharray="4 8" className="text-muted-foreground" />
          </svg>
        </div>

        <div className="relative z-10 mx-auto max-w-3xl">
          <BlurFade delay={0.1} inView>
            <Badge variant="secondary" className="mb-4 text-xs uppercase tracking-wide">
              BitBit for {industry}
            </Badge>
          </BlurFade>
          <BlurFade delay={0.2} inView>
            <h1 className="mb-6 font-serif text-[clamp(2rem,5vw,3.5rem)] leading-[1.1] tracking-tight text-foreground">
              {headline}
            </h1>
          </BlurFade>
          <BlurFade delay={0.3} inView>
            <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
              {subheadline}
            </p>
          </BlurFade>
        </div>
      </section>

      {/* Pain Points Grid */}
      <section className="px-6 py-20">
        <Separator className="mb-20" />
        <div className="mx-auto max-w-5xl">
          <BlurFade delay={0.1} inView>
            <h2 className="mb-12 text-center font-serif text-[clamp(1.5rem,3.5vw,2.25rem)] tracking-tight text-foreground">
              Problems you know too well
            </h2>
          </BlurFade>
          <div className="grid gap-6 sm:grid-cols-2">
            {painPoints.map(({ icon: Icon, title, description }, i) => (
              <BlurFade key={title} delay={0.2 + i * 0.08} inView>
                <Card className="transition-all hover:-translate-y-1 hover:shadow-md">
                  <CardContent>
                    <div className="mb-4 flex size-11 items-center justify-center rounded-lg border border-border bg-secondary">
                      <Icon size={20} className="text-muted-foreground" />
                    </div>
                    <h3 className="mb-2 text-base font-semibold text-foreground">
                      {title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  </CardContent>
                </Card>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      {/* How BitBit Helps - Roles */}
      <section className="bg-secondary px-6 py-20">
        <Separator className="mb-20" />
        <div className="mx-auto max-w-3xl">
          <BlurFade delay={0.1} inView>
            <h2 className="mb-12 text-center font-serif text-[clamp(1.5rem,3.5vw,2.25rem)] tracking-tight text-foreground">
              How BitBit helps
            </h2>
          </BlurFade>
          <div className="flex flex-col gap-5">
            {roles.map(({ name, description, example }, i) => (
              <BlurFade key={name} delay={0.2 + i * 0.1} inView>
                <Card>
                  <CardContent className="flex flex-col gap-3">
                    <h3 className="text-base font-semibold text-foreground">
                      {name}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                    <div className="rounded-md border border-border bg-background px-4 py-3 text-sm italic leading-relaxed text-muted-foreground">
                      {example}
                    </div>
                  </CardContent>
                </Card>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      {/* Recommended Tier */}
      <section className="px-6 py-20">
        <Separator className="mb-20" />
        <div className="mx-auto max-w-xl">
          <BlurFade delay={0.1} inView>
            <Card className="py-10 text-center">
              <CardContent className="flex flex-col items-center gap-2">
                <Badge variant="secondary" className="mb-1 text-xs uppercase tracking-wide">
                  Recommended for {industry}
                </Badge>
                <h3 className="font-serif text-[clamp(1.5rem,3vw,2.25rem)] tracking-tight text-foreground">
                  {recommendedTier} Plan
                </h3>
                <p className="font-mono text-[clamp(2rem,4vw,3rem)] font-semibold tracking-tight text-foreground">
                  {tierPrice}
                </p>
                <p className="mb-6 text-sm text-muted-foreground">
                  30-day free trial. No credit card required.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <Button asChild size="lg" className="bb-orange-fill-noise bg-[#FF5A1F] hover:bg-[#E44E17]">
                    <Link href="https://app.bitbit.chat/login">
                      Start Free Trial
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <Link href="/pricing">
                      Compare All Plans
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </BlurFade>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
