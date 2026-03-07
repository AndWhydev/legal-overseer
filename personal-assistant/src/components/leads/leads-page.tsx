'use client'

import { useState } from 'react'
import { Handshake } from 'lucide-react'
import { SkeletonKanban } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { useLeads } from '@/hooks/use-leads'
import { useLeadsAnalytics } from '@/hooks/use-leads-analytics'
import { PipelineAnalyticsBar } from './pipeline-analytics-bar'
import { LeadsToolbar } from './leads-toolbar'
import { LeadsKanbanView } from './leads-kanban-view'
import { LeadsListView } from './leads-list-view'
import { LeadDetailDrawer } from './lead-detail-drawer'
import { ProspectDiscoveryPanel } from './prospect-discovery-panel'

export function LeadsPage() {
  const {
    leads,
    grouped,
    isLoading,
    error,
    selectedLead,
    setSelectedLeadId,
    viewMode,
    setViewMode,
    filters,
    setFilters,
    moveLead,
    updateLead,
    movingLeadId,
  } = useLeads()

  const { analytics, isLoading: analyticsLoading } = useLeadsAnalytics()
  const [discoveryOpen, setDiscoveryOpen] = useState(false)

  if (isLoading) {
    return <SkeletonKanban columns={4} />
  }

  if (error) {
    return (
      <div style={{
        padding: '12px 16px',
        borderRadius: 12,
        border: '1px solid rgba(239, 68, 68, 0.3)',
        background: 'rgba(239, 68, 68, 0.08)',
        fontSize: 13,
        color: 'var(--bb-red, #EF4444)',
      }}>
        {error}
      </div>
    )
  }

  if (leads.length === 0 && filters.smartView === 'all' && !filters.score && !filters.source) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <EmptyState
          icon={<Handshake size={40} />}
          title="No leads yet"
          description="Leads will appear here as they come in from your channels, or discover prospects with the PCC."
        />
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={() => setDiscoveryOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 24px',
              borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, var(--bb-cyan, #06B6D4) 0%, var(--bb-blue, #3B82F6) 100%)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Discover Prospects
          </button>
        </div>
        <ProspectDiscoveryPanel open={discoveryOpen} onClose={() => setDiscoveryOpen(false)} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
      {/* Analytics Bar */}
      <PipelineAnalyticsBar analytics={analytics} isLoading={analyticsLoading} />

      {/* Toolbar */}
      <LeadsToolbar
        filters={filters}
        onFiltersChange={setFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        onDiscoverClick={() => setDiscoveryOpen(true)}
      />

      {/* Main View */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {viewMode === 'kanban' ? (
          <LeadsKanbanView
            grouped={grouped}
            onMoveLead={moveLead}
            onSelectLead={(lead) => setSelectedLeadId(lead.id)}
            movingLeadId={movingLeadId}
          />
        ) : (
          <LeadsListView
            leads={leads}
            onSelectLead={(lead) => setSelectedLeadId(lead.id)}
          />
        )}
      </div>

      {/* Detail Drawer */}
      <LeadDetailDrawer
        lead={selectedLead}
        open={!!selectedLead}
        onClose={() => setSelectedLeadId(null)}
        onUpdate={updateLead}
      />

      {/* Discovery Panel */}
      <ProspectDiscoveryPanel open={discoveryOpen} onClose={() => setDiscoveryOpen(false)} />
    </div>
  )
}
