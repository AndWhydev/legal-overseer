'use client'

import { useState } from 'react'
import Link from 'next/link'
import TestimonialsSection from '@/components/marketing/testimonials-section'

const INTEGRATION_LOGOS = [
  { name: 'Gmail', icon: '📧' },
  { name: 'Outlook', icon: '📨' },
  { name: 'WhatsApp', icon: '💬' },
  { name: 'Slack', icon: '💭' },
  { name: 'Stripe', icon: '💳' },
  { name: 'Google Calendar', icon: '📅' },
  { name: 'Asana', icon: '📋' },
  { name: 'Xero', icon: '📊' },
  { name: 'iMessage', icon: '💬' },
  { name: 'Telegram', icon: '✈' },
  { name: 'WordPress', icon: '🌐' },
  { name: 'Calendly', icon: '📆' },
]

const FEATURES = [
  { emoji: '🧠', title: 'Total Recall', description: 'Every conversation, every relationship, every detail — remembered permanently. Nothing slips through the cracks.' },
  { emoji: '⚡', title: 'Smart Triage', description: 'Incoming messages are categorised and prioritised automatically. We learn what matters and surface it first.' },
  { emoji: '✅', title: 'Graduated Trust', description: 'High-confidence actions happen automatically. Medium-confidence decisions come to you for approval. Full control, zero busywork.' },
  { emoji: '📋', title: 'Live Operations', description: 'Leads, projects, and tasks in one place. Status updates, follow-ups, and reminders happen without being asked.' },
]

const PRICING_TIERS = [
  { name: 'Starter', price: 29, description: 'Perfect for solopreneurs', features: ['Up to 500 tasks/month', '5 channel integrations', '1 AI agent', 'Email support', 'Community access'] },
  { name: 'Growth', price: 99, description: 'Most popular for teams', popular: true, features: ['Up to 5,000 tasks/month', '15+ integrations', '5 AI agents', 'Priority support', 'Advanced analytics', 'Custom workflows'] },
  { name: 'Scale', price: 299, description: 'For high-volume operations', features: ['Unlimited tasks', '20+ integrations', 'Unlimited AI agents', '24/7 phone support', 'Advanced analytics', 'Custom integrations', 'Dedicated account manager'] },
]

