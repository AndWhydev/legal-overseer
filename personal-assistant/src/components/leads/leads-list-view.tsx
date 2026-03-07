'use client'

import type { EnhancedLeadData } from '@/lib/leads/types'
import { getDealRotLevel, getSpeedToLeadLevel, formatCurrency, formatSpeedToLead, relativeTime } from '@/lib/leads/utils'
import { StatusPill, type StatusVariant } from '@/components/ui/status-pill'

interface LeadsListViewProps {
  leads: EnhancedLeadData[]
  onSelectLead: (lead: EnhancedLeadData) => void
}

const SCORE_VARIANT: Record<string, StatusVariant> = {
  hot: 'error',
  warm: 'warning',
  cold: 'info',
}

const STATUS_VARIANT: Record<string, StatusVariant> = {
  new: 'info',
  qualified: 'warning',
  booked: 'purple',
  converted: 'success',
  lost: 'neutral',
}

const thStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#64748B',
  padding: '10px 12px',
  textAlign: 'left',
  borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
}

const tdStyle: React.CSSProperties = {
  fontSize: 12,
  padding: '12px',
  color: '#94A3B8',
  borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
}

export function LeadsListView({ leads, onSelectLead }: LeadsListViewProps) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={thStyle}>Name</th>
            <th style={thStyle}>Source</th>
            <th style={thStyle}>Score</th>
            <th style={thStyle}>Value</th>
            <th style={thStyle}>Stage</th>
            <th style={thStyle}>Last Activity</th>
            <th style={thStyle}>Speed</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const rotLevel = getDealRotLevel(lead.last_activity_at)
            const speedLevel = getSpeedToLeadLevel(lead.created_at, lead.first_ack_at)
            const displayName = lead.prospect_name ?? lead.source_detail ?? `Lead ${lead.id.slice(0, 8)}`

            return (
              <tr
                key={lead.id}
                onClick={() => onSelectLead(lead)}
                style={{
                  cursor: 'pointer',
                  opacity: rotLevel === 'critical' ? 0.6 : rotLevel === 'stale' ? 0.7 : 1,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={{ ...tdStyle, fontWeight: 600, color: '#F1F5F9' }}>{displayName}</td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                    {lead.source_channel}
                  </span>
                </td>
                <td style={tdStyle}>
                  <StatusPill variant={SCORE_VARIANT[lead.score] ?? 'neutral'} label={lead.score} dot />
                </td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                  {formatCurrency(lead.estimated_value)}
                </td>
                <td style={tdStyle}>
                  <StatusPill variant={STATUS_VARIANT[lead.status] ?? 'neutral'} label={lead.status} />
                </td>
                <td style={tdStyle}>{lead.last_activity_at ? relativeTime(lead.last_activity_at) : '—'}</td>
                <td style={tdStyle}>
                  <span style={{
                    color: speedLevel === 'fast' ? 'var(--bb-green)' : speedLevel === 'ok' ? 'var(--bb-amber)' : 'var(--bb-red)',
                  }}>
                    {formatSpeedToLead(lead.created_at, lead.first_ack_at)}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
