'use client'

import React, { useState, memo } from 'react'
import { IconSearch, IconAlertCircle, IconLayoutSidebarRight } from '@tabler/icons-react'
import { useProspectDiscovery } from '@/hooks/use-prospect-discovery'
import { ProspectCard } from './prospect-card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Spinner } from '@/components/ui/spinner'
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'

interface ProspectDiscoveryPanelProps {
  open: boolean
  onClose: () => void
}

function ProspectDiscoveryPanelInner({ open, onClose }: ProspectDiscoveryPanelProps) {
  const { job, isSearching, startDiscovery, importProspect, reset } = useProspectDiscovery()
  const [businessType, setBusinessType] = useState('')
  const [location, setLocation] = useState('')
  const [limit, setLimit] = useState(20)

  function handleClose() {
    reset()
    onClose()
  }

  function handleSearch() {
    if (!businessType.trim() || !location.trim()) return
    startDiscovery(businessType.trim(), location.trim(), limit)
  }

  const canSearch = businessType.trim() && location.trim()

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-base font-medium text-foreground">Discover Prospects</h2>
          <p className="text-[12px] text-muted-foreground">Search for businesses in your target market.</p>
        </div>
        <button onClick={handleClose} className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-muted-foreground hover:bg-secondary hover:text-foreground">
          <IconLayoutSidebarRight size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4">
        {/* Search Form */}
        {!job && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="business-type" className="text-[12px]">Business Type</Label>
              <Input
                id="business-type"
                type="text"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                placeholder="plumber, accountant, buyer's agent"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="location" className="text-[12px]">Location</Label>
              <Input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Brisbane, QLD"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="limit" className="text-[12px]">Limit</Label>
              <Input
                id="limit"
                type="number"
                value={limit}
                onChange={(e) => setLimit(Math.min(50, Math.max(1, Number(e.target.value))))}
                min={1}
                max={50}
                className="w-20"
              />
            </div>

            <Button
              onClick={handleSearch}
              disabled={!canSearch}
              className="w-full"
              size="sm"
            >
              <IconSearch data-icon />
              Search
            </Button>
          </div>
        )}

        {/* Progress State */}
        {job && job.status !== 'complete' && job.status !== 'error' && (
          <div className="flex flex-col items-center gap-4 py-10">
            <Spinner className="size-5" />
            <div className="text-center">
              <div className="text-base font-medium text-foreground">
                {job.status === 'searching' ? 'Searching...' : job.status === 'enriching' ? 'Enriching...' : 'Scoring...'}
              </div>
              <div className="text-[12px] text-muted-foreground">{job.message}</div>
            </div>
            <Progress value={job.progress} className="h-1 w-full max-w-xs" />
          </div>
        )}

        {/* Error State */}
        {job?.status === 'error' && (
          <Empty className="py-6">
            <EmptyMedia variant="icon"><IconAlertCircle size={20} /></EmptyMedia>
            <EmptyTitle>Something went wrong</EmptyTitle>
            <EmptyDescription>{job.error}</EmptyDescription>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={reset}>Retry</Button>
            </EmptyContent>
          </Empty>
        )}

        {/* Results */}
        {job?.status === 'complete' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-base font-medium text-foreground">
                {job.results.length} prospects found
              </span>
              <Button variant="ghost" size="sm" onClick={reset}>
                New Search
              </Button>
            </div>

            {job.results.map((prospect, i) => (
              <ProspectCard key={`${prospect.domain ?? i}`} prospect={prospect} onImport={importProspect} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export const ProspectDiscoveryPanel = memo(ProspectDiscoveryPanelInner)
