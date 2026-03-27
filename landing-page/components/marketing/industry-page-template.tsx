"use client";

import Link from "next/link";
import MarketingNav from "./marketing-nav";
import MarketingFooter from "./marketing-footer";
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
    <div className="min-h-screen bg-[#faf9f0] text-[#1a1a1a]">
      <MarketingNav />

      {/* Hero Banner */}
      <section className="relative overflow-hidden px-6 pb-20 pt-32">
        {/* Decorative background */}
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

        <div className="relative z-10 mx-auto max-w-3xl">
          <p className="mb-4 text-[13px] font-medium uppercase tracking-wide text-[#8b6f47]">
            BitBit for {industry}
          </p>
          <h1
            className="mb-6 text-[clamp(2rem,5vw,3.5rem)] leading-[1.1] tracking-[-0.02em] text-[#1a1a1a]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {headline}
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-[#6b6560]">
            {subheadline}
          </p>
        </div>
      </section>

      {/* Pain Points Grid */}
      <section className="border-t border-[#e8e4dc] px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2
            className="mb-12 text-center text-[clamp(1.5rem,3.5vw,2.25rem)] tracking-[-0.02em] text-[#1a1a1a]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Problems you know too well
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {painPoints.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="rounded-lg border border-[#e8e4dc] bg-white p-7 transition-all hover:border-[#d4cfc6] hover:-translate-y-1"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg border border-[#e8e4dc] bg-[#f5f3ea]">
                  <Icon size={20} className="text-[#8b6f47]" />
                </div>
                <h3 className="mb-2 text-base font-semibold text-[#1a1a1a]">
                  {title}
                </h3>
                <p className="text-[14px] leading-relaxed text-[#6b6560]">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How BitBit Helps - Roles */}
      <section className="border-t border-[#e8e4dc] bg-[#f5f3ea] px-6 py-20">
        <div className="mx-auto max-w-3xl">
          <h2
            className="mb-12 text-center text-[clamp(1.5rem,3.5vw,2.25rem)] tracking-[-0.02em] text-[#1a1a1a]"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            How BitBit helps
          </h2>
          <div className="flex flex-col gap-5">
            {roles.map(({ name, description, example }) => (
              <div
                key={name}
                className="flex flex-col gap-3 rounded-lg border border-[#e8e4dc] bg-white p-6"
              >
                <h3 className="text-base font-semibold text-[#1a1a1a]">
                  {name}
                </h3>
                <p className="text-[14px] leading-relaxed text-[#6b6560]">
                  {description}
                </p>
                <div className="rounded-md border border-[#e8e4dc] bg-[#faf9f0] px-4 py-3 text-[14px] italic leading-relaxed text-[#8b6f47]">
                  {example}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recommended Tier */}
      <section className="border-t border-[#e8e4dc] px-6 py-20">
        <div className="mx-auto max-w-xl">
          <div className="rounded-lg border border-[#e8e4dc] bg-white p-10 text-center">
            <p className="mb-3 text-[13px] font-medium uppercase tracking-wide text-[#8b6f47]">
              Recommended for {industry}
            </p>
            <h3
              className="mb-2 text-[clamp(1.5rem,3vw,2.25rem)] tracking-[-0.02em] text-[#1a1a1a]"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {recommendedTier} Plan
            </h3>
            <p
              className="mb-2 text-[clamp(2rem,4vw,3rem)] font-semibold tracking-[-0.02em] text-[#1a1a1a]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {tierPrice}
            </p>
            <p className="mb-8 text-[14px] text-[#6b6560]">
              30-day free trial. No credit card required.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="https://app.bitbit.chat/login"
                className="inline-flex h-11 items-center rounded-md bg-[#FF5A1F] px-8 text-[14px] font-medium text-white transition-colors hover:bg-[#E44E17] bb-orange-fill-noise"
              >
                Start Free Trial
              </Link>
              <Link
                href="/pricing"
                className="inline-flex h-11 items-center rounded-md border border-[#e8e4dc] px-8 text-[14px] font-medium text-[#1a1a1a] transition-colors hover:border-[#d4cfc6] hover:bg-[#f5f3ea]"
              >
                Compare All Plans
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
