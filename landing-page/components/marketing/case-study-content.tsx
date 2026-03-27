"use client";

import Link from "next/link";
import { ArrowRight, Building2, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { BlurFade } from "@/components/ui/blur-fade";
import { NumberTicker } from "@/components/ui/number-ticker";

// -- Stat Card --

function StatCard({
  value,
  label,
  context,
}: {
  value: string;
  label: string;
  context: string;
}) {
  return (
    <Card className="gap-1 py-5 text-center">
      <CardContent className="flex flex-col items-center gap-1 p-0 px-4">
        <span className="font-mono text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </span>
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs leading-snug text-muted-foreground">{context}</span>
      </CardContent>
    </Card>
  );
}

// -- Agent Role Card --

function AgentRole({
  name,
  description,
}: {
  name: string;
  description: string;
}) {
  return (
    <Card className="gap-1.5 border-border bg-background py-4">
      <CardContent className="flex flex-col gap-1.5 p-0 px-4">
        <span className="text-sm font-medium text-foreground">{name}</span>
        <span className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </span>
      </CardContent>
    </Card>
  );
}

// -- Result Metric Card --

function ResultMetric({
  number,
  label,
  context,
}: {
  number: string;
  label: string;
  context: string;
}) {
  return (
    <Card className="gap-1.5 py-5">
      <CardContent className="flex flex-col gap-1.5 p-0 px-5">
        <span className="font-mono text-3xl font-semibold tracking-tight text-foreground">
          {number}
        </span>
        <span className="text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs leading-snug text-muted-foreground">{context}</span>
      </CardContent>
    </Card>
  );
}

// -- Section Heading --

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h2>
  );
}

// -- Main Component --

export default function CaseStudyContent() {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-16">
      {/* Header */}
      <BlurFade delay={0.1} inView>
        <div className="mb-12">
          <Card className="mb-5 inline-flex size-[72px] items-center justify-center p-0">
            <span className="font-mono text-lg font-semibold tracking-tight text-foreground">
              AWU
            </span>
          </Card>

          <h1 className="mb-2 font-serif text-xl font-semibold tracking-tight text-foreground">
            All Webbed Up
          </h1>

          <p className="mb-4 text-[15px] leading-relaxed text-muted-foreground">
            How a Brisbane digital agency automated their operations with BitBit
          </p>

          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <Building2 size={14} />
              Marketing Agency
            </Badge>
            <Badge variant="secondary" className="gap-1.5">
              <MapPin size={14} />
              Brisbane, Australia
            </Badge>
          </div>
        </div>
      </BlurFade>

      {/* Quick Stats */}
      <BlurFade delay={0.2} inView>
        <div className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard value="10+" label="Hours/week saved" context="Time reclaimed from manual admin" />
          <StatCard value="5" label="AI agents active" context="Running simultaneously" />
          <StatCard value="< 2 min" label="Lead response" context="From inquiry to drafted reply" />
          <StatCard value="30+" label="Clients managed" context="All serviced through BitBit" />
        </div>
      </BlurFade>

      {/* The Challenge */}
      <BlurFade delay={0.3} inView>
        <section className="mb-12">
          <SectionHeading>The Challenge</SectionHeading>
          <Card>
            <CardContent className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Andy Taleb runs All Webbed Up, a digital marketing agency in Brisbane. His team manages
                multiple client accounts -- proposals, content calendars, invoicing, and lead generation
                across dozens of active clients.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                The problem was not a lack of tools. It was a lack of time. Andy was spending hours each
                day on admin instead of client work. Leads were going cold because response time was too
                slow. Invoicing happened at 9pm because the rest of the day was consumed by delivery.
                Client context was scattered across email, WhatsApp, and project tools.
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                The agency needed a system that could handle the operational overhead automatically --
                not another dashboard to check, but something that could act on its own.
              </p>
            </CardContent>
          </Card>
        </section>
      </BlurFade>

      {/* The Solution */}
      <BlurFade delay={0.35} inView>
        <section className="mb-12">
          <SectionHeading>The Solution</SectionHeading>
          <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
            BitBit was configured with agency-specific agent roles, each handling a different
            operational function. Andy set autonomy levels per role -- some run fully on autopilot,
            others co-pilot with human approval for high-stakes actions.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <AgentRole
              name="Sentry"
              description="Monitors all channels for urgent items -- client complaints, server alerts, payment failures. Runs on autopilot."
            />
            <AgentRole
              name="Channel Triage"
              description="Every email and WhatsApp message classified, prioritized, with suggested actions ready for review."
            />
            <AgentRole
              name="Invoice Flow"
              description={'"Invoice Dave for the White House RE work" -- BitBit knows who Dave is, what the work was, and the rate. Co-pilot mode for approval.'}
            />
            <AgentRole
              name="Lead Swarm"
              description="New inquiry comes in, qualified and scored within minutes. Draft response ready for high-confidence leads. Autopilot for fast leads."
            />
            <AgentRole
              name="Proposal Bot"
              description="Meeting transcript goes in, branded proposal comes out. Handles the formatting, scope, and pricing automatically."
            />
          </div>
        </section>
      </BlurFade>

      {/* The Results */}
      <BlurFade delay={0.4} inView>
        <section className="mb-12">
          <SectionHeading>The Results</SectionHeading>

          <div className="grid gap-3 sm:grid-cols-2">
            <ResultMetric
              number="50+"
              label="Messages triaged daily"
              context="Across email and WhatsApp, classified and routed automatically"
            />
            <ResultMetric
              number="15-20"
              label="Invoices automated monthly"
              context="Client invoices generated via natural language commands"
            />
            <ResultMetric
              number="< 2 min"
              label="Lead response time"
              context="From hours to under two minutes for qualified leads"
            />
            <ResultMetric
              number="10+"
              label="Admin hours reclaimed"
              context="Per week, redirected from manual ops to client delivery"
            />
          </div>
        </section>
      </BlurFade>

      {/* Pull Quote */}
      <BlurFade delay={0.45} inView>
        <section className="mb-12">
          <Card className="border-2 border-[#FF5A1F]/20 bg-[#FF5A1F]/5">
            <CardContent className="p-8 text-center">
              <blockquote>
                <p className="mb-4 font-serif text-lg italic leading-relaxed text-foreground">
                  &ldquo;This thing can be sold to a marketing agency worldwide and they&rsquo;d
                  probably jump at it. It just handles everything.&rdquo;
                </p>
                <footer className="text-sm text-muted-foreground">
                  <strong className="font-medium text-foreground">Andy Taleb</strong>
                  {" "}&mdash;{" "}
                  Founder, All Webbed Up
                </footer>
              </blockquote>
            </CardContent>
          </Card>
        </section>
      </BlurFade>

      {/* What's Next */}
      <BlurFade delay={0.5} inView>
        <section className="mb-12">
          <SectionHeading>What&apos;s Next</SectionHeading>
          <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
            All Webbed Up is expanding their automation with BitBit&apos;s Growth tools -- SEO Monitor
            for tracking client rankings, Content Creator for scaling blog output, and Tender Hunter
            for catching new government and enterprise opportunities before competitors.
          </p>

          <div className="flex flex-wrap gap-3">
            <Button asChild className="bb-orange-fill-noise bg-[#FF5A1F] hover:bg-[#E44E17]">
              <Link href="/pricing">
                See pricing
                <ArrowRight size={16} />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="https://app.bitbit.chat/login">
                Start your 30-day free trial
                <ArrowRight size={16} />
              </Link>
            </Button>
          </div>
        </section>
      </BlurFade>
    </div>
  );
}
