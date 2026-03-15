'use client'

import { useState } from 'react'
import Link from 'next/link'
import TestimonialsSection from '@/components/marketing/testimonials-section'

const INTEGRATION_LOGOS = [
  { name: 'Gmail', icon: '📧' },
  { name: 'Outlook', icon: '📨' },
  { name: 'WhatsApp', icon: '💬' },
  { name: 'Slack', icon: '🔔' },
  { name: 'Stripe', icon: '💳' },
  { name: 'Google Calendar', icon: '📅' },
  { name: 'Zoom', icon: '📹' },
  { name: 'HubSpot', icon: '📊' },
  { name: 'Salesforce', icon: '🎯' },
  { name: 'LinkedIn', icon: '🤝' },
  { name: 'Twitter', icon: '𝕏' },
  { name: 'GitHub', icon: '🐙' },
]

const FEATURES = [
  {
    emoji: '🧠',
    title: 'Semantic Memory',
    description: 'AI remembers every conversation, context, and relationship. No more searching through threads or forgetting critical details.',
  },
  {
    emoji: '⚡',
    title: 'Smart Triage',
    description: 'Automatically categorizes and prioritizes incoming communications. Your agents learn what matters most to you.',
  },
  {
    emoji: '✅',
    title: 'Approval Queue',
    description: 'Set guardrails. Review important decisions before AI acts. Build trust through graduated automation.',
  },
  {
    emoji: '📋',
    title: 'Kanban + CRM',
    description: 'Unified view of leads, projects, and tasks. AI agents handle status updates, follow-ups, and reminders automatically.',
  },
]

const PRICING_TIERS = [
  {
    name: 'Starter',
    price: 29,
    description: 'Perfect for solopreneurs',
    features: [
      'Up to 500 tasks/month',
      '5 channel integrations',
      '1 AI agent',
      'Email support',
      'Community access',
    ],
  },
  {
    name: 'Growth',
    price: 99,
    description: 'Most popular for teams',
    popular: true,
    features: [
      'Up to 5,000 tasks/month',
      '15+ integrations',
      '5 AI agents',
      'Priority support',
      'Advanced analytics',
      'Custom workflows',
    ],
  },
  {
    name: 'Scale',
    price: 299,
    description: 'For high-volume operations',
    features: [
      'Unlimited tasks',
      '20+ integrations',
      'Unlimited AI agents',
      '24/7 phone support',
      'Advanced analytics',
      'Custom integrations',
      'Dedicated account manager',
    ],
  },
]

