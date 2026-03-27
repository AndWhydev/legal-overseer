'use client'

import { Check, Minus } from 'lucide-react'
import { S, C } from '@/lib/styles/design-tokens'

type CellValue = boolean | string

interface FeatureRow {
  name: string
  free: CellValue
  starter: CellValue
  growth: CellValue
  scale: CellValue
  enterprise: CellValue
}

interface FeatureSection {
  category: string
  rows: FeatureRow[]
}

const COMPARISON_DATA: FeatureSection[] = [
  {
    category: 'Users & Channels',
    rows: [
      { name: 'Users', free: '1', starter: '1', growth: '5', scale: '15', enterprise: 'Unlimited' },
      { name: 'Channel integrations', free: '1', starter: '3', growth: 'All', scale: 'All', enterprise: 'All' },
      { name: 'WhatsApp', free: false, starter: true, growth: true, scale: true, enterprise: true },
    ],
  },
  {
    category: 'Core Agents',
    rows: [
      { name: 'Sentry (monitoring)', free: false, starter: true, growth: true, scale: true, enterprise: true },
      { name: 'Lead Swarm (capture)', free: false, starter: true, growth: true, scale: true, enterprise: true },
      { name: 'Invoice Flow (billing)', free: false, starter: true, growth: true, scale: true, enterprise: true },
      { name: 'Channel Triage', free: false, starter: true, growth: true, scale: true, enterprise: true },
    ],
  },
  {
    category: 'Growth Tools',
    rows: [
      { name: 'SEO Monitor', free: false, starter: false, growth: true, scale: true, enterprise: true },
      { name: 'Ad Script Generator', free: false, starter: false, growth: true, scale: true, enterprise: true },
      { name: 'Content Creator', free: false, starter: false, growth: true, scale: true, enterprise: true },
      { name: 'Proposal Generation', free: false, starter: false, growth: true, scale: true, enterprise: true },
    ],
  },
  {
    category: 'Premium',
    rows: [
      { name: 'Tender Hunter', free: false, starter: false, growth: false, scale: true, enterprise: true },
      { name: 'Advanced Analytics & MRR', free: false, starter: false, growth: false, scale: true, enterprise: true },
      { name: 'Custom voice profiles', free: false, starter: false, growth: false, scale: true, enterprise: true },
    ],
  },
  {
    category: 'Support',
    rows: [
      { name: 'Community', free: true, starter: true, growth: true, scale: true, enterprise: true },
      { name: 'Priority support', free: false, starter: false, growth: true, scale: true, enterprise: true },
      { name: 'Dedicated manager', free: false, starter: false, growth: false, scale: false, enterprise: true },
    ],
  },
  {
    category: 'AI Tokens',
    rows: [
      { name: 'Monthly tokens', free: '5k', starter: '50k', growth: '200k', scale: '500k', enterprise: 'Unlimited' },
    ],
  },
]

const PLAN_NAMES = ['Free', 'Starter', 'Growth', 'Scale', 'Enterprise'] as const
const PLAN_KEYS = ['free', 'starter', 'growth', 'scale', 'enterprise'] as const

function CellContent({ value }: { value: CellValue }) {
  if (typeof value === 'string') {
    return (
      <span style={{ ...S.mono, fontSize: 13 }}>
        {value}
      </span>
    )
  }
  if (value === true) {
    return <Check size={16} style={{ color: C.textPrimary }} />
  }
  return <Minus size={14} style={{ color: C.textDim }} />
}

export default function PricingComparisonTable() {
  return (
    <div style={{ marginTop: 64 }}>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 500,
          color: C.textPrimary,
          letterSpacing: '-0.01em',
          textAlign: 'center',
          margin: '0 0 32px 0',
        }}
      >
        Compare all features
      </h2>

      <div
        style={{
          ...S.card,
          padding: 0,
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: 640,
          }}
        >
          {/* Header */}
          <thead>
            <tr>
              <th
                style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  background: C.bgCardHeavy,
                  padding: '14px 20px',
                  textAlign: 'left',
                  fontSize: 14,
                  fontWeight: 500,
                  color: C.textDim,
                  borderBottom: `1px solid ${C.borderSubtle}`,
                  minWidth: 180,
                }}
              >
                Feature
              </th>
              {PLAN_NAMES.map((plan, i) => (
                <th
                  key={plan}
                  style={{
                    padding: '14px 16px',
                    textAlign: 'center',
                    fontSize: 14,
                    fontWeight: plan === 'Growth' ? 600 : 500,
                    color: plan === 'Growth' ? C.textPrimary : C.textSecondary,
                    borderBottom: `1px solid ${C.borderSubtle}`,
                    borderLeft: i === 0 ? `1px solid ${C.borderSubtle}` : undefined,
                    minWidth: 90,
                  }}
                >
                  {plan}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {COMPARISON_DATA.map((section) => (
              <>
                {/* Category header row */}
                <tr key={`cat-${section.category}`}>
                  <td
                    colSpan={6}
                    style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      background: C.bgCardHeavy,
                      padding: '12px 20px 8px',
                      fontSize: 14,
                      fontWeight: 500,
                      letterSpacing: '0.03em',
                      textTransform: 'uppercase',
                      color: C.textDim,
                      borderBottom: `1px solid ${C.borderSubtle}`,
                    }}
                  >
                    {section.category}
                  </td>
                </tr>

                {/* Feature rows */}
                {section.rows.map((row, rowIdx) => (
                  <tr
                    key={row.name}
                    style={{
                      background: rowIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)',
                    }}
                  >
                    <td
                      style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 1,
                        background: rowIdx % 2 === 0 ? C.bgCard : C.bgCardHeavy,
                        padding: '10px 20px',
                        fontSize: 14,
                        color: C.textSecondary,
                        borderBottom: `1px solid ${C.borderSubtle}`,
                      }}
                    >
                      {row.name}
                    </td>
                    {PLAN_KEYS.map((key, i) => (
                      <td
                        key={key}
                        style={{
                          padding: '10px 16px',
                          textAlign: 'center',
                          borderBottom: `1px solid ${C.borderSubtle}`,
                          borderLeft: i === 0 ? `1px solid ${C.borderSubtle}` : undefined,
                        }}
                      >
                        <CellContent value={row[key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
