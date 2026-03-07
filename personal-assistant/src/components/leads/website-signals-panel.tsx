'use client'

import { Check, X, HelpCircle } from 'lucide-react'
import type { WebsiteSignals } from '@/lib/leads/types'

interface WebsiteSignalsPanelProps {
  signals: WebsiteSignals
}

function TriState({ value }: { value: boolean | null | undefined }) {
  if (value === true) return <Check style={{ width: 14, height: 14, color: 'var(--bb-green, #22C55E)' }} />
  if (value === false) return <X style={{ width: 14, height: 14, color: 'var(--bb-red, #EF4444)' }} />
  return <HelpCircle style={{ width: 14, height: 14, color: '#475569' }} />
}

function LoadTimeColor(ms: number | null | undefined): string {
  if (ms == null) return '#475569'
  if (ms < 1500) return 'var(--bb-green, #22C55E)'
  if (ms < 3000) return 'var(--bb-amber, #F59E0B)'
  return 'var(--bb-red, #EF4444)'
}

const cellStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 10,
  background: 'rgba(255, 255, 255, 0.02)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
}

const cellLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  color: '#475569',
}

const cellValueStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'var(--font-mono)',
}

export function WebsiteSignalsPanel({ signals }: WebsiteSignalsPanelProps) {
  return (
    <div>
      <h4 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', margin: '0 0 12px' }}>
        Website Signals
      </h4>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {/* CMS */}
        <div style={cellStyle}>
          <span style={cellLabelStyle}>CMS</span>
          <span style={{ ...cellValueStyle, color: signals.cms ? '#F1F5F9' : '#475569' }}>
            {signals.cms ?? 'Unknown'}
          </span>
        </div>

        {/* Analytics */}
        <div style={cellStyle}>
          <span style={cellLabelStyle}>Analytics</span>
          <TriState value={signals.has_google_analytics} />
        </div>

        {/* FB Pixel */}
        <div style={cellStyle}>
          <span style={cellLabelStyle}>Pixel</span>
          <TriState value={signals.has_facebook_pixel} />
        </div>

        {/* Booking */}
        <div style={cellStyle}>
          <span style={cellLabelStyle}>Booking</span>
          <TriState value={signals.has_booking_system} />
        </div>

        {/* Load Time */}
        <div style={cellStyle}>
          <span style={cellLabelStyle}>Load Time</span>
          <span style={{ ...cellValueStyle, color: LoadTimeColor(signals.load_time_ms) }}>
            {signals.load_time_ms != null ? `${signals.load_time_ms}ms` : '—'}
          </span>
        </div>

        {/* Rating */}
        <div style={cellStyle}>
          <span style={cellLabelStyle}>Reachable</span>
          <TriState value={signals.reachable} />
        </div>
      </div>
    </div>
  )
}
