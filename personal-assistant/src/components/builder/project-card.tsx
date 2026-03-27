'use client'

import type { WebsiteProject, WebsiteStatus } from '@/lib/builder/types'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { IconExternalLink, IconUpload, IconWorld } from '@tabler/icons-react'

// ---------------------------------------------------------------------------
// Status -> Badge variant mapping
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<
  WebsiteStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  draft: { label: 'Draft', variant: 'secondary' },
  generating: { label: 'Generating', variant: 'secondary' },
  preview: { label: 'Preview', variant: 'default' },
  deployed: { label: 'Deployed', variant: 'outline' },
  archived: { label: 'Archived', variant: 'destructive' },
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProjectCardProps {
  project: WebsiteProject
  onPreview: (id: string) => void
  onDeploy: (id: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectCard({ project, onPreview, onDeploy }: ProjectCardProps) {
  const badge = STATUS_BADGE[project.status] ?? STATUS_BADGE.draft
  const hasContent = !!project.html_content
  const canDeploy =
    project.status === 'preview' && project.deploy_target !== null

  return (
    <Card>
      {/* Thumbnail preview */}
      <CardContent className="p-0">
        <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-muted">
          {hasContent ? (
            <iframe
              srcDoc={project.html_content!}
              title={`${project.name} preview`}
              sandbox="allow-scripts"
              className="pointer-events-none absolute left-0 top-0 h-[400%] w-[400%] origin-top-left scale-25 border-0"
              tabIndex={-1}
              aria-hidden
            />
          ) : (
            <Empty className="h-full border-0">
              <EmptyMedia variant="icon">
                <IconWorld className="size-4" />
              </EmptyMedia>
              <EmptyTitle>No preview</EmptyTitle>
            </Empty>
          )}
        </div>
      </CardContent>

      {/* Name & description */}
      <CardContent>
        <p className="text-sm font-medium truncate">{project.name}</p>
        {project.description && (
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            {project.description}
          </p>
        )}
      </CardContent>

      {/* Actions */}
      <CardFooter className="justify-between">
        <Badge variant={badge.variant}>{badge.label}</Badge>
        <div className="flex items-center gap-1">
          {hasContent && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onPreview(project.id)}
              title="Open preview"
            >
              <IconExternalLink className="size-4" />
            </Button>
          )}
          {canDeploy && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onDeploy(project.id)}
              title="Deploy to WordPress"
            >
              <IconUpload className="size-4" />
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  )
}
