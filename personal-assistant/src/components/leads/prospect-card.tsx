'use client'

import React, { memo } from 'react'
import {
  IconExternalLink,
  IconMapPin,
  IconPhone,
  IconMail,
  IconStar,
} from '@tabler/icons-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { ProspectResult } from '@/lib/leads/types'

interface ProspectCardProps {
  prospect: ProspectResult
  onImport: (prospect: ProspectResult) => void
}

function ScoreMini({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium font-mono text-foreground">{score}</span>
    </div>
  )
}

function SerpBadge({ label, active, position }: { label: string; active?: boolean; position?: number | null }) {
  if (!active) return null
  return (
    <Badge variant="secondary">
      {label}
      {position != null && <span className="ml-1 opacity-70">#{position}</span>}
    </Badge>
  )
}

function ProspectCardInner({ prospect, onImport }: ProspectCardProps) {
  return (
    <Card className="gap-3 py-4">
      <CardContent className="space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">{prospect.name}</h3>
            {prospect.domain && (
              <a
                href={prospect.website ?? `https://${prospect.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-foreground hover:underline"
              >
                <IconExternalLink data-icon className="text-muted-foreground" />
                {prospect.domain}
              </a>
            )}
          </div>

          <div className="flex gap-3">
            <ScoreMini label="Fit" score={prospect.fit_score} />
            <ScoreMini label="Opp" score={prospect.opportunity_score} />
          </div>
        </div>

        {/* SERP badges */}
        <div className="flex flex-wrap gap-1.5">
          <SerpBadge label="Ads" active={prospect.serp_presence.found_in_ads} />
          <SerpBadge label="Maps" active={prospect.serp_presence.found_in_maps} position={prospect.serp_presence.maps_position} />
          <SerpBadge label="Organic" active={prospect.serp_presence.found_in_organic} position={prospect.serp_presence.organic_position} />
        </div>

        {prospect.opportunity_notes && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{prospect.opportunity_notes}</p>
        )}

        {/* Contact info */}
        <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
          {prospect.rating != null && (
            <span className="inline-flex items-center gap-1">
              <IconStar data-icon className="fill-warning text-warning" />
              {prospect.rating} ({prospect.review_count ?? 0})
            </span>
          )}
          {prospect.phone && (
            <span className="inline-flex items-center gap-1">
              <IconPhone data-icon /> {prospect.phone}
            </span>
          )}
          {prospect.emails.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <IconMail data-icon /> {prospect.emails[0]}
            </span>
          )}
          {prospect.address && (
            <span className="inline-flex items-center gap-1">
              <IconMapPin data-icon /> {prospect.address}
            </span>
          )}
        </div>

        {/* Import button */}
        <Button
          onClick={() => !prospect.imported && onImport(prospect)}
          disabled={prospect.imported}
          variant={prospect.imported ? 'secondary' : 'default'}
          className="self-start"
        >
          {prospect.imported ? 'Imported' : 'Import to Pipeline'}
        </Button>
      </CardContent>
    </Card>
  )
}

export const ProspectCard = memo(ProspectCardInner)
