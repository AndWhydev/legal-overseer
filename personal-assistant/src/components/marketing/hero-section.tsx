'use client'

import Link from 'next/link'
import { Mail, MessageSquare, CreditCard, Calendar, Hash, Globe } from 'lucide-react'
import { C } from '@/lib/styles/design-tokens'

const INTEGRATIONS = [
  { name: 'Gmail', Icon: Mail },
  { name: 'WhatsApp', Icon: MessageSquare },
  { name: 'Stripe', Icon: CreditCard },
  { name: 'Calendar', Icon: Calendar },
  { name: 'Slack', Icon: Hash },
  { name: 'Outlook', Icon: Globe },
]

export default function HeroSection() {
  return (
    <section
      style={{
        position: 'relative',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 20px 60px',
        background: 'linear-gradient(135deg, #0a0a0f 0%, #0f1419 50%, #141a23 100%)',
        overflow: 'hidden',
      }}
    >
      {/* Background gradient orbs - monochrome */}
      <div
        style={{
          position: 'absolute',
          top: '-40%',
          right: '-20%',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.06) 0%, transparent 70%)',
          filter: 'blur(80px)',
          animation: 'heroFloat 20s ease-in-out infinite',
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
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.04) 0%, transparent 70%)',
          filter: 'blur(80px)',
          animation: 'heroFloat 25s ease-in-out infinite reverse',
        }}
      />

      <div style={{ position: 'relative', zIndex: 10, maxWidth: '900px', textAlign: 'center' }}>
        {/* Main Headline */}
        <h1
          style={{
            fontSize: 'clamp(32px, 6vw, 56px)',
            fontWeight: 500,
            lineHeight: 1.15,
            marginBottom: '24px',
            letterSpacing: '-0.03em',
            color: C.textPrimary,
          }}
        >
          Your business, on autopilot.
        </h1>

        {/* Subheadline */}
        <p
          style={{
            fontSize: 16,
            color: C.textSecondary,
            marginBottom: '48px',
            lineHeight: 1.7,
            maxWidth: '680px',
            margin: '0 auto 48px',
          }}
        >
          BitBit reads your emails, manages invoices, follows up with clients, hunts tenders,
          and remembers everything. It handles the admin so you can do the work you&apos;re good at.
        </p>

        {/* Dual CTA */}
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
              height: 48,
              padding: '0 32px',
              borderRadius: 8,
              background: C.textPrimary,
              color: '#0a0f1a',
              fontSize: 16,
              fontWeight: 500,
              textDecoration: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 200ms',
              display: 'inline-flex',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '0.9'
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '1'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            Start Free Trial
          </Link>
          <Link
            href="/pricing"
            style={{
              height: 48,
              padding: '0 32px',
              borderRadius: 8,
              background: 'transparent',
              border: `1px solid ${C.borderHover}`,
              color: C.textPrimary,
              fontSize: 16,
              fontWeight: 500,
              textDecoration: 'none',
              cursor: 'pointer',
              transition: 'all 200ms',
              display: 'inline-flex',
              alignItems: 'center',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = C.borderHover
            }}
          >
            See Pricing
          </Link>
        </div>

        {/* Trust line + integration icons */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '20px',
          }}
        >
          <p
            style={{
              fontSize: 13,
              color: C.textDim,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Trusted by agencies across Australia
          </p>
          <div
            style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            {INTEGRATIONS.map(({ name, Icon }) => (
              <div
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: `1px solid ${C.borderHover}`,
                  transition: 'all 200ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                  e.currentTarget.style.borderColor = C.borderHover
                }}
                title={name}
              >
                <Icon size={18} color={C.textSecondary} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes heroFloat {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(30px, -30px); }
        }
      `}</style>
    </section>
  )
}
