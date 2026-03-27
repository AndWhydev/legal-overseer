'use client'

import Link from 'next/link'
import { C, S } from '@/lib/styles/design-tokens'

export default function CTASection() {
  return (
    <section style={{ padding: '100px 20px' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <div
          style={{
            ...S.card,
            padding: '60px 40px',
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              fontSize: 'clamp(24px, 4vw, 36px)',
              fontWeight: 500,
              marginBottom: '16px',
              letterSpacing: '-0.02em',
              color: C.textPrimary,
            }}
          >
            Ready to stop doing admin?
          </h2>
          <p
            style={{
              fontSize: 16,
              color: C.textSecondary,
              marginBottom: '32px',
              lineHeight: 1.6,
              maxWidth: '480px',
              margin: '0 auto 32px',
            }}
          >
            Start your 30-day free trial. No credit card required.
          </p>
          <div
            style={{
              display: 'flex',
              gap: '16px',
              justifyContent: 'center',
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
              Get Started Free
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
        </div>
      </div>
    </section>
  )
}