export default function MarketingPage() {
  const [isAnnual, setIsAnnual] = useState(false)

  return (
    <div style={{ background: '#0a0a0f', color: '#F1F5F9', overflow: 'hidden' }}>
      {/* Hero Section */}
      <section
        style={{
          position: 'relative',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 20px',
          background: 'linear-gradient(135deg, #0a0a0f 0%, #0f1419 50%, #141a23 100%)',
          overflow: 'hidden',
        }}
      >
        {/* Animated background gradient orbs */}
        <div
          style={{
            position: 'absolute',
            top: '-40%',
            right: '-20%',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)',
            filter: 'blur(80px)',
            animation: 'float 20s ease-in-out infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-30%',
            left: '-10%',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255, 90, 31, 0.1) 0%, transparent 70%)',
            filter: 'blur(80px)',
            animation: 'float 25s ease-in-out infinite reverse',
          }}
        />

        <div style={{ position: 'relative', zIndex: 10, maxWidth: '900px', textAlign: 'center' }}>
          {/* Main Headline */}
          <h1
            style={{
              fontSize: 'clamp(36px, 8vw, 72px)',
              fontWeight: 700,
              lineHeight: 1.2,
              marginBottom: '24px',
              letterSpacing: '-0.03em',
              color: '#F1F5F9',
            }}
          >
            Your AI operations co-pilot
          </h1>

          {/* Subheadline */}
          <p
            style={{
              fontSize: 'clamp(16px, 2vw, 20px)',
              color: '#94A3B8',
              marginBottom: '48px',
              lineHeight: 1.6,
              maxWidth: '700px',
              margin: '0 auto 48px',
            }}
          >
            BitBit remembers every conversation, understands every relationship, and handles the admin so you
            can do the work you&apos;re good at.
          </p>

          {/* CTA Buttons */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              justifyContent: 'center',
              marginBottom: '60px',
              flexWrap: 'wrap',
            }}
          >
            <Link
              href="/onboard"
              style={{
                padding: '14px 32px',
                borderRadius: '10px',
                background: '#10b981',
                color: '#fff',
                fontSize: '16px',
                fontWeight: 600,
                textDecoration: 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 200ms',
                display: 'inline-block',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#059669'
                e.currentTarget.style.transform = 'translateY(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#10b981'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              Start Free Trial
            </Link>
            <button
              style={{
                padding: '14px 32px',
                borderRadius: '10px',
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#F1F5F9',
                fontSize: '16px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 200ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
              }}
            >
              Watch Demo
            </button>
          </div>

          {/* Trust Badges */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '24px',
            }}
          >
            <p
              style={{
                fontSize: '13px',
                color: '#94A3B8',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Powered by Claude 3.5 Sonnet
            </p>
            <div
              style={{
                display: 'flex',
                gap: '16px',
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              {INTEGRATION_LOGOS.slice(0, 6).map((logo) => (
                <div
                  key={logo.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '44px',
                    height: '44px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    fontSize: '20px',
                    transition: 'all 200ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)'
                    e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.3)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                  }}
                  title={logo.name}
                >
                  {logo.icon}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section style={{ padding: '100px 20px', position: 'relative', zIndex: 5 }} id="features">
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {/* Section Header */}
          <div style={{ textAlign: 'center', marginBottom: '80px' }}>
            <h2
              style={{
                fontSize: 'clamp(28px, 5vw, 48px)',
                fontWeight: 700,
                marginBottom: '16px',
                letterSpacing: '-0.02em',
              }}
            >
              Why BitBit?
            </h2>
            <p
              style={{
                fontSize: '18px',
                color: '#94A3B8',
                maxWidth: '600px',
                margin: '0 auto',
              }}
            >
              Built for digital agencies and operations teams who need AI that understands context and respects boundaries.
            </p>
          </div>

          {/* Features Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '24px',
              marginBottom: '80px',
            }}
          >
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                style={{
                  padding: '32px 24px',
                  borderRadius: '16px',
                  background: 'rgba(15, 20, 30, 0.6)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid rgba(255, 255, 255, 0.03)',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                  transition: 'all 300ms',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(15, 20, 30, 0.8)'
                  e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.2)'
                  e.currentTarget.style.transform = 'translateY(-4px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(15, 20, 30, 0.6)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.03)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div style={{ fontSize: '40px', marginBottom: '16px' }}>{feature.emoji}</div>
                <h3
                  style={{
                    fontSize: '18px',
                    fontWeight: 600,
                    marginBottom: '12px',
                    color: '#F1F5F9',
                  }}
                >
                  {feature.title}
                </h3>
                <p
                  style={{
                    fontSize: '14px',
                    color: '#94A3B8',
                    lineHeight: 1.6,
                  }}
                >
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          {/* Integrations */}
          <div
            style={{
              padding: '40px 32px',
              borderRadius: '20px',
              background: 'rgba(10, 14, 23, 0.5)',
              backdropFilter: 'blur(26px)',
              WebkitBackdropFilter: 'blur(26px)',
              border: '1px solid rgba(16, 185, 129, 0.1)',
              textAlign: 'center',
            }}
          >
            <h3
              style={{
                fontSize: '20px',
                fontWeight: 600,
                marginBottom: '32px',
                color: '#F1F5F9',
              }}
            >
              20+ Channel Integrations
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
                gap: '16px',
              }}
            >
              {INTEGRATION_LOGOS.map((logo) => (
                <div
                  key={logo.name}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '16px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    transition: 'all 200ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'
                    e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.2)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)'
                  }}
                >
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>{logo.icon}</div>
                  <span style={{ fontSize: '12px', color: '#94A3B8' }}>{logo.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <TestimonialsSection />

      {/* Pricing Section */}
      <section style={{ padding: '100px 20px', background: 'rgba(5, 5, 10, 0.5)' }} id="pricing">
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          {/* Section Header */}
          <div style={{ textAlign: 'center', marginBottom: '60px' }}>
            <h2
              style={{
                fontSize: 'clamp(28px, 5vw, 48px)',
                fontWeight: 700,
                marginBottom: '24px',
                letterSpacing: '-0.02em',
              }}
            >
              Simple, Transparent Pricing
            </h2>

            {/* Annual Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                marginTop: '32px',
              }}
            >
              <span style={{ fontSize: '14px', color: isAnnual ? '#94A3B8' : '#F1F5F9' }}>Monthly</span>
              <button
                onClick={() => setIsAnnual(!isAnnual)}
                style={{
                  position: 'relative',
                  width: '60px',
                  height: '32px',
                  borderRadius: '16px',
                  border: 'none',
                  background: isAnnual ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                  cursor: 'pointer',
                  transition: 'background 300ms',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    width: '28px',
                    height: '28px',
                    borderRadius: '14px',
                    background: '#fff',
                    top: '2px',
                    left: isAnnual ? '30px' : '2px',
                    transition: 'left 300ms',
                  }}
                />
              </button>
              <span style={{ fontSize: '14px', color: isAnnual ? '#F1F5F9' : '#94A3B8' }}>Annual</span>
              {isAnnual && (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981',
                    fontSize: '12px',
                    fontWeight: 600,
                    marginLeft: '8px',
                  }}
                >
                  Save 20%
                </span>
              )}
            </div>
          </div>

          {/* Pricing Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '24px',
            }}
          >
            {PRICING_TIERS.map((tier) => {
              const monthlyPrice = tier.price
              const annualPrice = Math.floor(monthlyPrice * 12 * 0.8)
              const displayPrice = isAnnual ? annualPrice : monthlyPrice
              const billingPeriod = isAnnual ? '/year' : '/month'

              return (
                <div
                  key={tier.name}
                  style={{
                    position: 'relative',
                    padding: '32px 24px',
                    borderRadius: '20px',
                    background: tier.popular
                      ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)'
                      : 'rgba(15, 20, 30, 0.6)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: tier.popular
                      ? '1px solid rgba(16, 185, 129, 0.3)'
                      : '1px solid rgba(255, 255, 255, 0.03)',
                    boxShadow: tier.popular
                      ? 'inset 0 1px 0 rgba(16, 185, 129, 0.1), 0 0 40px rgba(16, 185, 129, 0.05)'
                      : 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                    transform: tier.popular ? 'scale(1.05)' : 'scale(1)',
                    transition: 'all 300ms',
                  }}
                  onMouseEnter={(e) => {
                    if (!tier.popular) {
                      e.currentTarget.style.borderColor = 'rgba(16, 185, 129, 0.2)'
                      e.currentTarget.style.transform = 'translateY(-4px)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!tier.popular) {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.03)'
                      e.currentTarget.style.transform = 'scale(1)'
                    }
                  }}
                >
                  {tier.popular && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '-12px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        padding: '6px 16px',
                        borderRadius: '12px',
                        background: '#10b981',
                        color: '#000',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      Most Popular
                    </div>
                  )}

                  <h3
                    style={{
                      fontSize: '20px',
                      fontWeight: 600,
                      marginBottom: '8px',
                      color: '#F1F5F9',
                    }}
                  >
                    {tier.name}
                  </h3>
                  <p
                    style={{
                      fontSize: '13px',
                      color: '#94A3B8',
                      marginBottom: '24px',
                    }}
                  >
                    {tier.description}
                  </p>

                  <div style={{ marginBottom: '32px' }}>
                    <div
                      style={{
                        fontSize: '42px',
                        fontWeight: 700,
                        color: '#F1F5F9',
                      }}
                    >
                      ${displayPrice}
                      <span
                        style={{
                          fontSize: '16px',
                          fontWeight: 400,
                          color: '#94A3B8',
                          marginLeft: '4px',
                        }}
                      >
                        {billingPeriod}
                      </span>
                    </div>
                  </div>

                  <button
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '10px',
                      border: 'none',
                      background: tier.popular ? '#10b981' : 'rgba(255, 255, 255, 0.05)',
                      color: tier.popular ? '#000' : '#F1F5F9',
                      fontSize: '14px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      marginBottom: '24px',
                      transition: 'all 200ms',
                    }}
                    onMouseEnter={(e) => {
                      if (tier.popular) {
                        e.currentTarget.style.background = '#059669'
                        e.currentTarget.style.transform = 'translateY(-2px)'
                      } else {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (tier.popular) {
                        e.currentTarget.style.background = '#10b981'
                        e.currentTarget.style.transform = 'translateY(0)'
                      } else {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                      }
                    }}
                  >
                    Get Started
                  </button>

                  <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '24px' }}>
                    {tier.features.map((feature) => (
                      <div
                        key={feature}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          padding: '10px 0',
                          fontSize: '13px',
                          color: '#94A3B8',
                        }}
                      >
                        <span
                          style={{
                            color: '#10b981',
                            fontWeight: 'bold',
                            fontSize: '16px',
                            lineHeight: 1,
                          }}
                        >
                          ✓
                        </span>
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section style={{ padding: '80px 20px', textAlign: 'center' }}>
        <h2
          style={{
            fontSize: '36px',
            fontWeight: 700,
            marginBottom: '24px',
            color: '#F1F5F9',
          }}
        >
          Ready to transform your operations?
        </h2>
        <p
          style={{
            fontSize: '16px',
            color: '#94A3B8',
            marginBottom: '32px',
            maxWidth: '600px',
            margin: '0 auto 32px',
          }}
        >
          Join teams that are automating their busywork and getting back to what matters.
        </p>
        <Link
          href="/onboard"
          style={{
            display: 'inline-block',
            padding: '14px 40px',
            borderRadius: '10px',
            background: '#10b981',
            color: '#fff',
            fontSize: '16px',
            fontWeight: 600,
            textDecoration: 'none',
            transition: 'all 200ms',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#059669'
            e.currentTarget.style.transform = 'translateY(-2px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#10b981'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          Start Your Free Trial
        </Link>
      </section>

      {/* CSS for animations */}
      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translate(0, 0px);
          }
          50% {
            transform: translate(30px, -30px);
          }
        }
      `}</style>
    </div>
  )
}
