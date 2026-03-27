'use client'

import React, { useEffect, useState } from 'react'
import { IconBriefcase } from '@tabler/icons-react'
import { TabShell } from '@/components/ui/tab-shell'
import { EmptyState } from '@/components/ui/empty-state'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/skeleton'

interface Job {
  id: string
  title: string
  job_type: string | null
  status: string
  address: string | null
  scheduled_at: string | null
  value: number | null
  contact: { name: string } | null
}

const STATUS_COLUMNS = ['quoted', 'booked', 'in-progress', 'complete', 'invoiced'] as const

function statusLabel(s: string): string {
  switch (s) {
    case 'quoted': return 'Quoted'
    case 'booked': return 'Booked'
    case 'in-progress': return 'In Progress'
    case 'complete': return 'Complete'
    case 'invoiced': return 'Invoiced'
    default: return s
  }
}

function statusColor(s: string): React.CSSProperties {
  switch (s) {
    case 'quoted': return { background: 'rgba(100,116,139,0.15)', color: 'rgb(203,213,225)' }
    case 'booked': return { background: 'rgba(59,130,246,0.15)', color: 'rgb(147,197,253)' }
    case 'in-progress': return { background: 'rgba(245,158,11,0.15)', color: 'rgb(252,211,77)' }
    case 'complete': return { background: 'rgba(16,185,129,0.15)', color: 'rgb(110,231,183)' }
    case 'invoiced': return { background: 'rgba(168,85,247,0.15)', color: 'rgb(216,180,254)' }
    default: return { background: 'var(--glass-interactive-bg)', color: 'var(--text-secondary)' }
  }
}

function JobCard({ job }: { job: Job }) {
  return (
    <div className="rounded-lg p-3 bb-card-hover" style={{ border: '1px solid var(--glass-card-border)', background: 'var(--glass-card-bg)' }}>
      <p className="font-medium text-sm truncate">{job.title}</p>
      {job.contact?.name && (
        <p className="text-xs text-muted-foreground mt-1">{job.contact.name}</p>
      )}
      {job.job_type && (
        <p className="text-xs text-muted-foreground">{job.job_type}</p>
      )}
      {job.address && (
        <p className="text-xs text-muted-foreground truncate">{job.address}</p>
      )}
      <div className="flex items-center justify-between mt-2">
        {job.scheduled_at && (
          <span className="text-xs text-muted-foreground">
            {new Date(job.scheduled_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
          </span>
        )}
        {job.value != null && (
          <span className="text-xs font-medium">
            ${Number(job.value).toLocaleString('en-AU')}
          </span>
        )}
      </div>
    </div>
  )
}

function JobsTab() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return
    supabase
      .from('jobs')
      .select('id, title, job_type, status, address, scheduled_at, value, contact:contacts(name)')
      .order('scheduled_at', { ascending: true, nullsFirst: false })
      .then(({ data }: { data: unknown }) => {
        setJobs((data as unknown as Job[]) ?? [])
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <TabShell>
        <div className="grid grid-cols-5 gap-4 mt-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      </TabShell>
    )
  }

  if (jobs.length === 0) {
    return (
      <TabShell>
        <EmptyState
          icon={<IconBriefcase size={24} />}
          title="No active jobs"
          description="Jobs track ongoing work for your clients. They appear here as BitBit identifies active projects from your communications."
          action={{
            label: 'Connect email to start',
            onClick: () => window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'settings-connections' } })),
          }}
        />
      </TabShell>
    )
  }

  return (
    <TabShell>
      <div className="grid grid-cols-5 gap-4 mt-4 min-h-[400px]">
        {STATUS_COLUMNS.map((status) => {
          const col = jobs.filter((j) => j.status === status)
          return (
            <div key={status}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={statusColor(status)}>
                  {statusLabel(status)}
                </span>
                <span className="text-xs text-muted-foreground">{col.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {col.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </TabShell>
  )
}

export default React.memo(JobsTab)
