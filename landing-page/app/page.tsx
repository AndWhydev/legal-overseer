"use client";

import { BlurFade } from "@/components/ui/blur-fade";
import Link from "next/link";

function OrangeNoiseDefs() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute overflow-hidden">
      <defs>
        <pattern id="bb-orange-noise-pattern" patternUnits="userSpaceOnUse" width="8" height="8">
          <rect width="8" height="8" fill="#FF5A1F" />
          <circle cx="1.4" cy="1.3" r="0.7" fill="#ffffff" fillOpacity="0.16" />
          <circle cx="4.7" cy="2.6" r="0.8" fill="#000000" fillOpacity="0.10" />
          <circle cx="6.2" cy="5.8" r="0.6" fill="#ffffff" fillOpacity="0.12" />
          <circle cx="2.8" cy="6.4" r="0.7" fill="#000000" fillOpacity="0.08" />
        </pattern>
      </defs>
    </svg>
  );
}


// ─── SVG Illustrations ──────────────────────────────────────────────

function HeroArt() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Large orbit circle */}
      <svg
        className="absolute -right-32 -top-20 h-[600px] w-[600px] animate-spin-slow opacity-[0.08]"
        viewBox="0 0 400 400"
        fill="none"
      >
        <circle cx="200" cy="200" r="180" stroke="#d97757" strokeWidth="1" strokeDasharray="8 6" />
        <circle cx="200" cy="200" r="120" stroke="#8b6f47" strokeWidth="0.8" strokeDasharray="4 8" />
        <circle cx="200" cy="200" r="60" stroke="#d97757" strokeWidth="0.6" />
      </svg>

      {/* Floating abstract blob top-left */}
      <svg
        className="absolute -left-16 top-24 h-64 w-64 animate-float-gentle opacity-[0.06]"
        viewBox="0 0 200 200"
        fill="none"
      >
        <path
          d="M 80 20 C 120 10, 170 40, 160 90 C 150 140, 100 180, 60 160 C 20 140, 10 80, 40 40 C 55 20, 60 25, 80 20Z"
          stroke="#d97757"
          strokeWidth="1.5"
          strokeDasharray="6 4"
          pathLength="1"
          className="animate-draw-in"
          style={{ strokeDashoffset: 0 }}
        />
      </svg>

      {/* Small floating circles */}
      <svg className="absolute left-1/4 top-1/3 h-4 w-4 animate-float-slow opacity-20" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6" fill="#d97757" />
      </svg>
      <svg className="absolute right-1/3 top-1/4 h-3 w-3 animate-float-gentle opacity-25" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6" fill="#8b6f47" />
      </svg>
      <svg className="absolute right-1/4 bottom-1/3 h-5 w-5 animate-float-slow opacity-20" viewBox="0 0 16 16">
        <rect x="2" y="2" width="12" height="12" rx="2" stroke="#d97757" strokeWidth="1.5" fill="none" />
      </svg>

      {/* Connecting lines */}
      <svg
        className="absolute left-1/2 top-0 h-full w-full -translate-x-1/2 opacity-[0.04]"
        viewBox="0 0 800 600"
        fill="none"
      >
        <path d="M 100 100 Q 400 200 700 150" stroke="#8b6f47" strokeWidth="1" strokeDasharray="4 6" />
        <path d="M 150 400 Q 350 300 650 450" stroke="#d97757" strokeWidth="0.8" strokeDasharray="3 8" />
      </svg>
    </div>
  );
}

