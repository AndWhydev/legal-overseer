'use client'

import React, { useEffect, useState } from 'react'
import { IconBriefcase } from '@tabler/icons-react'
import { TabShell } from '@/components/ui/tab-shell'
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from '@/components/ui/empty'
import { createClient } from '@/lib/supabase/client'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

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

function statusBadgeClass(s: string): string {
  switch (s) {
    case 'quoted': return 'bg-slate-500/15 text-slate-300 border-transparent hover:bg-slate-500/20'
    case 'booked': return 'bg-blue-500/15 text-blue-300 border-transparent hover:bg-blue-500/20'
    case 'in-progress': return 'bg-amber-500/15 text-amber-300 border-transparent hover:bg-amber-500/20'
    case 'complete': return 'bg-emerald-500/15 text-emerald-300 border-transparent hover:bg-emerald-500/20'
    case 'invoiced': return 'bg-purple-500/15 text-purple-300 border-transparent hover:bg-purple-500/20'
    default: return 'bg-muted text-muted-foreground border-transparent'
  }
}

function JobCard({ job }: { job: Job }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 hover:bg-muted/50 transition-colors">
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
        <Empty>
          <EmptyMedia><IconBriefcase size={24} /></EmptyMedia>
          <EmptyTitle>No active jobs</EmptyTitle>
          <EmptyDescription>Jobs track ongoing work for your clients. They appear here as BitBit identifies active projects from your communications.</EmptyDescription>
          <EmptyContent>
            <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('bb-navigate', { detail: { tab: 'settings-connections' } }))} className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity">Connect email to start</button>
          </EmptyContent>
        </Empty>
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
                <Badge className={`text-xs px-2 py-0.5 ${statusBadgeClass(status)}`}>
                  {statusLabel(status)}
                </Badge>
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