export default function MarketingPageClient() {
  const [isAnnual, setIsAnnual] = useState(false)

  return (
    <div className="overflow-hidden bg-[#0a0a0f] text-slate-100">
      {/* Hero */}
      <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#0a0a0f] via-[#0f1419] to-[#141a23] px-5 py-[60px]">
        <div style={{ position: 'absolute', top: '-40%', right: '-20%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)', filter: 'blur(80px)', animation: 'float 20s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-30%', left: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)', filter: 'blur(80px)', animation: 'float 25s ease-in-out infinite reverse' }} />
        <div className="relative z-10 max-w-[900px] text-center">
          <h1 className="mb-6 text-[clamp(36px,8vw,72px)] font-medium leading-tight tracking-tighter text-slate-100">Operations, handled.</h1>
          <p className="mx-auto mb-12 max-w-[700px] text-[clamp(16px,2vw,20px)] leading-relaxed text-slate-400">We remember every conversation, understand every relationship, and handle the admin — so you can focus on the work that matters.</p>
          <div className="mb-[60px] flex flex-wrap justify-center gap-4">
            <Link href="/onboard" className="bb-cta-primary inline-block rounded-xl bg-emerald-500 px-8 py-3.5 text-base font-medium text-white no-underline transition-all">Get Started</Link>
            <Link href="#features" className="bb-cta-secondary inline-block rounded-xl border border-white/10 bg-transparent px-8 py-3.5 text-base font-medium text-slate-100 no-underline transition-all">See How It Works</Link>
          </div>
          <div className="flex flex-col items-center gap-6">
            <p className="text-sm uppercase tracking-wider text-slate-400">Trusted by agencies across Australia</p>
            <div className="flex flex-wrap justify-center gap-4">
              {INTEGRATION_LOGOS.slice(0, 6).map((logo) => (
                <div key={logo.name} className="bb-integration-icon flex size-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-base transition-all" title={logo.name}>{logo.icon}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-[5] px-5 py-[100px]" id="features">
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-20 text-center">
            <h2 className="mb-4 text-[clamp(28px,5vw,48px)] font-medium tracking-tight">Why BitBit?</h2>
            <p className="mx-auto max-w-[600px] text-base text-slate-400">Built for digital agencies and operations teams who need AI that understands context and respects boundaries.</p>
          </div>
          <div className="mb-20 grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="bb-feature-card cursor-pointer rounded-xl border border-border bg-card px-6 py-8 shadow-sm transition-all">
                <div className="mb-4 text-[40px]">{f.emoji}</div>
                <h3 className="mb-3 text-base font-medium text-slate-100">{f.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{f.description}</p>
              </div>
            ))}
          </div>
          <div className="rounded-[20px] border border-emerald-500/10 bg-[rgba(10,14,23,0.5)] px-8 py-10 text-center backdrop-blur-3xl">
            <h3 className="mb-8 text-base font-medium text-slate-100">15+ Integrations</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(80px,1fr))] gap-4">
              {INTEGRATION_LOGOS.map((logo) => (
                <div key={logo.name} className="bb-integration-icon flex flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-all">
                  <div className="mb-2 text-[32px]">{logo.icon}</div>
                  <span className="text-sm text-slate-400">{logo.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <TestimonialsSection />

      {/* Pricing */}
      <section className="bg-black/50 px-5 py-[100px]" id="pricing">
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-[60px] text-center">
            <h2 className="mb-6 text-[clamp(28px,5vw,48px)] font-medium tracking-tight">Simple, Transparent Pricing</h2>
            <div className="mt-8 flex items-center justify-center gap-4">
              <span className={`text-sm ${isAnnual ? 'text-slate-400' : 'text-slate-100'}`}>Monthly</span>
              <button onClick={() => setIsAnnual(!isAnnual)} style={{ position: 'relative', width: 60, height: 32, borderRadius: 16, border: 'none', background: isAnnual ? '#10b981' : 'rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'background 300ms' }}>
                <div style={{ position: 'absolute', width: 28, height: 28, borderRadius: 16, background: '#fff', top: 2, left: isAnnual ? 30 : 2, transition: 'left 300ms' }} />
              </button>
              <span className={`text-sm ${isAnnual ? 'text-slate-100' : 'text-slate-400'}`}>Annual</span>
              {isAnnual && <span className="ml-2 inline-block rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-500">Save 20%</span>}
            </div>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-6">
            {PRICING_TIERS.map((tier) => {
              const displayPrice = isAnnual ? Math.floor(tier.price * 12 * 0.8) : tier.price
              const billingPeriod = isAnnual ? '/year' : '/month'
              return (
                <div key={tier.name} className={tier.popular ? 'bb-pricing-popular' : 'bb-pricing-card'} style={{ position: 'relative', padding: '32px 24px', borderRadius: 20, background: tier.popular ? 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(16,185,129,0.05) 100%)' : 'rgba(15,20,30,0.6)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: tier.popular ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.03)', boxShadow: tier.popular ? 'inset 0 1px 0 rgba(16,185,129,0.1), 0 0 40px rgba(16,185,129,0.05)' : 'inset 0 1px 0 rgba(255,255,255,0.05)', transform: tier.popular ? 'scale(1.05)' : 'scale(1)', transition: 'all 300ms' }}>
                  {tier.popular && <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-black">Most Popular</div>}
                  <h3 className="mb-2 text-base font-medium text-slate-100">{tier.name}</h3>
                  <p className="mb-6 text-sm text-slate-400">{tier.description}</p>
                  <div className="mb-8"><div className="text-base font-medium text-slate-100">${displayPrice}<span className="ml-1 font-normal text-slate-400">{billingPeriod}</span></div></div>
                  <button className={`w-full cursor-pointer rounded-xl border-none px-4 py-3 text-sm font-medium transition-all ${tier.popular ? 'bb-cta-primary bg-emerald-500 text-black' : 'bb-cta-secondary bg-white/5 text-slate-100'} mb-6`}>Get Started</button>
                  <div className="border-t border-white/5 pt-6">
                    {tier.features.map((feature) => (<div key={feature} className="flex items-center gap-3 py-3 text-sm text-slate-400"><span className="text-base font-medium leading-none text-emerald-500">✓</span>{feature}</div>))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="px-5 py-20 text-center">
        <h2 className="mb-6 text-base font-medium text-slate-100">Ready to transform your operations?</h2>
        <p className="mx-auto mb-8 max-w-[600px] text-base text-slate-400">Join teams that are automating their busywork and getting back to what matters.</p>
        <Link href="/onboard" className="bb-cta-primary inline-block rounded-xl bg-emerald-500 px-10 py-3.5 text-base font-medium text-white no-underline transition-all">Start Your Free Trial</Link>
      </section>

      <style>{`
        @keyframes float { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(30px, -30px); } }
        .bb-cta-primary:hover { background: #059669 !important; transform: translateY(-2px); }
        .bb-cta-secondary:hover { background: rgba(255,255,255,0.05) !important; border-color: rgba(255,255,255,0.2) !important; }
        .bb-feature-card:hover { background: rgba(15,20,30,0.8) !important; border-color: rgba(16,185,129,0.2) !important; transform: translateY(-4px); }
        .bb-integration-icon:hover { background: rgba(16,185,129,0.1) !important; border-color: rgba(16,185,129,0.2) !important; }
        .bb-pricing-card:hover { border-color: rgba(16,185,129,0.2) !important; transform: translateY(-4px) !important; }
      `}</style>
    </div>
  )
}
