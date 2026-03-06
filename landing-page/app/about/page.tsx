import { Metadata } from "next";
import { BlurFade } from "@/components/ui/blur-fade";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — BitBit",
  description: "Learn about BitBit's mission to build AI that actually helps with business operations.",
  openGraph: {
    title: "About — BitBit",
    description: "Building AI that actually helps. Learn our story, values, and vision.",
    type: "website",
    url: "https://bitbit.chat/about",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "About BitBit",
      },
    ],
  },
};

function AboutNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#e8e4dc] bg-[#faf9f0]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="font-[var(--font-serif)] text-2xl font-semibold tracking-tight text-[#1a1a1a]" style={{ fontFamily: "var(--font-serif)" }}>
            BitBit
          </span>
        </Link>

        <div className="hidden items-center gap-8 text-[13px] text-[#6b6560] md:flex">
          <Link href="/" className="transition-colors hover:text-[#1a1a1a]">Home</Link>
          <Link href="/about" className="transition-colors hover:text-[#1a1a1a] font-medium text-[#1a1a1a]">About</Link>
          <Link href="/pricing" className="transition-colors hover:text-[#1a1a1a]">Pricing</Link>
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

function AboutHero() {
  return (
    <section className="relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden px-6 pt-24">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <svg
          className="absolute -left-32 -top-20 h-[600px] w-[600px] animate-spin-slow opacity-[0.04]"
          viewBox="0 0 400 400"
          fill="none"
        >
          <circle cx="200" cy="200" r="180" stroke="#d97757" strokeWidth="1" strokeDasharray="8 6" />
          <circle cx="200" cy="200" r="120" stroke="#8b6f47" strokeWidth="0.8" strokeDasharray="4 8" />
        </svg>
      </div>

      <div className="relative z-10 mx-auto max-w-3xl text-center">
        <BlurFade delay={0.1} inView>
          <p className="mb-6 text-[13px] font-medium tracking-wide text-[#8b6f47]">
            Our story
          </p>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <h1
            className="mb-6 text-[clamp(2.5rem,6vw,4rem)] leading-[1.1] tracking-[-0.02em] text-[#1a1a1a]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Building AI that actually helps
          </h1>
        </BlurFade>

        <BlurFade delay={0.35} inView>
          <p className="mx-auto max-w-xl text-lg leading-relaxed text-[#6b6560]">
            BitBit was born from frustration with disconnected AI tools. We built something better.
          </p>
        </BlurFade>
      </div>
    </section>
  );
}

function AboutStory() {
  return (
    <section className="py-20 px-6 border-t border-[#e8e4dc]">
      <div className="mx-auto max-w-4xl">
        <div className="grid gap-16 lg:grid-cols-2 items-center">
          <BlurFade delay={0.1} inView>
            <div className="space-y-6">
              <div>
                <h2
                  className="mb-4 text-2xl font-semibold text-[#1a1a1a]"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  The problem we set out to solve
                </h2>
                <p className="text-[15px] leading-relaxed text-[#6b6560]">
                  Drowning in operational work? You&apos;re not alone. Business owners, managers, and operators spend hours every week on administrative tasks — responding to emails, scheduling meetings, triaging requests, managing invoices.
                </p>
              </div>

              <p className="text-[15px] leading-relaxed text-[#6b6560]">
                AI has promised to help, but existing tools are fragmented. ChatGPT is great, but it doesn&apos;t integrate with your email. Automation tools are powerful, but rigid. There&apos;s no AI that actually knows your life and business.
              </p>

              <p className="text-[15px] leading-relaxed text-[#6b6560]">
                We knew there had to be a better way.
              </p>
            </div>
          </BlurFade>

          <BlurFade delay={0.2} inView>
            <div className="relative">
              <svg viewBox="0 0 400 300" fill="none" className="w-full bb-orange-svg-noise">
                <circle cx="200" cy="150" r="40" stroke="#FF5A1F" strokeWidth="2" />
                <path d="M 200 120 L 200 180 M 170 150 L 230 150" stroke="#FF5A1F" strokeWidth="2" strokeLinecap="round" />

                <circle cx="80" cy="80" r="25" stroke="#e8e4dc" strokeWidth="1.5" fill="#faf9f0" opacity="0.6" />
                <path d="M 70 80 L 90 80" stroke="#8b6f47" strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />

                <circle cx="320" cy="80" r="25" stroke="#e8e4dc" strokeWidth="1.5" fill="#faf9f0" opacity="0.6" />
                <path d="M 315 75 L 320 80 L 325 75" stroke="#8b6f47" strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />

                <circle cx="80" cy="220" r="25" stroke="#e8e4dc" strokeWidth="1.5" fill="#faf9f0" opacity="0.6" />
                <path d="M 75 220 L 85 220" stroke="#8b6f47" strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />

                <circle cx="320" cy="220" r="25" stroke="#e8e4dc" strokeWidth="1.5" fill="#faf9f0" opacity="0.6" />
                <path d="M 315 215 L 320 220 L 325 215" stroke="#8b6f47" strokeWidth="1.5" opacity="0.5" strokeLinecap="round" />

                <path d="M 98 92 Q 140 110 172 138" stroke="#FF5A1F" strokeWidth="1" strokeDasharray="4 3" opacity="0.3" />
                <path d="M 302 92 Q 260 110 228 138" stroke="#FF5A1F" strokeWidth="1" strokeDasharray="4 3" opacity="0.3" />
                <path d="M 98 208 Q 140 190 172 162" stroke="#FF5A1F" strokeWidth="1" strokeDasharray="4 3" opacity="0.3" />
                <path d="M 302 208 Q 260 190 228 162" stroke="#FF5A1F" strokeWidth="1" strokeDasharray="4 3" opacity="0.3" />
              </svg>
            </div>
          </BlurFade>
        </div>
      </div>
    </section>
  );
}

