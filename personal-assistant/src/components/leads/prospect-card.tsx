'use client'

import React, { memo } from 'react'
import {
  IconExternalLink,
  IconMapPin,
  IconPhone,
  IconMail,
  IconStar,
} from '@tabler/icons-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ProspectResult } from '@/lib/leads/types'

interface ProspectCardProps {
  prospect: ProspectResult
  onImport: (prospect: ProspectResult) => void
}

function ProspectCardInner({ prospect, onImport }: ProspectCardProps) {
  return (
    <div className="space-y-2.5 rounded-[var(--radius-md)] bg-secondary p-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-medium text-foreground">{prospect.name}</h3>
        <div className="flex shrink-0 gap-3">
          <div className="flex items-baseline gap-1">
            <span className="text-[12px] text-muted-foreground">Fit</span>
            <span className="text-base font-medium text-foreground">{prospect.fit_score}</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[12px] text-muted-foreground">Opp</span>
            <span className="text-base font-medium text-foreground">{prospect.opportunity_score}</span>
          </div>
        </div>
      </div>

      {/* SERP badges + domain */}
      <div className="flex flex-wrap items-center gap-1.5">
        {prospect.serp_presence.found_in_ads && (
          <Badge variant="secondary" className="text-[12px]">Ads</Badge>
        )}
        {prospect.serp_presence.found_in_maps && (
          <Badge variant="secondary" className="text-[12px]">
            Maps{prospect.serp_presence.maps_position != null && ` #${prospect.serp_presence.maps_position}`}
          </Badge>
        )}
        {prospect.serp_presence.found_in_organic && (
          <Badge variant="secondary" className="text-[12px]">
            Organic{prospect.serp_presence.organic_position != null && ` #${prospect.serp_presence.organic_position}`}
          </Badge>
        )}
        {prospect.domain && (
          <a
            href={prospect.website ?? `https://${prospect.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <IconExternalLink size={12} />
            {prospect.domain}
          </a>
        )}
      </div>

      {prospect.opportunity_notes && (
        <p className="line-clamp-2 text-[12px] text-muted-foreground">{prospect.opportunity_notes}</p>
      )}

      {/* Contact row */}
      <div className="flex flex-wrap gap-3 text-[12px] text-muted-foreground">
        {prospect.rating != null && (
          <span className="inline-flex items-center gap-1">
            <IconStar size={14} className="fill-warning text-warning" />
            {prospect.rating} ({prospect.review_count ?? 0})
          </span>
        )}
        {prospect.phone && (
          <span className="inline-flex items-center gap-1">
            <IconPhone size={14} /> {prospect.phone}
          </span>
        )}
        {prospect.address && (
          <span className="inline-flex items-center gap-1">
            <IconMapPin size={14} /> {prospect.address}
          </span>
        )}
      </div>

      {/* Import */}
      <Button
        size="sm"
        onClick={() => !prospect.imported && onImport(prospect)}
        disabled={prospect.imported}
        variant={prospect.imported ? 'secondary' : 'outline'}
      >
        {prospect.imported ? 'Imported' : 'Import to Pipeline'}
      </Button>
    </div>
  )
}

export const ProspectCard = memo(ProspectCardInner)