function SketchIcon({ type }: { type: "communication" | "operations" | "intelligence" }) {
  if (type === "communication") {
    return (
      <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10 bb-orange-svg-noise">
        <rect x="6" y="10" width="36" height="24" rx="3" stroke="#FF5A1F" strokeWidth="1.5" strokeDasharray="4 2" />
        <path d="M 6 14 L 24 26 L 42 14" stroke="#FF5A1F" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="38" cy="12" r="5" fill="#FF5A1F" fillOpacity="0.15" stroke="#FF5A1F" strokeWidth="1" />
      </svg>
    );
  }
  if (type === "operations") {
    return (
      <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10 bb-orange-svg-noise">
        <circle cx="24" cy="24" r="16" stroke="#FF5A1F" strokeWidth="1.5" strokeDasharray="3 3" />
        <path d="M 24 12 L 24 24 L 32 28" stroke="#FF5A1F" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="24" cy="24" r="2" fill="#FF5A1F" />
        <path d="M 10 38 Q 18 34, 24 36 Q 30 38, 38 34" stroke="#8b6f47" strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10 bb-orange-svg-noise">
      <circle cx="24" cy="18" r="8" stroke="#FF5A1F" strokeWidth="1.5" />
      <path d="M 16 18 Q 20 24, 24 18 Q 28 12, 32 18" stroke="#FF5A1F" strokeWidth="1" strokeDasharray="2 2" />
      <path d="M 12 36 C 12 30, 18 26, 24 26 C 30 26, 36 30, 36 36" stroke="#FF5A1F" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="4 2" />
      <circle cx="36" cy="14" r="4" stroke="#8b6f47" strokeWidth="1" strokeDasharray="2 2" opacity="0.5" />
      <circle cx="36" cy="14" r="1.5" fill="#8b6f47" fillOpacity="0.3" />
    </svg>
  );
}

// ─── Navigation ─────────────────────────────────────────────────────
function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#e8e4dc] bg-[#faf9f0]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="font-[var(--font-serif)] text-2xl font-semibold tracking-tight text-[#1a1a1a]" style={{ fontFamily: "var(--font-serif)" }}>
            BitBit
          </span>
        </Link>

        <div className="hidden items-center gap-8 text-[13px] text-[#6b6560] md:flex">
          <a href="#philosophy" className="transition-colors hover:text-[#1a1a1a]">About</a>
          <a href="#how-it-works" className="transition-colors hover:text-[#1a1a1a]">How it works</a>
          <Link href="https://app.bitbit.chat/login" className="transition-colors hover:text-[#1a1a1a]">Sign in</Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="https://app.bitbit.chat/login"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#FF5A1F] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#E44E17] bb-orange-fill-noise"
          >
            Get started
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ───────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative flex min-h-[88vh] flex-col items-center justify-center overflow-hidden px-6 pt-24">
      <HeroArt />

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <BlurFade delay={0.1} inView>
          <p className="mb-6 text-[13px] font-medium tracking-wide text-[#8b6f47]">
            Superintelligence That Will Actually Work
          </p>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <h1
            className="mb-6 text-[clamp(2.5rem,6vw,4.5rem)] leading-[1.1] tracking-[-0.02em] text-[#1a1a1a]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            An AI that knows
            <br />
            <em className="text-[#FF5A1F] bb-orange-text-noise">your world.</em>
          </h1>
        </BlurFade>

        <BlurFade delay={0.35} inView>
          <p className="mx-auto mb-10 max-w-xl text-lg leading-relaxed text-[#6b6560]">
            BitBit integrates deeply with your life and business. It learns your context,
            understands your priorities, and acts on your behalf so you can focus on
            what matters.
          </p>
        </BlurFade>

        <BlurFade delay={0.5} inView>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="https://app.bitbit.chat/login"
              className="inline-flex h-12 items-center gap-2 rounded-md bg-[#FF5A1F] px-8 text-[15px] font-medium text-white transition-colors hover:bg-[#E44E17] bb-orange-fill-noise"
            >
              Get started
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path d="M 3 8 L 12 8 M 9 5 L 12 8 L 9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex h-12 items-center gap-2 rounded-md border border-[#e8e4dc] bg-white px-8 text-[15px] font-medium text-[#1a1a1a] transition-colors hover:border-[#d4cfc6] hover:bg-[#f5f3ea]"
            >
              See how it works
            </a>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}

