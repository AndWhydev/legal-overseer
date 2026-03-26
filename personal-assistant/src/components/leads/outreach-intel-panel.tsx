'use client'

import React, { memo } from 'react'

interface OutreachIntelPanelProps {
  opportunityNotes: string | null
  outreachAngle: string | null
  priorityServices: string[] | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function parseNotesByCategory(notes: string): Array<{ category: string; note: string }> {
  if (!notes) return []
  return notes.split(';').map((n) => n.trim()).filter(Boolean).map((n) => {
    const colonIdx = n.indexOf(':')
    if (colonIdx > 0 && colonIdx < 20) {
      return { category: n.substring(0, colonIdx).trim(), note: n.substring(colonIdx + 1).trim() }
    }
    return { category: 'General', note: n }
  })
}

const CATEGORY_COLOR: Record<string, string> = {
  SEO: '#94A3B8',
  Tracking: '#64748B',
  Conversion: '#CBD5E1',
  Technical: '#475569',
  Note: '#94A3B8',
  General: '#475569',
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

const angleBox: React.CSSProperties = {
  padding: '12px 16px',
  borderRadius: 12,
  background: 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
  marginBottom: 16,
}

const angleLabel: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-dim, #475569)',
  marginBottom: 4,
}

const angleText: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
}

const noteRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
}

const noteText: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary, #94A3B8)',
  lineHeight: 1.4,
}

const subLabel: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-dim, #475569)',
  marginBottom: 8,
}

const servicePill: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  padding: '4px 12px',
  borderRadius: 9999,
  background: 'var(--hover-bg, rgba(255, 255, 255, 0.04))',
  border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.03))',
  color: 'var(--text-secondary, #94A3B8)',
}

// ─── Component ──────────────────────────────────────────────────────────────
function OutreachIntelPanelInner({ opportunityNotes, outreachAngle, priorityServices }: OutreachIntelPanelProps) {
  const parsedNotes = parseNotesByCategory(opportunityNotes ?? '')

  return (
    <div>
      <h4 style={sectionTitle}>Outreach Intelligence</h4>

      {outreachAngle && (
        <div style={angleBox}>
          <div style={angleLabel}>SUGGESTED ANGLE</div>
          <div style={angleText}>{outreachAngle}</div>
        </div>
      )}

      {parsedNotes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {parsedNotes.map((n, i) => {
            const color = CATEGORY_COLOR[n.category] ?? '#475569'
            return (
              <div key={i} style={noteRow}>
                <span style={{
                  fontSize: 14,
                  fontWeight: 500,
                  padding: '2px 8px',
                  borderRadius: 8,
                  background: 'var(--hover-bg-strong, rgba(255, 255, 255, 0.06))',
                  color: color,
                  whiteSpace: 'nowrap',
                  marginTop: 1,
                }}>
                  {n.category}
                </span>
                <span style={noteText}>{n.note}</span>
              </div>
            )
          })}
        </div>
      )}

      {priorityServices && priorityServices.length > 0 && (
        <div>
          <div style={subLabel}>Priority Services</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {priorityServices.map((s) => (
              <span key={s} style={servicePill}>{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export const OutreachIntelPanel = memo(OutreachIntelPanelInner)
