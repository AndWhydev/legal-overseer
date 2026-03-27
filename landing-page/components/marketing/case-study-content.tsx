import Link from "next/link";
import { ArrowRight, Building2, MapPin } from "lucide-react";

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
    <div className="flex flex-col items-center gap-1 rounded-lg border border-[#e8e4dc] bg-white p-5 text-center">
      <span
        className="text-2xl font-semibold tracking-tight text-[#1a1a1a]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {value}
      </span>
      <span className="text-[14px] font-medium text-[#1a1a1a]">{label}</span>
      <span className="text-[13px] leading-snug text-[#8b6f47]">{context}</span>
    </div>
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
    <div className="flex flex-col gap-1.5 rounded-lg border border-[#e8e4dc] bg-[#faf9f0] p-4">
      <span className="text-[14px] font-medium text-[#1a1a1a]">{name}</span>
      <span className="text-[14px] leading-relaxed text-[#6b6560]">
        {description}
      </span>
    </div>
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
    <div className="flex flex-col gap-1.5 rounded-lg border border-[#e8e4dc] bg-white p-5">
      <span
        className="text-3xl font-semibold tracking-tight text-[#1a1a1a]"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {number}
      </span>
      <span className="text-[14px] font-medium text-[#1a1a1a]">{label}</span>
      <span className="text-[13px] leading-snug text-[#6b6560]">{context}</span>
    </div>
  );
}

// -- Main Component --

export default function CaseStudyContent() {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-16">
      {/* Header */}
      <div className="mb-12">
        <div className="mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-lg border border-[#e8e4dc] bg-white">
          <span
            className="text-lg font-semibold tracking-tight text-[#1a1a1a]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            AWU
          </span>
        </div>

        <h1
          className="mb-2 text-xl font-semibold tracking-tight text-[#1a1a1a]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          All Webbed Up
        </h1>

        <p className="mb-4 text-[15px] leading-relaxed text-[#6b6560]">
          How a Brisbane digital agency automated their operations with BitBit
        </p>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[#f5f3ea] px-3 py-1 text-[13px] font-medium text-[#6b6560]">
            <Building2 size={14} />
            Marketing Agency
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-[#f5f3ea] px-3 py-1 text-[13px] font-medium text-[#6b6560]">
            <MapPin size={14} />
            Brisbane, Australia
          </span>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard value="10+" label="Hours/week saved" context="Time reclaimed from manual admin" />
        <StatCard value="5" label="AI agents active" context="Running simultaneously" />
        <StatCard value="< 2 min" label="Lead response" context="From inquiry to drafted reply" />
        <StatCard value="30+" label="Clients managed" context="All serviced through BitBit" />
      </div>

      {/* The Challenge */}
      <section className="mb-12">
        <h2 className="mb-4 text-[13px] font-medium uppercase tracking-wide text-[#8b6f47]">
          The Challenge
        </h2>
        <div className="flex flex-col gap-4 rounded-lg border border-[#e8e4dc] bg-white p-6">
          <p className="text-[14px] leading-relaxed text-[#6b6560]">
            Andy Taleb runs All Webbed Up, a digital marketing agency in Brisbane. His team manages
            multiple client accounts -- proposals, content calendars, invoicing, and lead generation
            across dozens of active clients.
          </p>
          <p className="text-[14px] leading-relaxed text-[#6b6560]">
            The problem was not a lack of tools. It was a lack of time. Andy was spending hours each
            day on admin instead of client work. Leads were going cold because response time was too
            slow. Invoicing happened at 9pm because the rest of the day was consumed by delivery.
            Client context was scattered across email, WhatsApp, and project tools.
          </p>
          <p className="text-[14px] leading-relaxed text-[#6b6560]">
            The agency needed a system that could handle the operational overhead automatically --
            not another dashboard to check, but something that could act on its own.
          </p>
        </div>
      </section>

      {/* The Solution */}
      <section className="mb-12">
        <h2 className="mb-4 text-[13px] font-medium uppercase tracking-wide text-[#8b6f47]">
          The Solution
        </h2>
        <p className="mb-4 text-[14px] leading-relaxed text-[#6b6560]">
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

      {/* The Results */}
      <section className="mb-12">
        <h2 className="mb-4 text-[13px] font-medium uppercase tracking-wide text-[#8b6f47]">
          The Results
        </h2>

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

      {/* Pull Quote */}
      <section className="mb-12">
        <div className="rounded-lg border-2 border-[#FF5A1F]/20 bg-[#fff8f4] p-8 text-center">
          <blockquote>
            <p
              className="mb-4 text-lg italic leading-relaxed text-[#1a1a1a]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              &ldquo;This thing can be sold to a marketing agency worldwide and they&rsquo;d
              probably jump at it. It just handles everything.&rdquo;
            </p>
            <footer className="text-[14px] text-[#6b6560]">
              <strong className="font-medium text-[#1a1a1a]">Andy Taleb</strong>
              {" "}&mdash;{" "}
              Founder, All Webbed Up
            </footer>
          </blockquote>
        </div>
      </section>

      {/* What's Next */}
      <section className="mb-12">
        <h2 className="mb-4 text-[13px] font-medium uppercase tracking-wide text-[#8b6f47]">
          What&apos;s Next
        </h2>
        <p className="mb-6 text-[14px] leading-relaxed text-[#6b6560]">
          All Webbed Up is expanding their automation with BitBit&apos;s Growth tools -- SEO Monitor
          for tracking client rankings, Content Creator for scaling blog output, and Tender Hunter
          for catching new government and enterprise opportunities before competitors.
        </p>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/pricing"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#FF5A1F] px-6 text-[14px] font-medium text-white transition-colors hover:bg-[#E44E17] bb-orange-fill-noise"
          >
            See pricing
            <ArrowRight size={16} />
          </Link>
          <Link
            href="https://app.bitbit.chat/login"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#e8e4dc] px-6 text-[14px] font-medium text-[#1a1a1a] transition-colors hover:border-[#d4cfc6] hover:bg-[#f5f3ea]"
          >
            Start your 30-day free trial
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
