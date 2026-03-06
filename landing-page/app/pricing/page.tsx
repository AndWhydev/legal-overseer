import { Metadata } from "next";
import { BlurFade } from "@/components/ui/blur-fade";
import Link from "next/link";
import { Check } from "lucide-react";

export const metadata: Metadata = {
  title: "Pricing — BitBit",
  description: "Simple, transparent pricing for BitBit. Choose from Starter, Growth, Pro, or Enterprise plans.",
  openGraph: {
    title: "Pricing — BitBit",
    description: "Simple, transparent pricing. Start free, scale as you grow.",
    type: "website",
    url: "https://bitbit.chat/pricing",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "BitBit Pricing",
      },
    ],
  },
};

function PricingNav() {
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
          <Link href="/about" className="transition-colors hover:text-[#1a1a1a]">About</Link>
          <Link href="/pricing" className="transition-colors hover:text-[#1a1a1a] font-medium text-[#1a1a1a]">Pricing</Link>
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

function PricingHero() {
  return (
    <section className="relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden px-6 pt-24">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <svg
          className="absolute -right-32 -top-20 h-[600px] w-[600px] animate-spin-slow opacity-[0.04]"
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
            Simple, transparent pricing
          </p>
        </BlurFade>

        <BlurFade delay={0.2} inView>
          <h1
            className="mb-6 text-[clamp(2.5rem,6vw,4rem)] leading-[1.1] tracking-[-0.02em] text-[#1a1a1a]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Choose your plan
          </h1>
        </BlurFade>

        <BlurFade delay={0.35} inView>
          <p className="mx-auto max-w-xl text-lg leading-relaxed text-[#6b6560]">
            Start free. Scale as you grow. All plans include core AI features with unlimited learning and integration updates.
          </p>
        </BlurFade>
      </div>
    </section>
  );
}

function PricingCards() {
  const tiers = [
    {
      name: "Starter",
      price: 199,
      description: "Perfect for individuals and small teams",
      features: [
        "1 user seat",
        "3 channel integrations",
        "500 agent runs/month",
        "Basic email & messaging",
        "Community support",
        "1 month history",
      ],
      featured: false,
      cta: "Start Free Trial",
    },
    {
      name: "Growth",
      price: 349,
      description: "For growing teams",
      features: [
        "3 user seats",
        "All channels & integrations",
        "2,000 agent runs/month",
        "Advanced automations",
        "Email support",
        "6 month history",
        "Custom workflows",
      ],
      featured: true,
      cta: "Start Free Trial",
    },
    {
      name: "Pro",
      price: 599,
      description: "For power users",
      features: [
        "10 user seats",
        "Unlimited channels",
        "Unlimited agent runs",
        "Priority support",
        "Advanced analytics",
        "12 month history",
        "Custom integrations",
        "Team collaboration tools",
      ],
      featured: false,
      cta: "Start Free Trial",
    },
    {
      name: "Enterprise",
      price: null,
      priceDisplay: "Custom",
      description: "For large organizations",
      features: [
        "Unlimited user seats",
        "Dedicated support",
        "Custom integrations",
        "Advanced security",
        "SLA guarantees",
        "Unlimited history",
        "White-label options",
        "On-premise deployment",
      ],
      featured: false,
      cta: "Contact Sales",
    },
  ];

  return (
    <section className="py-20 px-6 border-t border-[#e8e4dc]">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {tiers.map((tier, i) => (
            <BlurFade key={tier.name} delay={0.2 + i * 0.1} inView>
              <div
                className={`relative flex flex-col rounded-lg border p-8 transition-all ${
                  tier.featured
                    ? "border-[#FF5A1F] bg-[#fff8f4] ring-2 ring-[#FF5A1F]/20 scale-105 lg:scale-110"
                    : "border-[#e8e4dc] bg-white hover:border-[#d4cfc6]"
                }`}
              >
                {tier.featured && (
                  <div className="absolute -top-3 left-4 inline-block rounded-full bg-[#FF5A1F] px-3 py-1 text-[11px] font-semibold text-white bb-orange-fill-noise">
                    MOST POPULAR
                  </div>
                )}

                <h3 className="mb-2 text-xl font-semibold text-[#1a1a1a]">
                  {tier.name}
                </h3>
                <p className="mb-6 text-[13px] text-[#6b6560]">
                  {tier.description}
                </p>

                <div className="mb-6">
                  {tier.price !== null ? (
                    <div className="flex items-baseline gap-1">
                      <span
                        className="text-4xl font-semibold text-[#1a1a1a]"
                        style={{ fontFamily: "var(--font-serif)" }}
                      >
                        ${tier.price}
                      </span>
                      <span className="text-[#6b6560]">/month</span>
                    </div>
                  ) : (
                    <div className="text-4xl font-semibold text-[#1a1a1a]">
                      {tier.priceDisplay}
                    </div>
                  )}
                </div>

                <Link
                  href="https://app.bitbit.chat/login"
                  className={`mb-8 inline-flex h-10 items-center justify-center rounded-md px-6 text-[14px] font-medium transition-colors ${
                    tier.featured
                      ? "bg-[#FF5A1F] text-white hover:bg-[#E44E17] bb-orange-fill-noise"
                      : "border border-[#e8e4dc] text-[#1a1a1a] hover:border-[#d4cfc6] hover:bg-[#f5f3ea]"
                  }`}
                >
                  {tier.cta}
                </Link>

                <div className="space-y-3">
                  {tier.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <Check className="h-4 w-4 text-[#FF5A1F] shrink-0 mt-0.5" />
                      <span className="text-[13px] text-[#6b6560]">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingFAQ() {
  const faqs = [
    {
      q: "Can I change my plan anytime?",
      a: "Yes, upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle.",
    },
    {
      q: "What happens if I exceed my agent runs?",
      a: "We'll notify you when you're approaching your limit. You can upgrade your plan or purchase additional runs.",
    },
    {
      q: "Do you offer annual billing discounts?",
      a: "Yes! Annual plans come with 20% off. Contact our sales team for enterprise annual pricing.",
    },
    {
      q: "Is there a free trial?",
      a: "All plans include a 14-day free trial. No credit card required to start.",
    },
  ];

  return (
    <section className="py-20 px-6 border-t border-[#e8e4dc] bg-[#f5f3ea]">
      <div className="mx-auto max-w-3xl">
        <BlurFade delay={0.1} inView>
          <h2
            className="mb-12 text-center text-3xl font-semibold text-[#1a1a1a]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Frequently asked questions
          </h2>
        </BlurFade>

        <div className="space-y-6">
          {faqs.map((faq, i) => (
            <BlurFade key={i} delay={0.2 + i * 0.1} inView>
              <div className="rounded-lg border border-[#e8e4dc] bg-white p-6">
                <h3 className="mb-2 font-semibold text-[#1a1a1a]">
                  {faq.q}
                </h3>
                <p className="text-[14px] leading-relaxed text-[#6b6560]">
                  {faq.a}
                </p>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingCTA() {
  return (
    <section className="py-32 px-6 border-t border-[#e8e4dc]">
      <div className="mx-auto max-w-3xl text-center">
        <BlurFade delay={0.1} inView>
          <h2
            className="mb-6 text-3xl tracking-tight text-[#1a1a1a] sm:text-[2.75rem] sm:leading-[1.1]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Ready to transform your operations?
          </h2>
        </BlurFade>
        <BlurFade delay={0.2} inView>
          <p className="mb-10 text-lg text-[#6b6560]">
            Start your free 14-day trial today. No credit card required.
          </p>
        </BlurFade>
        <BlurFade delay={0.3} inView>
          <Link
            href="https://app.bitbit.chat/login"
            className="inline-flex h-12 items-center gap-2 rounded-md bg-[#FF5A1F] px-8 text-[15px] font-medium text-white transition-colors hover:bg-[#E44E17] bb-orange-fill-noise"
          >
            Start Free Trial
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path d="M 3 8 L 12 8 M 9 5 L 12 8 L 9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </BlurFade>
      </div>
    </section>
  );
}

function PricingFooter() {
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

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#faf9f0]">
      <PricingNav />
      <PricingHero />
      <PricingCards />
      <PricingFAQ />
      <PricingCTA />
      <PricingFooter />
    </main>
  );
}
