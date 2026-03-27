'use client'

import Link from 'next/link'
import { C, S } from '@/lib/styles/design-tokens'
import Footer from '@/components/marketing/footer'
import type { LucideIcon } from 'lucide-react'

interface PainPoint {
  icon: LucideIcon
  title: string
  description: string
}

interface RoleInfo {
  name: string
  description: string
  example: string
}

export interface IndustryPageProps {
  industry: string
  headline: string
  subheadline: string
  painPoints: PainPoint[]
  roles: RoleInfo[]
  recommendedTier: string
  tierPrice: string
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
    <div style={{ background: '#0a0a0f', color: C.textPrimary, overflow: 'hidden' }}>
      {/* Hero Banner */}
      <section
        style={{
          position: 'relative',
          padding: '120px 20px 80px',
          background: 'linear-gradient(135deg, #0a0a0f 0%, #0f1419 50%, #141a23 100%)',
          overflow: 'hidden',
        }}
      >
        {/* Subtle background orb */}
        <div
          style={{
            position: 'absolute',
            top: '-30%',
            right: '-15%',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255, 255, 255, 0.04) 0%, transparent 70%)',
            filter: 'blur(80px)',
          }}
        />

        <div style={{ position: 'relative', zIndex: 10, maxWidth: '800px', margin: '0 auto' }}>
          <p
            style={{
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: C.textDim,
              marginBottom: 16,
            }}
          >
            BitBit for {industry}
          </p>
          <h1
            style={{
              fontSize: 'clamp(28px, 5vw, 48px)',
              fontWeight: 500,
              lineHeight: 1.15,
              letterSpacing: '-0.03em',
              color: C.textPrimary,
              marginBottom: 24,
            }}
          >
            {headline}
          </h1>
          <p
            style={{
              fontSize: 16,
              color: C.textSecondary,
              lineHeight: 1.7,
              maxWidth: '640px',
            }}
          >
            {subheadline}
          </p>
        </div>
      </section>

      {/* Pain Points Grid */}
      <section style={{ padding: '80px 20px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <h2
            style={{
              fontSize: 'clamp(22px, 3.5vw, 32px)',
              fontWeight: 500,
              marginBottom: 48,
              letterSpacing: '-0.02em',
              color: C.textPrimary,
              textAlign: 'center',
            }}
          >
            Problems you know too well
          </h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 24,
            }}
          >
            {painPoints.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                style={{
                  ...S.card,
                  padding: '28px 24px',
                  transition: 'all 300ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = C.bgCardHeavy
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                  e.currentTarget.style.transform = 'translateY(-4px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = C.bgCard
                  e.currentTarget.style.borderColor = C.borderSubtle
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: `1px solid ${C.borderSubtle}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 16,
                  }}
                >
                  <Icon size={20} color={C.textSecondary} />
                </div>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: C.textPrimary,
                    marginBottom: 8,
                  }}
                >
                  {title}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    color: C.textSecondary,
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How BitBit Helps - Roles */}
      <section
        style={{
          padding: '80px 20px',
          background: 'rgba(5, 5, 10, 0.4)',
        }}
      >
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h2
            style={{
              fontSize: 'clamp(22px, 3.5vw, 32px)',
              fontWeight: 500,
              marginBottom: 48,
              letterSpacing: '-0.02em',
              color: C.textPrimary,
              textAlign: 'center',
            }}
          >
            How BitBit helps
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {roles.map(({ name, description, example }) => (
              <div
                key={name}
                style={{
                  ...S.card,
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 500,
                    color: C.textPrimary,
                    margin: 0,
                  }}
                >
                  {name}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    color: C.textSecondary,
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  {description}
                </p>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${C.borderSubtle}`,
                    fontSize: 14,
                    color: C.textDim,
                    lineHeight: 1.5,
                    fontStyle: 'italic',
                  }}
                >
                  {example}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recommended Tier */}
      <section style={{ padding: '80px 20px' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div
            style={{
              ...S.card,
              padding: '40px 32px',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: C.textDim,
                marginBottom: 12,
              }}
            >
              Recommended for {industry}
            </p>
            <h3
              style={{
                fontSize: 'clamp(22px, 3vw, 32px)',
                fontWeight: 500,
                color: C.textPrimary,
                marginBottom: 8,
              }}
            >
              {recommendedTier} Plan
            </h3>
            <p
              style={{
                fontSize: 'clamp(28px, 4vw, 40px)',
                fontWeight: 500,
                color: C.textPrimary,
                marginBottom: 8,
                fontFamily: 'var(--font-mono, monospace)',
                letterSpacing: '-0.02em',
              }}
            >
              {tierPrice}
            </p>
            <p
              style={{
                fontSize: 14,
                color: C.textSecondary,
                marginBottom: 32,
              }}
            >
              30-day free trial. No credit card required.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 16,
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Link
                href={`/login?redirect=/dashboard&checkout_tier=${recommendedTier.toLowerCase()}`}
                style={{
                  height: 48,
                  padding: '0 32px',
                  borderRadius: 8,
                  background: C.textPrimary,
                  color: '#0a0f1a',
                  fontSize: 16,
                  fontWeight: 500,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  transition: 'all 200ms',
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
                  display: 'inline-flex',
                  alignItems: 'center',
                  transition: 'all 200ms',
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
                Compare All Plans
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
