'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { C, S } from '@/lib/styles/design-tokens'

const CASE_STUDY_STATS = [
  { value: '2,400+', label: 'Messages triaged' },
  { value: '87%', label: 'Invoices automated' },
  { value: '<2min', label: 'Avg response time' },
]

const TESTIMONIALS = [
  {
    name: 'Marcus Reid',
    role: 'Operations Director',
    company: 'Digital Forward Agency',
    quote:
      'BitBit has cut our admin overhead by 60%. My team can now focus on client strategy instead of triaging emails all day.',
  },
  {
    name: 'Priya Menon',
    role: 'Founder & CEO',
    company: 'Momentum Ventures',
    quote:
      'The graduated autonomy gives us the control we need while the AI handles the repetitive work. Best decision we made.',
  },
]

export default function SocialProofSection() {
  return (
    <section style={{ padding: '100px 20px', position: 'relative' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Section header */}
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <h2
            style={{
              fontSize: 'clamp(24px, 4vw, 36px)',
              fontWeight: 500,
              marginBottom: '16px',
              letterSpacing: '-0.02em',
              color: C.textPrimary,
            }}
          >
            Real results, not demos
          </h2>
          <p
            style={{
              fontSize: 16,
              color: C.textSecondary,
              maxWidth: '600px',
              margin: '0 auto',
              lineHeight: 1.6,
            }}
          >
            BitBit is already running operations for Australian businesses.
          </p>
        </div>

        {/* AWU Case Study Card */}
        <div
          style={{
            ...S.card,
            padding: '40px 32px',
            marginBottom: '48px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '32px',
            }}
          >
            {/* Case study header */}
            <div>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: C.textDim,
                  marginBottom: 8,
                }}
              >
                Case Study
              </p>
              <h3
                style={{
                  fontSize: 'clamp(18px, 3vw, 24px)',
                  fontWeight: 500,
                  color: C.textPrimary,
                  marginBottom: 8,
                }}
              >
                All Webbed Up -- How a Brisbane agency automated their operations
              </h3>
              <p
                style={{
                  fontSize: 14,
                  color: C.textSecondary,
                  lineHeight: 1.6,
                  maxWidth: '640px',
                }}
              >
                &quot;Andy put it simply: this thing can be sold to a marketing agency worldwide and they&apos;d probably jump at it.&quot;
              </p>
            </div>

            {/* Stat boxes */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '16px',
              }}
            >
              {CASE_STUDY_STATS.map(({ value, label }) => (
                <div
                  key={label}
                  style={{
                    padding: '20px 16px',
                    borderRadius: 12,
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: `1px solid ${C.borderSubtle}`,
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 'clamp(20px, 3vw, 28px)',
                      fontWeight: 500,
                      color: C.textPrimary,
                      marginBottom: 4,
                      fontFamily: 'var(--font-mono, monospace)',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {value}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: C.textDim,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div>
              <Link
                href="/case-study"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  color: C.textPrimary,
                  textDecoration: 'none',
                  transition: 'opacity 200ms',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.7'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1'
                }}
              >
                Read the full case study
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>

        {/* Testimonial cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '24px',
          }}
        >
          {TESTIMONIALS.map((t) => (
            <div
              key={t.name}
              style={{
                ...S.card,
                padding: '32px 24px',
                display: 'flex',
                flexDirection: 'column',
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
              <p
                style={{
                  fontSize: 16,
                  color: C.textPrimary,
                  lineHeight: 1.6,
                  marginBottom: 24,
                  fontStyle: 'italic',
                  flex: 1,
                }}
              >
                &quot;{t.quote}&quot;
              </p>
              <div>
                <p
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: C.textPrimary,
                    margin: '0 0 2px 0',
                  }}
                >
                  {t.name}
                </p>
                <p
                  style={{
                    fontSize: 14,
                    color: C.textSecondary,
                    margin: 0,
                  }}
                >
                  {t.role} at {t.company}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
