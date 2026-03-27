'use client'

import { DollarSign, MessageSquare, TrendingUp } from 'lucide-react'
import { C, S } from '@/lib/styles/design-tokens'
import type { LucideIcon } from 'lucide-react'

interface Role {
  Icon: LucideIcon
  name: string
  handles: string
  example: string
}

const ROLES: Role[] = [
  {
    Icon: DollarSign,
    name: 'Finance',
    handles: 'Invoicing, collections, cash flow tracking, payment learning',
    example: '"Hey Bit, invoice Dave for the kitchen job" -- and it knows the rate, the scope, and whether it has been sent before.',
  },
  {
    Icon: MessageSquare,
    name: 'Comms',
    handles: 'Triage, response drafting, follow-ups, relationship health',
    example: 'Triages 200 messages overnight. Drafts replies in your voice. Flags the three that actually need you.',
  },
  {
    Icon: TrendingUp,
    name: 'Sales',
    handles: 'Proposals, lead nurture, onboarding, pipeline analytics',
    example: 'A new lead fills out your form at 11pm. BitBit sends a personalised response before you wake up.',
  },
]

export default function RolesSection() {
  return (
    <section
      style={{
        padding: '100px 20px',
        background: 'rgba(5, 5, 10, 0.4)',
        position: 'relative',
      }}
    >
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
            Autonomous roles, not dumb agents
          </h2>
          <p
            style={{
              fontSize: 16,
              color: C.textSecondary,
              maxWidth: '640px',
              margin: '0 auto',
              lineHeight: 1.6,
            }}
          >
            Each role understands its domain, remembers context, and operates at the autonomy level you choose.
          </p>
        </div>

        {/* Role cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '24px',
            marginBottom: '48px',
          }}
        >
          {ROLES.map(({ Icon, name, handles, example }) => (
            <div
              key={name}
              style={{
                ...S.card,
                padding: '32px 24px',
                transition: 'all 300ms',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                    flexShrink: 0,
                  }}
                >
                  <Icon size={20} color={C.textSecondary} />
                </div>
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
              </div>

              <p
                style={{
                  fontSize: 14,
                  color: C.textSecondary,
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {handles}
              </p>

              <div
                style={{
                  padding: '12px 16px',
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

        {/* Additional roles note */}
        <p
          style={{
            textAlign: 'center',
            fontSize: 14,
            color: C.textDim,
            margin: 0,
          }}
        >
          + Growth tools: SEO Monitor, Tender Hunter, Content Creator, Ad Scripts
        </p>
      </div>
    </section>
  )
}
