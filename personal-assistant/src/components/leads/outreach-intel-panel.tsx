'use client'

interface OutreachIntelPanelProps {
  opportunityNotes: string | null
  outreachAngle: string | null
  priorityServices: string[] | null
}

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
  SEO: 'var(--bb-blue)',
  Tracking: 'var(--bb-purple)',
  Conversion: 'var(--bb-green)',
  Technical: 'var(--bb-amber)',
  Note: 'var(--bb-cyan)',
  General: 'var(--text-dim)',
}

export function OutreachIntelPanel({ opportunityNotes, outreachAngle, priorityServices }: OutreachIntelPanelProps) {
  const parsedNotes = parseNotesByCategory(opportunityNotes ?? '')

  return (
    <div>
      <h4 style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)', margin: '0 0 12px' }}>
        Outreach Intelligence
      </h4>

      {/* Outreach angle highlight box */}
      {outreachAngle && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.08) 0%, rgba(59, 130, 246, 0.06) 100%)',
          border: '1px solid rgba(6, 182, 212, 0.15)',
          marginBottom: 16,
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--bb-cyan)', marginBottom: 4 }}>
            SUGGESTED ANGLE
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
            {outreachAngle}
          </div>
        </div>
      )}

      {/* Opportunity notes by category */}
      {parsedNotes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {parsedNotes.map((n, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{
                fontSize: 9,
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: 6,
                background: `${CATEGORY_COLOR[n.category] ?? 'var(--text-dim)'}15`,
                color: CATEGORY_COLOR[n.category] ?? 'var(--text-dim)',
                whiteSpace: 'nowrap',
                marginTop: 1,
              }}>
                {n.category}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {n.note}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Priority services */}
      {priorityServices && priorityServices.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6 }}>
            Priority Services
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {priorityServices.map((s) => (
              <span key={s} style={{
                fontSize: 11,
                fontWeight: 500,
                padding: '4px 12px',
                borderRadius: 20,
                background: 'var(--hover-bg)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