// ─── Philosophy ─────────────────────────────────────────────────────
function Philosophy() {
  return (
    <section id="philosophy" className="py-28 px-6">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-16 lg:grid-cols-2 items-center">
          <BlurFade delay={0.1} inView>
            <div>
              <p className="mb-4 text-[11px] font-medium uppercase tracking-[0.2em] text-[#8b6f47]">
                Philosophy
              </p>
              <h2
                className="mb-6 text-[clamp(1.75rem,4vw,2.75rem)] leading-[1.15] tracking-tight text-[#1a1a1a]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Human-first AI
                <br />
                <span className="text-[#FF5A1F] bb-orange-text-noise">that works with your life</span>
              </h2>
              <p className="text-[15px] leading-relaxed text-[#6b6560]">
                Most AI tools are separate apps you have to manage. BitBit is different.
                It connects to your existing channels — email, messages, calendars, tools —
                and becomes a seamless extension of how you already work.
              </p>
            </div>
          </BlurFade>

          <BlurFade delay={0.2} inView>
            <div className="relative">
              {/* Abstract SVG illustration */}
              <svg viewBox="0 0 400 300" fill="none" className="w-full bb-orange-svg-noise">
                {/* Central node */}
                <circle cx="200" cy="150" r="30" stroke="#FF5A1F" strokeWidth="2" />
                <text x="200" y="155" textAnchor="middle" fill="#FF5A1F" fontSize="12" fontWeight="600">You</text>

                {/* Orbiting nodes */}
                <circle cx="80" cy="80" r="20" stroke="#e8e4dc" strokeWidth="1.5" fill="#faf9f0" />
                <text x="80" y="84" textAnchor="middle" fill="#8b6f47" fontSize="9">Email</text>

                <circle cx="320" cy="80" r="20" stroke="#e8e4dc" strokeWidth="1.5" fill="#faf9f0" />
                <text x="320" y="84" textAnchor="middle" fill="#8b6f47" fontSize="9">Calendar</text>

                <circle cx="80" cy="220" r="20" stroke="#e8e4dc" strokeWidth="1.5" fill="#faf9f0" />
                <text x="80" y="224" textAnchor="middle" fill="#8b6f47" fontSize="9">Tasks</text>

                <circle cx="320" cy="220" r="20" stroke="#e8e4dc" strokeWidth="1.5" fill="#faf9f0" />
                <text x="320" y="224" textAnchor="middle" fill="#8b6f47" fontSize="9">Messages</text>

                <circle cx="200" cy="40" r="18" stroke="#e8e4dc" strokeWidth="1.5" fill="#faf9f0" />
                <text x="200" y="44" textAnchor="middle" fill="#8b6f47" fontSize="9">Files</text>

                <circle cx="200" cy="260" r="18" stroke="#e8e4dc" strokeWidth="1.5" fill="#faf9f0" />
                <text x="200" y="264" textAnchor="middle" fill="#8b6f47" fontSize="9">Invoices</text>

                {/* Connecting lines with hand-drawn feel */}
                <path d="M 98 92 Q 140 110 172 138" stroke="#FF5A1F" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
                <path d="M 302 92 Q 260 110 228 138" stroke="#FF5A1F" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
                <path d="M 98 208 Q 140 190 172 162" stroke="#FF5A1F" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
                <path d="M 302 208 Q 260 190 228 162" stroke="#FF5A1F" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
                <path d="M 200 58 L 200 120" stroke="#FF5A1F" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
                <path d="M 200 180 L 200 242" stroke="#FF5A1F" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
              </svg>
            </div>
          </BlurFade>
        </div>
      </div>
    </section>
  );
}

