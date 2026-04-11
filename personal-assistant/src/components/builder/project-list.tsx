'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { WebsiteProject, WebsiteStatus } from '@/lib/builder/types'
import { ProjectCard } from './project-card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty'
import { IconWorld } from '@tabler/icons-react'

// ---------------------------------------------------------------------------
// Status filter values
// ---------------------------------------------------------------------------

type FilterTab = 'all' | 'draft' | 'preview' | 'deployed'

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'preview', label: 'Preview' },
  { value: 'deployed', label: 'Deployed' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectList() {
  const router = useRouter()
  const [projects, setProjects] = useState<WebsiteProject[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')

  // ---- Fetch projects ----
  useEffect(() => {
    const supabase = createClient()
    if (!supabase) {
      setLoading(false)
      return
    }

    supabase
      .from('website_projects')
      .select('*')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (data) setProjects(data as WebsiteProject[])
        setLoading(false)
      })
  }, [])

  // ---- Filtered list ----
  const filtered = useMemo(() => {
    if (filter === 'all') return projects
    return projects.filter((p) => p.status === (filter as WebsiteStatus))
  }, [projects, filter])

  // ---- Handlers ----
  function handlePreview(id: string) {
    const project = projects.find((p) => p.id === id)
    if (project?.preview_url) {
      window.open(project.preview_url, '_blank')
    } else {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
      window.open(`${appUrl}/api/builder/preview/${id}`, '_blank')
    }
  }

  function handleDeploy(id: string) {
    const project = projects.find((p) => p.id === id)
    const name = project?.name ?? 'this website'
    router.push(`/dashboard/chat?message=${encodeURIComponent(`deploy website ${name}`)}`)
  }

  // ---- Loading ----
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-64 animate-pulse rounded-xl bg-muted"
          />
        ))}
      </div>
    )
  }

  return (
    <Tabs
      value={filter}
      onValueChange={(v) => setFilter(v as FilterTab)}
    >
      <TabsList>
        {FILTER_TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {FILTER_TABS.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {filtered.length === 0 ? (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconWorld className="size-4" />
                </EmptyMedia>
                <EmptyTitle>No websites yet</EmptyTitle>
                <EmptyDescription>
                  Chat with BitBit to generate your first website.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onPreview={handlePreview}
                  onDeploy={handleDeploy}
                />
              ))}
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  )
}
