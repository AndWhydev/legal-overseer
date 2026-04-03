'use client'

import Link from 'next/link'
import { IconArrowRight, IconBuilding, IconMapPin } from '@tabler/icons-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Stat Cards ──

interface StatCardProps {
  value: string
  label: string
  context: string
}

function StatCard({ value, label, context }: StatCardProps) {
  return (
    <Card className="py-5">
      <CardContent className="flex flex-col items-center text-center gap-1">
        <span className="font-mono text-2xl tracking-tight text-foreground">
          {value}
        </span>
        <span className="text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="text-xs text-muted-foreground leading-snug">
          {context}
        </span>
      </CardContent>
    </Card>
  )
}

// ── Agent Role Card ──

interface AgentRoleProps {
  name: string
  description: string
}

function AgentRole({ name, description }: AgentRoleProps) {
  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">
          {name}
        </span>
        <span className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </span>
      </CardContent>
    </Card>
  )
}

// ── Result Metric Card ──

interface ResultMetricProps {
  number: string
  label: string
  context: string
}

function ResultMetric({ number, label, context }: ResultMetricProps) {
  return (
    <Card className="py-5">
      <CardContent className="flex flex-col gap-1.5">
        <span className="font-mono text-3xl tracking-tight text-foreground">
          {number}
        </span>
        <span className="text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="text-xs text-muted-foreground leading-snug">
          {context}
        </span>
      </CardContent>
    </Card>
  )
}

// ── Main Component ──

export default function CaseStudyContent() {
  return (
    <div className="max-w-[800px] mx-auto px-6 pt-16">
      {/* Header */}
      <div className="mb-12">
        {/* Logo placeholder */}
        <Card className="w-[72px] h-[72px] flex items-center justify-center mb-5 py-0">
          <span className="font-mono text-lg tracking-tighter text-foreground">
            AWU
          </span>
        </Card>

        <h1 className="text-xl font-medium text-foreground tracking-tight mb-2 leading-snug">
          All Webbed Up
        </h1>

        <p className="text-[15px] text-muted-foreground mb-4 leading-relaxed">
          How a Brisbane digital agency automated their operations with BitBit
        </p>

        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1.5">
            <IconBuilding size={14} />
            Marketing Agency
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <IconMapPin size={14} />
            Brisbane, Australia
          </Badge>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 mb-12">
        <StatCard
          value="10+"
          label="Hours/week saved"
          context="Time reclaimed from manual admin"
        />
        <StatCard
          value="5"
          label="AI agents active"
          context="Running simultaneously"
        />
        <StatCard
          value="< 2 min"
          label="Lead response"
          context="From inquiry to drafted reply"
        />
        <StatCard
          value="30+"
          label="Clients managed"
          context="All serviced through BitBit"
        />
      </div>

      {/* The Challenge */}
      <section className="mb-12">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
          The Challenge
        </h2>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Andy Taleb runs All Webbed Up, a digital marketing agency in Brisbane. His team manages
              multiple client accounts -- proposals, content calendars, invoicing, and lead generation
              across dozens of active clients.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The problem was not a lack of tools. It was a lack of time. Andy was spending hours each
              day on admin instead of client work. Leads were going cold because response time was too
              slow. Invoicing happened at 9pm because the rest of the day was consumed by delivery.
              Client context was scattered across email, WhatsApp, and project tools.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              The agency needed a system that could handle the operational overhead automatically --
              not another dashboard to check, but something that could act on its own.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* The Solution */}
      <section className="mb-12">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
          The Solution
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          BitBit was configured with agency-specific agent roles, each handling a different
          operational function. Andy set autonomy levels per role -- some run fully on autopilot,
          others co-pilot with human approval for high-stakes actions.
        </p>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
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

      {/* The Results */}
      <section className="mb-12">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
          The Results
        </h2>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
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

      {/* Pull Quote */}
      <section className="mb-12">
        <Card className="px-7 py-8 text-center border-border/80">
          <blockquote>
            <p className="text-lg italic font-serif text-foreground leading-relaxed mb-4">
              &ldquo;This thing can be sold to a marketing agency worldwide and they&rsquo;d
              probably jump at it. It just handles everything.&rdquo;
            </p>
            <footer className="text-sm text-muted-foreground">
              <strong className="text-foreground font-medium">Andy Taleb</strong>
              {' '}
              <span className="text-muted-foreground/60">--</span>
              {' '}
              Founder, All Webbed Up
            </footer>
          </blockquote>
        </Card>
      </section>

      {/* What's Next */}
      <section className="mb-12">
        <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
          What&apos;s Next
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">
          All Webbed Up is expanding their automation with BitBit&apos;s Growth tools -- SEO Monitor
          for tracking client rankings, Content Creator for scaling blog output, and Tender Hunter
          for catching new government and enterprise opportunities before competitors.
        </p>

        <div className="flex gap-3 flex-wrap">
          <Button asChild size="lg">
            <Link href="/industries/agencies">
              See how BitBit works for agencies
              <IconArrowRight size={16} />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/onboard">
              Start your 30-day free trial
              <IconArrowRight size={16} />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
