'use client'

import React from 'react'

const TESTIMONIALS = [
  {
    id: 1,
    avatar: '👨‍💼',
    name: 'Marcus Reid',
    role: 'Operations Director',
    company: 'Digital Forward Agency',
    quote: 'BitBit has cut our admin overhead by 60%. My team can now focus on client strategy instead of triaging emails all day.',
  },
  {
    id: 2,
    avatar: '👩‍💼',
    name: 'Priya Menon',
    role: 'Founder & CEO',
    company: 'Momentum Ventures',
    quote: 'The approval queue feature gives us the control we need while the AI handles the repetitive work. Best decision we made.',
  },
  {
    id: 3,
    avatar: '👨‍💻',
    name: 'James Ko',
    role: 'Operations Manager',
    company: 'TechScale Consulting',
    quote: 'Being able to remember context across 20+ Slack channels and email threads has transformed how we service our clients.',
  },
]

const METRICS = [
  { label: '500+', description: 'Messages Processed' },
  { label: '99.9%', description: 'Uptime' },
  { label: '20+', description: 'Integrations' },
]

const PARTNERS = [
  { name: 'AI Partner', icon: '🧠' },
  { name: 'Supabase', icon: '🐘' },
  { name: 'Vercel', icon: '⚡' },
  { name: 'Stripe', icon: '💳' },
  { name: 'Pinecone', icon: '🔍' },
]

export default function TestimonialsSection() {
  return (
    <section
      style={{
        padding: '100px 20px',
        background: 'var(--background)',
        position: 'relative',
      }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Section Header */}
        <div style={{ textAlign: 'center', marginBottom: '80px' }}>
          <h2
            style={{
              fontSize: 'clamp(28px, 5vw, 48px)',
              fontWeight: 500,
              marginBottom: '16px',
              letterSpacing: '-0.02em',
              color: 'var(--foreground)',
            }}
          >
            Loved by operations teams
          </h2>
          <p
            style={{
              fontSize: '16px',
              color: 'var(--muted-foreground)',
              maxWidth: '600px',
              margin: '0 auto',
            }}
          >
            See what beta users are saying about BitBit.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '24px',
            marginBottom: '80px',
          }}
        >
          {TESTIMONIALS.map((testimonial) => (
            <div
              key={testimonial.id}
              style={{
                padding: '32px 24px',
                borderRadius: '16px',
                background: 'var(--card)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--card-shadow, 0 2px 8px rgba(0,0,0,0.3))',
                transition: 'all 300ms',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--elevated)'
                e.currentTarget.style.borderColor = 'var(--success)'
                e.currentTarget.style.transform = 'translateY(-4px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--card)'
                e.currentTarget.style.borderColor = 'var(--border)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              {/* Star Rating */}
              <div style={{ marginBottom: '16px', fontSize: '16px' }}>⭐⭐⭐⭐⭐</div>

              {/* Quote */}
              <p
                style={{
                  fontSize: '16px',
                  color: 'var(--foreground)',
                  lineHeight: 1.6,
                  marginBottom: '24px',
                  fontStyle: 'italic',
                  flex: 1,
                }}
              >
                "{testimonial.quote}"
              </p>

              {/* Author */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    background: 'var(--secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '16px',
                    border: '1px solid var(--border)',
                  }}
                >
                  {testimonial.avatar}
                </div>
                <div>
                  <p
                    style={{
                      fontSize: '14px',
                      fontWeight: 500,
                      color: 'var(--foreground)',
                      margin: '0 0 2px 0',
                    }}
                  >
                    {testimonial.name}
                  </p>
                  <p
                    style={{
                      fontSize: '14px',
                      color: 'var(--muted-foreground)',
                      margin: 0,
                    }}
                  >
                    {testimonial.role} at {testimonial.company}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Metrics Bar */}
        <div
          style={{
            padding: '40px 32px',
            borderRadius: '20px',
            background: 'var(--card)',
            border: '1px solid var(--border)',
            marginBottom: '80px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '32px',
            textAlign: 'center',
          }}
        >
          {METRICS.map((metric) => (
            <div key={metric.label}>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 500,
                  color: 'var(--success)',
                  marginBottom: '8px',
                }}
              >
                {metric.label}
              </div>
              <div
                style={{
                  fontSize: '14px',
                  color: 'var(--muted-foreground)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {metric.description}
              </div>
            </div>
          ))}
        </div>

        {/* Partner Logos */}
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: '24px',
            }}
          >
            Built with trust from
          </p>
          <div
            style={{
              display: 'flex',
              gap: '24px',
              justifyContent: 'center',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            {PARTNERS.map((partner) => (
              <div
                key={partner.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '12px',
                  background: 'var(--secondary)',
                  border: '1px solid var(--border)',
                  transition: 'all 200ms',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--elevated)'
                  e.currentTarget.style.borderColor = 'var(--success)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--secondary)'
                  e.currentTarget.style.borderColor = 'var(--border)'
                }}
              >
                <span style={{ fontSize: '16px' }}>{partner.icon}</span>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--foreground)',
                  }}
                >
                  {partner.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
