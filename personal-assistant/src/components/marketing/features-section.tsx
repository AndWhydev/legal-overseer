'use client'

import { Brain, Filter, SlidersHorizontal, Plug } from 'lucide-react'
import { C, S } from '@/lib/styles/design-tokens'
import type { LucideIcon } from 'lucide-react'

interface Feature {
  Icon: LucideIcon
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    Icon: Brain,
    title: 'Contextual Memory',
    description:
      'Remembers every conversation, relationship, and project detail. BitBit knows who Sezer is, what the work was, and whether it has been invoiced.',
  },
  {
    Icon: Filter,
    title: 'Smart Triage',
    description:
      'Automatically categorises and prioritises all incoming messages across email, WhatsApp, and Slack. Your important stuff floats to the top.',
  },
  {
    Icon: SlidersHorizontal,
    title: 'Graduated Autonomy',
    description:
      'You control how much BitBit does. Observer mode watches and learns. Co-pilot drafts for your approval. Autopilot handles it end to end.',
  },
  {
    Icon: Plug,
    title: '20+ Integrations',
    description:
      'Gmail, Outlook, WhatsApp, Slack, Stripe, Calendar, and more. BitBit meets your team where they already work.',
  },
]

export default function FeaturesSection() {
  return (
    <section style={{ padding: '100px 20px', position: 'relative', zIndex: 5 }}>
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
            Why BitBit?
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
            Built for businesses that need AI which understands context, respects boundaries, and actually gets things done.
          </p>
        </div>

        {/* Features grid - 2x2 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
          }}
        >
          {FEATURES.map(({ Icon, title, description }) => (
            <div
              key={title}
              style={{
                ...S.card,
                padding: '32px 24px',
                transition: 'all 300ms',
                cursor: 'default',
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
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: `1px solid ${C.borderSubtle}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <Icon size={22} color={C.textSecondary} />
              </div>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 500,
                  marginBottom: 8,
                  color: C.textPrimary,
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
  )
}
