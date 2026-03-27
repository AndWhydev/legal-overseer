'use client'

import React from 'react'
import { IconCheck, IconMinus } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

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
      <span className="font-mono text-xs">
        {value}
      </span>
    )
  }
  if (value === true) {
    return <IconCheck size={16} className="text-foreground" />
  }
  return <IconMinus size={14} className="text-muted-foreground/60" />
}

export default function PricingComparisonTable() {
  return (
    <div className="mt-16">
      <h2 className="mb-8 text-center text-base font-medium tracking-tight">
        Compare all features
      </h2>

      <div className="overflow-auto rounded-xl border border-border/30 bg-card/50">
        <table className="w-full min-w-[640px] border-collapse">
          {/* Header */}
          <thead>
            <tr>
              <th className="sticky left-0 z-[2] min-w-[180px] border-b border-border/30 bg-card/80 px-5 py-3.5 text-left text-sm font-medium text-muted-foreground/60">
                Feature
              </th>
              {PLAN_NAMES.map((plan, i) => (
                <th
                  key={plan}
                  className={cn(
                    'min-w-[90px] border-b border-border/30 px-4 py-3.5 text-center text-sm',
                    plan === 'Growth' ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground',
                    i === 0 && 'border-l border-border/30',
                  )}
                >
                  {plan}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {COMPARISON_DATA.map((section) => (
              <React.Fragment key={section.category}>
                {/* Category header row */}
                <tr>
                  <td
                    colSpan={6}
                    className="sticky left-0 z-[1] border-b border-border/30 bg-card/80 px-5 pb-2 pt-3 text-xs font-medium uppercase tracking-[0.03em] text-muted-foreground/60"
                  >
                    {section.category}
                  </td>
                </tr>

                {/* Feature rows */}
                {section.rows.map((row, rowIdx) => (
                  <tr
                    key={row.name}
                    className={rowIdx % 2 !== 0 ? 'bg-white/[0.01]' : ''}
                  >
                    <td
                      className={cn(
                        'sticky left-0 z-[1] border-b border-border/30 px-5 py-2.5 text-sm text-muted-foreground',
                        rowIdx % 2 === 0 ? 'bg-card/50' : 'bg-card/80',
                      )}
                    >
                      {row.name}
                    </td>
                    {PLAN_KEYS.map((key, i) => (
                      <td
                        key={key}
                        className={cn(
                          'border-b border-border/30 px-4 py-2.5 text-center',
                          i === 0 && 'border-l border-border/30',
                        )}
                      >
                        <CellContent value={row[key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
