'use client'

import React, { memo } from 'react'
import { IconSearch, IconLayoutKanban, IconList, IconFilter } from '@tabler/icons-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Separator } from '@/components/ui/separator'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
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
  leadCount?: number
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
  onDiscoverClick: _onDiscoverClick,
  searchQuery,
  onSearchChange,
  searchInputRef,
  leadCount,
}: LeadsToolbarProps) {
  return (
    <div className="flex items-center gap-1 rounded-[var(--radius-container)] border border-border bg-card px-3 py-1.5 shadow-sm" role="toolbar" aria-label="Lead filters">
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

      <Separator orientation="vertical" className="mx-1 h-4" />

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

      <div className="ml-auto" />

      {/* Search with lead count */}
      <InputGroup className="w-36 shrink-0 bg-input">
        <InputGroupAddon>
          <IconSearch className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          ref={searchInputRef}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search..."
          aria-label="Search leads"
        />
        {leadCount != null && leadCount > 0 && (
          <InputGroupAddon align="inline-end">
            <InputGroupText className="whitespace-nowrap text-[12px]">{leadCount}</InputGroupText>
          </InputGroupAddon>
        )}
      </InputGroup>
    </div>
  )
}

export const LeadsToolbar = memo(LeadsToolbarInner)