// ─── Capabilities ───────────────────────────────────────────────────
function Capabilities() {
  const capabilities = [
    {
      icon: "communication" as const,
      title: "Communication",
      description: "Email drafting, message triage, response scheduling. BitBit handles your inboxes so nothing falls through the cracks.",
    },
    {
      icon: "operations" as const,
      title: "Operations",
      description: "Scheduling, task management, invoice processing. The operational load that eats your day — handled automatically.",
    },
    {
      icon: "intelligence" as const,
      title: "Intelligence",
      description: "Learning your patterns, remembering context, building memory. BitBit gets smarter the more you use it.",
    },
  ];

  return (
    <section className="py-28 px-6 border-t border-[#e8e4dc]">
      <div className="mx-auto max-w-6xl">
        <BlurFade delay={0.1} inView>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-[#8b6f47]">
            Capabilities
          </p>
        </BlurFade>
        <BlurFade delay={0.15} inView>
          <h2
            className="mb-16 max-w-2xl text-2xl tracking-tight text-[#1a1a1a] sm:text-3xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Modular skills that adapt to your life
          </h2>
        </BlurFade>

        <div className="grid gap-8 md:grid-cols-3">
          {capabilities.map((cap, i) => (
            <BlurFade key={cap.title} delay={0.2 + i * 0.1} inView>
              <div className="rounded-lg border border-[#e8e4dc] bg-white p-8 transition-colors hover:border-[#d4cfc6]">
                <div className="mb-5">
                  <SketchIcon type={cap.icon} />
                </div>
                <h3 className="mb-3 text-lg font-semibold text-[#1a1a1a]">{cap.title}</h3>
                <p className="text-[14px] leading-relaxed text-[#6b6560]">
                  {cap.description}
                </p>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How It Works ───────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      title: "Connect your channels",
      description:
        "Link your email, calendar, messaging, and business tools. BitBit meets you where you already work — no new apps to learn.",
    },
    {
      title: "BitBit learns your world",
      description:
        "It studies your patterns, preferences, and priorities. Who matters most, how you communicate, what your day looks like. Context builds over time.",
    },
    {
      title: "It acts on your behalf",
      description:
        "Draft responses, schedule meetings, triage requests, manage tasks. BitBit handles the operational load while you focus on the work that matters.",
    },
  ];

  return (
    <section id="how-it-works" className="py-28 px-6 border-t border-[#e8e4dc]">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-16 lg:grid-cols-[1fr_1.5fr]">
          {/* Left — sticky heading */}
          <div className="lg:sticky lg:top-32 lg:self-start">
            <BlurFade delay={0.1} inView>
              <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-[#8b6f47]">
                How It Works
              </p>
            </BlurFade>
            <BlurFade delay={0.15} inView>
              <h2
                className="mb-4 text-2xl tracking-tight text-[#1a1a1a] sm:text-3xl"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Three steps to an AI
                <br />that knows your world
              </h2>
            </BlurFade>
            <BlurFade delay={0.2} inView>
              <p className="text-[15px] text-[#6b6560]">
                No complex setup. No training period.
                Connect your tools and BitBit starts learning.
              </p>
            </BlurFade>
          </div>

          {/* Right — timeline */}
          <div className="relative">
            {/* Vertical connecting line */}
            <div className="absolute left-5 top-2 bottom-2 w-px bg-gradient-to-b from-[#FF5A1F]/40 via-[#FF5A1F]/20 to-transparent bb-orange-gradient-noise" />

            <div className="space-y-12">
              {steps.map((step, i) => (
                <BlurFade key={step.title} delay={0.2 + i * 0.15} inView>
                  <div className="relative flex gap-8">
                    <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#FF5A1F]/30 bg-[#faf9f0] font-mono text-[15px] font-semibold text-[#FF5A1F] bb-orange-ring-noise bb-orange-text-noise">
                      {i + 1}
                    </div>
                    <div className="pt-1.5">
                      <h3 className="mb-2 text-lg font-semibold text-[#1a1a1a]">
                        {step.title}
                      </h3>
                      <p className="text-[14px] leading-relaxed text-[#6b6560]">
                        {step.description}
                      </p>
                    </div>
                  </div>
                </BlurFade>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Social Proof ───────────────────────────────────────────────────
function SocialProof() {
  return (
    <section className="py-20 px-6 border-t border-[#e8e4dc] bg-[#f5f3ea]">
      <div className="mx-auto max-w-3xl text-center">
        <BlurFade delay={0.1} inView>
          <p className="mb-6 text-[13px] font-medium tracking-wide text-[#8b6f47]">
            Built for real life
          </p>
          <blockquote
            className="mb-6 text-[clamp(1.25rem,3vw,1.75rem)] leading-relaxed text-[#1a1a1a]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            &ldquo;I built BitBit because I was drowning in operational work.
            Every business owner I know has the same problem — they&apos;ve heard AI can help,
            but nothing actually plugs into how they work. BitBit does.&rdquo;
          </blockquote>
          <p className="text-[14px] text-[#6b6560]">
            <span className="font-medium text-[#1a1a1a]">Andy</span> — Founder, BitBit
          </p>
        </BlurFade>
      </div>
    </section>
  );
}

// ─── Final CTA ──────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-32 px-6">
      {/* Subtle background art */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.03] bb-orange-svg-noise" viewBox="0 0 800 400" fill="none">
        <circle cx="400" cy="200" r="180" stroke="#FF5A1F" strokeWidth="1" strokeDasharray="6 8" />
        <circle cx="400" cy="200" r="120" stroke="#8b6f47" strokeWidth="0.8" strokeDasharray="4 6" />
      </svg>

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <BlurFade delay={0.1} inView>
          <h2
            className="mb-6 text-3xl tracking-tight text-[#1a1a1a] sm:text-[2.75rem] sm:leading-[1.1]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Meet your AI.
          </h2>
        </BlurFade>
        <BlurFade delay={0.2} inView>
          <p className="mb-10 text-lg text-[#6b6560]">
            Start with what you have. BitBit adapts to you.
          </p>
        </BlurFade>
        <BlurFade delay={0.3} inView>
          <Link
            href="https://app.bitbit.chat/login"
            className="inline-flex h-12 items-center gap-2 rounded-md bg-[#FF5A1F] px-8 text-[15px] font-medium text-white transition-colors hover:bg-[#E44E17] bb-orange-fill-noise"
          >
            Get started
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M 3 8 L 12 8 M 9 5 L 12 8 L 9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </BlurFade>
      </div>
    </section>
  );
}

// ─── Footer ─────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="border-t border-[#e8e4dc] py-12 px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <span className="text-sm font-semibold text-[#1a1a1a]" style={{ fontFamily: "var(--font-serif)" }}>
          BitBit
        </span>

        <div className="flex items-center gap-6 text-[13px] text-[#6b6560]">
          <a href="#" className="transition-colors hover:text-[#1a1a1a]">Privacy</a>
          <a href="#" className="transition-colors hover:text-[#1a1a1a]">Terms</a>
        </div>

        <p className="text-[12px] text-[#8b6f47]">
          &copy; 2026 BitBit
        </p>
      </div>
    </footer>
  );
}

// ─── Page ───────────────────────────────────────────────────────────
export default function Home() {
  return (
    <main className="min-h-screen bg-[#faf9f0]">
      <OrangeNoiseDefs />
      <Nav />
      <Hero />
      <Philosophy />
      <Capabilities />
      <HowItWorks />
      <SocialProof />
      <FinalCTA />
      <Footer />
    </main>
  );
}
