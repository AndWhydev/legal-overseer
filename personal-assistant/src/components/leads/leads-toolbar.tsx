'use client'

import React, { memo } from 'react'
import { IconSearch, IconLayoutKanban, IconList, IconCompass, IconFilter } from '@tabler/icons-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import type { LeadFilter, LeadViewMode, PipelineAnalytics } from '@/lib/leads/types'

interface LeadsToolbarProps {
  filters: LeadFilter
  onFiltersChange: (filters: LeadFilter) => void
  viewMode: LeadViewMode
  onViewModeChange: (mode: LeadViewMode) => void
  onDiscoverClick: () => void
  searchQuery: string
  onSearchChange: (query: string) => void
  analytics: PipelineAnalytics | null
  searchInputRef: React.RefObject<HTMLInputElement | null>
  smartViews?: Array<{ key: string; label: string }>
  activeView?: string
  counts?: Record<string, number>
}

const scoreOptions = [
  { value: 'all', label: 'All Scores' },
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
]

const sourceOptions = [
  { value: 'all', label: 'All Sources' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'web', label: 'Web' },
  { value: 'slack', label: 'Slack' },
  { value: 'discovery', label: 'Discovery' },
]

function LeadsToolbarInner({
  filters,
  onFiltersChange,
  viewMode,
  onViewModeChange,
  onDiscoverClick,
  searchQuery,
  onSearchChange,
  searchInputRef,
}: LeadsToolbarProps) {
  return (
    <div className="space-y-3" role="toolbar" aria-label="Lead filters">
      {/* Search — full width, rounded, matches inbox */}
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchInputRef}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search leads..."
          className="h-11 rounded-full border-border bg-card pl-9 shadow-sm"
          aria-label="Search leads"
        />
      </div>

      {/* Action bar — contained pill, matches inbox toolbar */}
      <div className="flex items-center gap-1 rounded-[20px] border border-border bg-card px-3 py-1.5 shadow-sm">
        {/* Score Filter */}
        <Select
          value={filters.score ?? 'all'}
          onValueChange={(val) => onFiltersChange({ ...filters, score: val as LeadFilter['score'] })}
        >
          <SelectTrigger size="sm" className="border-0 bg-transparent shadow-none">
            <IconFilter className="size-4 text-muted-foreground" />
            <SelectValue placeholder="Score" />
          </SelectTrigger>
          <SelectContent>
            {scoreOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* Source Filter */}
        <Select
          value={filters.source ?? 'all'}
          onValueChange={(val) => onFiltersChange({ ...filters, source: val })}
        >
          <SelectTrigger size="sm" className="border-0 bg-transparent shadow-none">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            {sourceOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Separator orientation="vertical" className="mx-1 h-4" />

        {/* View Toggle */}
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(val) => { if (val) onViewModeChange(val as LeadViewMode) }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="kanban" aria-label="Kanban view">
            <IconLayoutKanban data-icon />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view">
            <IconList data-icon />
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="ml-auto" />

        {/* Discover */}
        <Button onClick={onDiscoverClick} size="sm" variant="ghost" className="rounded-full">
          <IconCompass className="size-4" />
          Discover
        </Button>
      </div>
    </div>
  )
}

export const LeadsToolbar = memo(LeadsToolbarInner)