function AboutSolution() {
  return (
    <section className="py-20 px-6 border-t border-[#e8e4dc] bg-[#f5f3ea]">
      <div className="mx-auto max-w-4xl">
        <BlurFade delay={0.1} inView>
          <h2
            className="mb-12 text-3xl font-semibold text-[#1a1a1a]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            How BitBit is different
          </h2>
        </BlurFade>

        <div className="grid gap-12 md:grid-cols-2">
          {[
            {
              title: "Context-first",
              description: "BitBit doesn't just respond to commands. It learns your context—your priorities, your patterns, your world. Over time, it becomes an extension of you.",
            },
            {
              title: "Deeply integrated",
              description: "Connect your email, calendar, messages, and tools. BitBit lives in your existing workflow, not in a separate app.",
            },
            {
              title: "Action-oriented",
              description: "It doesn't just analyze. BitBit drafts emails, schedules meetings, triages requests, and manages tasks. It acts on your behalf.",
            },
            {
              title: "Built for teams",
              description: "Personal-first, but scale to teams and organizations. BitBit works for individuals, startups, and enterprises alike.",
            },
          ].map((item, i) => (
            <BlurFade key={item.title} delay={0.2 + i * 0.1} inView>
              <div className="rounded-lg border border-[#e8e4dc] bg-white p-8">
                <h3 className="mb-3 font-semibold text-[#1a1a1a]">
                  {item.title}
                </h3>
                <p className="text-[14px] leading-relaxed text-[#6b6560]">
                  {item.description}
                </p>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutValues() {
  return (
    <section className="py-20 px-6 border-t border-[#e8e4dc]">
      <div className="mx-auto max-w-4xl">
        <BlurFade delay={0.1} inView>
          <div className="mb-12 text-center">
            <h2
              className="mb-4 text-3xl font-semibold text-[#1a1a1a]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Our values
            </h2>
            <p className="text-[15px] text-[#6b6560]">
              Everything we build is guided by these principles
            </p>
          </div>
        </BlurFade>

        <div className="grid gap-8 md:grid-cols-3">
          {[
            {
              icon: "🤝",
              title: "Human-centered",
              description: "AI should amplify human judgment, not replace it. We build tools that respect your autonomy and put you in control.",
            },
            {
              icon: "🔗",
              title: "Connected",
              description: "Your tools shouldn't live in isolation. Everything connects—your email, calendar, messages, and business systems.",
            },
            {
              icon: "🌱",
              title: "Adaptive",
              description: "Every business is different. BitBit learns from your patterns and adapts to how you work, not the other way around.",
            },
          ].map((value, i) => (
            <BlurFade key={value.title} delay={0.2 + i * 0.1} inView>
              <div className="rounded-lg border border-[#e8e4dc] bg-white p-8 text-center">
                <div className="mb-4 text-5xl">{value.icon}</div>
                <h3 className="mb-3 font-semibold text-[#1a1a1a]">
                  {value.title}
                </h3>
                <p className="text-[14px] leading-relaxed text-[#6b6560]">
                  {value.description}
                </p>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutCTA() {
  return (
    <section className="py-32 px-6 border-t border-[#e8e4dc]">
      <div className="mx-auto max-w-3xl text-center">
        <BlurFade delay={0.1} inView>
          <h2
            className="mb-6 text-3xl tracking-tight text-[#1a1a1a] sm:text-[2.75rem] sm:leading-[1.1]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Join us in reimagining AI at work
          </h2>
        </BlurFade>
        <BlurFade delay={0.2} inView>
          <p className="mb-10 text-lg text-[#6b6560]">
            Experience an AI that actually understands your business.
          </p>
        </BlurFade>
        <BlurFade delay={0.3} inView>
          <Link
            href="https://app.bitbit.chat/login"
            className="inline-flex h-12 items-center gap-2 rounded-md bg-[#FF5A1F] px-8 text-[15px] font-medium text-white transition-colors hover:bg-[#E44E17] bb-orange-fill-noise"
          >
            Start Your Free Trial
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M 3 8 L 12 8 M 9 5 L 12 8 L 9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </BlurFade>
      </div>
    </section>
  );
}

function AboutFooter() {
  return (
    <footer className="border-t border-[#e8e4dc] py-12 px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <span className="text-sm font-semibold text-[#1a1a1a]" style={{ fontFamily: "var(--font-serif)" }}>
          BitBit
        </span>

        <div className="flex items-center gap-6 text-[13px] text-[#6b6560]">
          <Link href="/" className="transition-colors hover:text-[#1a1a1a]">Home</Link>
          <Link href="/about" className="transition-colors hover:text-[#1a1a1a]">About</Link>
          <Link href="/pricing" className="transition-colors hover:text-[#1a1a1a]">Pricing</Link>
          <a href="/privacy" className="transition-colors hover:text-[#1a1a1a]">Privacy</a>
          <a href="/terms" className="transition-colors hover:text-[#1a1a1a]">Terms</a>
        </div>

        <p className="text-[12px] text-[#8b6f47]">
          &copy; 2026 BitBit
        </p>
      </div>
    </footer>
  );
}

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#faf9f0]">
      <AboutNav />
      <AboutHero />
      <AboutStory />
      <AboutSolution />
      <AboutValues />
      <AboutCTA />
      <AboutFooter />
    </main>
  );
}
