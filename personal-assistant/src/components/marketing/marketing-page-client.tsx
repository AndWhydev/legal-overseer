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
    <div style={{ background: '#0a0a0f', color: '#F1F5F9', overflow: 'hidden' }}>
      {/* Hero */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', background: 'linear-gradient(135deg, #0a0a0f 0%, #0f1419 50%, #141a23 100%)', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-40%', right: '-20%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)', filter: 'blur(80px)', animation: 'float 20s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-30%', left: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)', filter: 'blur(80px)', animation: 'float 25s ease-in-out infinite reverse' }} />
        <div style={{ position: 'relative', zIndex: 10, maxWidth: 900, textAlign: 'center' }}>
          <h1 style={{ fontSize: 'clamp(36px, 8vw, 72px)', fontWeight: 500, lineHeight: 1.2, marginBottom: 24, letterSpacing: '-0.03em', color: '#F1F5F9' }}>Operations, handled.</h1>
          <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', color: '#94A3B8', marginBottom: 48, lineHeight: 1.6, maxWidth: 700, margin: '0 auto 48px' }}>We remember every conversation, understand every relationship, and handle the admin — so you can focus on the work that matters.</p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginBottom: 60, flexWrap: 'wrap' }}>
            <Link href="/onboard" className="bb-cta-primary" style={{ padding: '14px 32px', borderRadius: 12, background: '#10b981', color: '#fff', fontSize: 16, fontWeight: 500, textDecoration: 'none', display: 'inline-block', transition: 'all 200ms' }}>Get Started</Link>
            <Link href="#features" className="bb-cta-secondary" style={{ padding: '14px 32px', borderRadius: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#F1F5F9', fontSize: 16, fontWeight: 500, textDecoration: 'none', display: 'inline-block', transition: 'all 200ms' }}>See How It Works</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            <p style={{ fontSize: 14, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Trusted by agencies across Australia</p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              {INTEGRATION_LOGOS.slice(0, 6).map((logo) => (
                <div key={logo.name} className="bb-integration-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', fontSize: 16, transition: 'all 200ms' }} title={logo.name}>{logo.icon}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '100px 20px', position: 'relative', zIndex: 5 }} id="features">
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 80 }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 500, marginBottom: 16, letterSpacing: '-0.02em' }}>Why BitBit?</h2>
            <p style={{ fontSize: 16, color: '#94A3B8', maxWidth: 600, margin: '0 auto' }}>Built for digital agencies and operations teams who need AI that understands context and respects boundaries.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 24, marginBottom: 80 }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="bb-feature-card" style={{ padding: '32px 24px', borderRadius: 16, background: 'var(--bg-card-solid, rgba(15,20,30,0.6))', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.03))', boxShadow: 'var(--card-inset, inset 0 1px 0 rgba(255,255,255,0.05))', transition: 'all 300ms', cursor: 'pointer' }}>
                <div style={{ fontSize: 40, marginBottom: 16 }}>{f.emoji}</div>
                <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 12, color: '#F1F5F9' }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.6 }}>{f.description}</p>
              </div>
            ))}
          </div>
          <div style={{ padding: '40px 32px', borderRadius: 20, background: 'var(--bb-surface, rgba(10,14,23,0.5))', backdropFilter: 'blur(26px)', WebkitBackdropFilter: 'blur(26px)', border: '1px solid rgba(16,185,129,0.1)', textAlign: 'center' }}>
            <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 32, color: '#F1F5F9' }}>15+ Integrations</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 16 }}>
              {INTEGRATION_LOGOS.map((logo) => (
                <div key={logo.name} className="bb-integration-icon" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', transition: 'all 200ms' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>{logo.icon}</div>
                  <span style={{ fontSize: 14, color: '#94A3B8' }}>{logo.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <TestimonialsSection />

      {/* Pricing */}
      <section style={{ padding: '100px 20px', background: 'rgba(5,5,10,0.5)' }} id="pricing">
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2 style={{ fontSize: 'clamp(28px, 5vw, 48px)', fontWeight: 500, marginBottom: 24, letterSpacing: '-0.02em' }}>Simple, Transparent Pricing</h2>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 32 }}>
              <span style={{ fontSize: 14, color: isAnnual ? '#94A3B8' : '#F1F5F9' }}>Monthly</span>
              <button onClick={() => setIsAnnual(!isAnnual)} style={{ position: 'relative', width: 60, height: 32, borderRadius: 16, border: 'none', background: isAnnual ? '#10b981' : 'rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'background 300ms' }}>
                <div style={{ position: 'absolute', width: 28, height: 28, borderRadius: 16, background: '#fff', top: 2, left: isAnnual ? 30 : 2, transition: 'left 300ms' }} />
              </button>
              <span style={{ fontSize: 14, color: isAnnual ? '#F1F5F9' : '#94A3B8' }}>Annual</span>
              {isAnnual && <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: 14, fontWeight: 500, marginLeft: 8 }}>Save 20%</span>}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            {PRICING_TIERS.map((tier) => {
              const displayPrice = isAnnual ? Math.floor(tier.price * 12 * 0.8) : tier.price
              const billingPeriod = isAnnual ? '/year' : '/month'
              return (
                <div key={tier.name} className={tier.popular ? 'bb-pricing-popular' : 'bb-pricing-card'} style={{ position: 'relative', padding: '32px 24px', borderRadius: 20, background: tier.popular ? 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(16,185,129,0.05) 100%)' : 'rgba(15,20,30,0.6)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: tier.popular ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.03)', boxShadow: tier.popular ? 'inset 0 1px 0 rgba(16,185,129,0.1), 0 0 40px rgba(16,185,129,0.05)' : 'inset 0 1px 0 rgba(255,255,255,0.05)', transform: tier.popular ? 'scale(1.05)' : 'scale(1)', transition: 'all 300ms' }}>
                  {tier.popular && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', padding: '8px 16px', borderRadius: 12, background: '#10b981', color: '#000', fontSize: 14, fontWeight: 500 }}>Most Popular</div>}
                  <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8, color: '#F1F5F9' }}>{tier.name}</h3>
                  <p style={{ fontSize: 14, color: '#94A3B8', marginBottom: 24 }}>{tier.description}</p>
                  <div style={{ marginBottom: 32 }}><div style={{ fontSize: 16, fontWeight: 500, color: '#F1F5F9' }}>${displayPrice}<span style={{ fontSize: 16, fontWeight: 400, color: '#94A3B8', marginLeft: 4 }}>{billingPeriod}</span></div></div>
                  <button className={tier.popular ? 'bb-cta-primary' : 'bb-cta-secondary'} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none', background: tier.popular ? '#10b981' : 'rgba(255,255,255,0.05)', color: tier.popular ? '#000' : '#F1F5F9', fontSize: 14, fontWeight: 500, cursor: 'pointer', marginBottom: 24, transition: 'all 200ms' }}>Get Started</button>
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 24 }}>
                    {tier.features.map((feature) => (<div key={feature} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', fontSize: 14, color: '#94A3B8' }}><span style={{ color: '#10b981', fontWeight: 500, fontSize: 16, lineHeight: 1 }}>✓</span>{feature}</div>))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section style={{ padding: '80px 20px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 16, fontWeight: 500, marginBottom: 24, color: '#F1F5F9' }}>Ready to transform your operations?</h2>
        <p style={{ fontSize: 16, color: '#94A3B8', marginBottom: 32, maxWidth: 600, margin: '0 auto 32px' }}>Join teams that are automating their busywork and getting back to what matters.</p>
        <Link href="/onboard" className="bb-cta-primary" style={{ display: 'inline-block', padding: '14px 40px', borderRadius: 12, background: '#10b981', color: '#fff', fontSize: 16, fontWeight: 500, textDecoration: 'none', transition: 'all 200ms' }}>Start Your Free Trial</Link>
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
