'use client'

import React, { memo } from 'react'
import { Check, X, HelpCircle } from 'lucide-react'
import type { WebsiteSignals } from '@/lib/leads/types'

interface WebsiteSignalsPanelProps {
  signals: WebsiteSignals
}

// ─── Hoisted Styles ─────────────────────────────────────────────────────────
const sectionTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-dim, #475569)',
  margin: '0 0 12px',
}

const cellStyle: React.CSSProperties = {
  padding: 12,
  borderRadius: 12,
  background: 'rgba(255, 255, 255, 0.04)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
}

const cellLabel: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-dim, #475569)',
}

const cellValue: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function TriState({ value, label }: { value: boolean | null | undefined; label: string }) {
  if (value === true) return <Check size={16} style={{ color: '#22c55e' }} aria-label={`${label}: yes`} />
  if (value === false) return <X size={16} style={{ color: '#ef4444' }} aria-label={`${label}: no`} />
  return <HelpCircle size={16} style={{ color: 'var(--text-dim, #475569)' }} aria-label={`${label}: unknown`} />
}

function loadTimeColor(ms: number | null | undefined): string {
  if (ms == null) return 'var(--text-dim, #475569)'
  if (ms < 1500) return '#22c55e'
  if (ms < 3000) return '#eab308'
  return '#ef4444'
}

// ─── Component ──────────────────────────────────────────────────────────────
function WebsiteSignalsPanelInner({ signals }: WebsiteSignalsPanelProps) {
  return (
    <div>
      <h4 style={sectionTitle}>Website Signals</h4>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <div style={cellStyle}>
          <span style={cellLabel}>CMS</span>
          <span style={{ ...cellValue, color: signals.cms ? 'var(--text-primary, #F1F5F9)' : 'var(--text-dim, #475569)' }}>
            {signals.cms ?? 'Unknown'}
          </span>
        </div>

        <div style={cellStyle}>
          <span style={cellLabel}>Analytics</span>
          <TriState value={signals.has_google_analytics} label="Analytics" />
        </div>

        <div style={cellStyle}>
          <span style={cellLabel}>Pixel</span>
          <TriState value={signals.has_facebook_pixel} label="Facebook Pixel" />
        </div>

        <div style={cellStyle}>
          <span style={cellLabel}>Booking</span>
          <TriState value={signals.has_booking_system} label="Booking system" />
        </div>

        <div style={cellStyle}>
          <span style={cellLabel}>Load Time</span>
          <span style={{ ...cellValue, color: loadTimeColor(signals.load_time_ms) }}>
            {signals.load_time_ms != null ? `${signals.load_time_ms}ms` : '--'}
          </span>
        </div>

        <div style={cellStyle}>
          <span style={cellLabel}>Reachable</span>
          <TriState value={signals.reachable} label="Reachable" />
        </div>
      </div>
    </div>
  )
}

export const WebsiteSignalsPanel = memo(WebsiteSignalsPanelInner)
