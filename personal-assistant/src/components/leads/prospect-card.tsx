'use client'

import React, { memo } from 'react'
import { ExternalLink, MapPin, Phone, Mail, Star } from 'lucide-react'
import type { ProspectResult } from '@/lib/leads/types'

interface ProspectCardProps {
  prospect: ProspectResult
  onImport: (prospect: ProspectResult) => void
}

// ─── Hoisted Styles ─────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  padding: '16px 20px',
  borderRadius: 16,
  background: 'rgba(15, 20, 30, 0.6)',
  backdropFilter: 'blur(20px) saturate(1.2)',
  WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
  border: '1px solid rgba(255, 255, 255, 0.03)',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const headerRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
}

const prospectName: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  color: 'var(--text-primary, #F1F5F9)',
  margin: 0,
}

const domainLink: React.CSSProperties = {
  fontSize: 14,
  color: '#06b6d4',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
}

const scoresRow: React.CSSProperties = {
  display: 'flex',
  gap: 12,
}

const serpBadge: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 500,
  padding: '2px 8px',
  borderRadius: 8,
  background: 'rgba(59, 130, 246, 0.1)',
  color: '#3b82f6',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
}

const notesText: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary, #94A3B8)',
  lineHeight: 1.4,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
}

const contactRow: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  fontSize: 14,
  color: 'var(--text-dim, #475569)',
  flexWrap: 'wrap',
}

const contactItem: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
}

// ─── Sub-components ─────────────────────────────────────────────────────────
function ScoreMini({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 14, color: 'var(--text-dim, #475569)' }}>{label}</span>
      <span style={{
        fontSize: 14,
        fontWeight: 500,
        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        color,
      }}>
        {score}
      </span>
    </div>
  )
}

function SerpBadge({ label, active, position }: { label: string; active?: boolean; position?: number | null }) {
  if (!active) return null
  return (
    <span style={serpBadge}>
      {label}
      {position != null && <span style={{ opacity: 0.7 }}>#{position}</span>}
    </span>
  )
}

// ─── Component ──────────────────────────────────────────────────────────────
function ProspectCardInner({ prospect, onImport }: ProspectCardProps) {
  const importBtn: React.CSSProperties = {
    alignSelf: 'flex-start',
    height: 40,
    padding: '0 20px',
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 8,
    border: 'none',
    background: prospect.imported
      ? 'rgba(34, 197, 94, 0.1)'
      : '#FF5A1F',
    color: prospect.imported ? '#22c55e' : '#000',
    fontSize: 14,
    fontWeight: 500,
    cursor: prospect.imported ? 'default' : 'pointer',
    transition: 'all 200ms',
  }

  return (
    <div style={card}>
      <div style={headerRow}>
        <div>
          <h3 style={prospectName}>{prospect.name}</h3>
          {prospect.domain && (
            <a
              href={prospect.website ?? `https://${prospect.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              style={domainLink}
            >
              <ExternalLink size={16} />
              {prospect.domain}
            </a>
          )}
        </div>

        <div style={scoresRow}>
          <ScoreMini label="Fit" score={prospect.fit_score} color="#06b6d4" />
          <ScoreMini label="Opp" score={prospect.opportunity_score} color="#eab308" />
        </div>
      </div>

      {/* SERP badges */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <SerpBadge label="Ads" active={prospect.serp_presence.found_in_ads} />
        <SerpBadge label="Maps" active={prospect.serp_presence.found_in_maps} position={prospect.serp_presence.maps_position} />
        <SerpBadge label="Organic" active={prospect.serp_presence.found_in_organic} position={prospect.serp_presence.organic_position} />
      </div>

      {prospect.opportunity_notes && (
        <div style={notesText}>{prospect.opportunity_notes}</div>
      )}

      <div style={contactRow}>
        {prospect.rating != null && (
          <span style={contactItem}>
            <Star size={16} style={{ fill: '#eab308', color: '#eab308' }} />
            {prospect.rating} ({prospect.review_count ?? 0})
          </span>
        )}
        {prospect.phone && (
          <span style={contactItem}>
            <Phone size={16} /> {prospect.phone}
          </span>
        )}
        {prospect.emails.length > 0 && (
          <span style={contactItem}>
            <Mail size={16} /> {prospect.emails[0]}
          </span>
        )}
        {prospect.address && (
          <span style={contactItem}>
            <MapPin size={16} /> {prospect.address}
          </span>
        )}
      </div>

      <button
        onClick={() => !prospect.imported && onImport(prospect)}
        disabled={prospect.imported}
        style={importBtn}
        aria-label={prospect.imported ? 'Already imported' : `Import ${prospect.name} to pipeline`}
        onMouseEnter={e => { if (!prospect.imported) { e.currentTarget.style.background = '#FF7A45'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
        onMouseLeave={e => { if (!prospect.imported) { e.currentTarget.style.background = '#FF5A1F'; e.currentTarget.style.transform = 'translateY(0)' } }}
      >
        {prospect.imported ? 'Imported' : 'Import to Pipeline'}
      </button>
    </div>
  )
}

export const ProspectCard = memo(ProspectCardInner)
