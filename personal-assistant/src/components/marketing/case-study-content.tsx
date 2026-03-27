'use client'

import Link from 'next/link'
import { ArrowRight, Building2, MapPin } from 'lucide-react'
import { S, C } from '@/lib/styles/design-tokens'

// ── Stat Cards ──

interface StatCardProps {
  value: string
  label: string
  context: string
}

function StatCard({ value, label, context }: StatCardProps) {
  return (
    <div
      style={{
        ...S.card,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 4,
      }}
    >
      <span
        style={{
          ...S.mono,
          fontSize: 24,
          letterSpacing: '-0.03em',
        }}
      >
        {value}
      </span>
      <span style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: C.textDim, lineHeight: 1.4 }}>
        {context}
      </span>
    </div>
  )
}

// ── Agent Role Card ──

interface AgentRoleProps {
  name: string
  description: string
}

function AgentRole({ name, description }: AgentRoleProps) {
  return (
    <div
      style={{
        ...S.cardLight,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary }}>
        {name}
      </span>
      <span style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.5 }}>
        {description}
      </span>
    </div>
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
    <div
      style={{
        ...S.card,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <span
        style={{
          ...S.mono,
          fontSize: 28,
          letterSpacing: '-0.03em',
        }}
      >
        {number}
      </span>
      <span style={{ fontSize: 14, fontWeight: 500, color: C.textPrimary }}>
        {label}
      </span>
      <span style={{ fontSize: 13, color: C.textSecondary, lineHeight: 1.45 }}>
        {context}
      </span>
    </div>
  )
}

// ── Main Component ──

export default function CaseStudyContent() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '64px 24px 0' }}>
      {/* Header */}
      <div style={{ marginBottom: 48 }}>
        {/* Logo placeholder */}
        <div
          style={{
            ...S.card,
            width: 72,
            height: 72,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            padding: 0,
          }}
        >
          <span
            style={{
              ...S.mono,
              fontSize: 18,
              letterSpacing: '-0.04em',
            }}
          >
            AWU
          </span>
        </div>

        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: C.textPrimary,
            letterSpacing: '-0.02em',
            margin: '0 0 8px 0',
            lineHeight: 1.3,
          }}
        >
          All Webbed Up
        </h1>

        <p
          style={{
            fontSize: 15,
            color: C.textSecondary,
            margin: '0 0 16px 0',
            lineHeight: 1.5,
          }}
        >
          How a Brisbane digital agency automated their operations with BitBit
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              ...S.badge,
              gap: 6,
            }}
          >
            <Building2 size={14} />
            Marketing Agency
          </span>
          <span
            style={{
              ...S.badge,
              gap: 6,
            }}
          >
            <MapPin size={14} />
            Brisbane, Australia
          </span>
        </div>
      </div>

      {/* Quick Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 48,
        }}
      >
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
      <section style={{ marginBottom: 48 }}>
        <h2
          style={{
            ...S.sectionLabel,
            margin: '0 0 16px 0',
          }}
        >
          The Challenge
        </h2>
        <div
          style={{
            ...S.card,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.6, margin: 0 }}>
            Andy Taleb runs All Webbed Up, a digital marketing agency in Brisbane. His team manages
            multiple client accounts -- proposals, content calendars, invoicing, and lead generation
            across dozens of active clients.
          </p>
          <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.6, margin: 0 }}>
            The problem was not a lack of tools. It was a lack of time. Andy was spending hours each
            day on admin instead of client work. Leads were going cold because response time was too
            slow. Invoicing happened at 9pm because the rest of the day was consumed by delivery.
            Client context was scattered across email, WhatsApp, and project tools.
          </p>
          <p style={{ fontSize: 14, color: C.textSecondary, lineHeight: 1.6, margin: 0 }}>
            The agency needed a system that could handle the operational overhead automatically --
            not another dashboard to check, but something that could act on its own.
          </p>
        </div>
      </section>

      {/* The Solution */}
      <section style={{ marginBottom: 48 }}>
        <h2
          style={{
            ...S.sectionLabel,
            margin: '0 0 16px 0',
          }}
        >
          The Solution
        </h2>
        <p
          style={{
            fontSize: 14,
            color: C.textSecondary,
            lineHeight: 1.6,
            margin: '0 0 16px 0',
          }}
        >
          BitBit was configured with agency-specific agent roles, each handling a different
          operational function. Andy set autonomy levels per role -- some run fully on autopilot,
          others co-pilot with human approval for high-stakes actions.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
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
      <section style={{ marginBottom: 48 }}>
        <h2
          style={{
            ...S.sectionLabel,
            margin: '0 0 16px 0',
          }}
        >
          The Results
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
          }}
        >
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
      <section style={{ marginBottom: 48 }}>
        <div
          style={{
            ...S.card,
            padding: '32px 28px',
            textAlign: 'center',
            border: `1px solid ${C.borderHover}`,
          }}
        >
          <blockquote
            style={{
              margin: 0,
              padding: 0,
            }}
          >
            <p
              style={{
                fontSize: 18,
                fontStyle: 'italic',
                fontFamily: 'var(--font-serif, Georgia, serif)',
                color: C.textPrimary,
                lineHeight: 1.6,
                margin: '0 0 16px 0',
              }}
            >
              &ldquo;This thing can be sold to a marketing agency worldwide and they&rsquo;d
              probably jump at it. It just handles everything.&rdquo;
            </p>
            <footer
              style={{
                fontSize: 14,
                color: C.textSecondary,
              }}
            >
              <strong style={{ color: C.textPrimary, fontWeight: 500 }}>Andy Taleb</strong>
              {' '}
              <span style={{ color: C.textDim }}>--</span>
              {' '}
              Founder, All Webbed Up
            </footer>
          </blockquote>
        </div>
      </section>

      {/* What's Next */}
      <section style={{ marginBottom: 48 }}>
        <h2
          style={{
            ...S.sectionLabel,
            margin: '0 0 16px 0',
          }}
        >
          What&apos;s Next
        </h2>
        <p
          style={{
            fontSize: 14,
            color: C.textSecondary,
            lineHeight: 1.6,
            margin: '0 0 24px 0',
          }}
        >
          All Webbed Up is expanding their automation with BitBit&apos;s Growth tools -- SEO Monitor
          for tracking client rankings, Content Creator for scaling blog output, and Tender Hunter
          for catching new government and enterprise opportunities before competitors.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link
            href="/pricing"
            style={{
              ...S.button,
              ...S.buttonPrimary,
              textDecoration: 'none',
            }}
          >
            See pricing
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/onboard"
            style={{
              ...S.button,
              ...S.buttonGhost,
              textDecoration: 'none',
            }}
          >
            Start your 30-day free trial
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  )
}
