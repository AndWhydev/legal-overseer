'use client'

import { ExternalLink, MapPin, Phone, Mail, Star } from 'lucide-react'
import type { ProspectResult } from '@/lib/leads/types'

interface ProspectCardProps {
  prospect: ProspectResult
  onImport: (prospect: ProspectResult) => void
}

function ScoreMini({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 500, fontFamily: 'var(--font-mono)', color }}>{score}</span>
    </div>
  )
}

function SerpBadge({ label, active, position }: { label: string; active?: boolean; position?: number | null }) {
  if (!active) return null
  return (
    <span style={{
      fontSize: 14,
      fontWeight: 500,
      padding: '2px 8px',
      borderRadius: 8,
      background: 'rgba(59, 130, 246, 0.1)',
      color: 'var(--bb-blue)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
    }}>
      {label}
      {position != null && <span style={{ opacity: 0.7 }}>#{position}</span>}
    </span>
  )
}

export function ProspectCard({ prospect, onImport }: ProspectCardProps) {
  return (
    <div style={{
      padding: '16px 20px',
      borderRadius: 16,
      background: 'var(--bb-surface)',
      backdropFilter: 'var(--glass-card-blur)',
      border: '1px solid var(--border-subtle)',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
            {prospect.name}
          </h3>
          {prospect.domain && (
            <a
              href={prospect.website ?? `https://${prospect.domain}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 14, color: 'var(--bb-cyan)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <ExternalLink style={{ width: 10, height: 10 }} />
              {prospect.domain}
            </a>
          )}
        </div>

        {/* Scores */}
        <div style={{ display: 'flex', gap: 12 }}>
          <ScoreMini label="Fit" score={prospect.fit_score} color="var(--bb-cyan)" />
          <ScoreMini label="Opp" score={prospect.opportunity_score} color="var(--bb-amber)" />
        </div>
      </div>

      {/* SERP badges */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <SerpBadge label="Ads" active={prospect.serp_presence.found_in_ads} />
        <SerpBadge label="Maps" active={prospect.serp_presence.found_in_maps} position={prospect.serp_presence.maps_position} />
        <SerpBadge label="Organic" active={prospect.serp_presence.found_in_organic} position={prospect.serp_presence.organic_position} />
      </div>

      {/* Opportunity notes (truncated) */}
      {prospect.opportunity_notes && (
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {prospect.opportunity_notes}
        </div>
      )}

      {/* Contact + Rating */}
      <div style={{ display: 'flex', gap: 12, fontSize: 14, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
        {prospect.rating != null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Star style={{ width: 11, height: 11, fill: 'var(--bb-amber)', color: 'var(--bb-amber)' }} />
            {prospect.rating} ({prospect.review_count ?? 0})
          </span>
        )}
        {prospect.phone && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Phone style={{ width: 11, height: 11 }} />
            {prospect.phone}
          </span>
        )}
        {prospect.emails.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Mail style={{ width: 11, height: 11 }} />
            {prospect.emails[0]}
          </span>
        )}
        {prospect.address && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MapPin style={{ width: 11, height: 11 }} />
            {prospect.address}
          </span>
        )}
      </div>

      {/* Import button */}
      <button
        onClick={() => !prospect.imported && onImport(prospect)}
        disabled={prospect.imported}
        style={{
          alignSelf: 'flex-start',
          height: 40,
          padding: '0 20px',
          display: 'inline-flex',
          alignItems: 'center',
          borderRadius: 8,
          border: 'none',
          background: prospect.imported
            ? 'rgba(34, 197, 94, 0.1)'
            : 'linear-gradient(135deg, var(--bb-cyan) 0%, var(--bb-blue) 100%)',
          color: prospect.imported ? 'var(--bb-green)' : '#fff',
          fontSize: 14,
          fontWeight: 500,
          cursor: prospect.imported ? 'default' : 'pointer',
          transition: 'opacity 0.15s',
        }}
      >
        {prospect.imported ? 'Imported' : 'Import to Pipeline'}
      </button>
    </div>
  )
}
