'use client'

import React, { useEffect, useState, useCallback, memo } from 'react'
import {
  IconUser,
  IconBriefcase,
  IconFileText,
  IconSquareCheck,
  IconMail,
  IconPhone,
  IconLayoutSidebarRight,
  IconArrowUpRight,
} from '@tabler/icons-react'
import { motion, type Transition } from 'motion/react'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from '@/components/ui/empty'

// Types

type EntityType = 'contact' | 'project' | 'invoice' | 'task'

interface ContactDetailPanelProps {
  entityId: string
  onClose: () => void
}

interface TimelineEvent {
  id: string
  eventType: string
  eventData: Record<string, unknown>
  occurredAt: string
  channelSource: string | null
}

interface GraphNode {
  id: string
  type: EntityType
  label: string
  metadata: Record<string, unknown>
}

interface GraphEdge {
  source: string
  target: string
  relationshipType: string
}

// Helpers

const TYPE_ICON: Record<EntityType, React.ElementType> = {
  contact: IconUser,
  project: IconBriefcase,
  invoice: IconFileText,
  task: IconSquareCheck,
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

function formatEventType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// Related Entities Stack

const stackTransition: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 26,
}

const getStackVariants = (i: number) => ({
  collapsed: {
    marginTop: i === 0 ? 0 : -36,
    scaleX: 1 - i * 0.03,
    opacity: i > 2 ? 0 : 1,
  },
  expanded: {
    marginTop: i === 0 ? 0 : 8,
    scaleX: 1,
    opacity: 1,
  },
})

function RelatedEntitiesStack({
  related,
}: {
  related: { node: GraphNode; edge: GraphEdge }[]
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
        Related ({related.length})
      </h3>
      <motion.div
        className="rounded-[var(--radius-md)] bg-muted/30 p-3 space-y-0"
        initial="collapsed"
        whileHover="expanded"
      >
        <div>
          {related.map(({ node, edge }, i) => {
            const RelIcon = TYPE_ICON[node.type] ?? IconBriefcase
            return (
              <motion.div
                key={`${node.type}-${node.id}`}
                className="relative rounded-[var(--radius-md)] border border-border bg-card px-4 py-3 shadow-sm hover:shadow-md transition-shadow"
                variants={getStackVariants(i)}
                transition={stackTransition}
                style={{ zIndex: related.length - i }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-[var(--radius-md)] bg-muted text-foreground shrink-0">
                    <RelIcon className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-medium text-foreground truncate">
                      {node.label}
                    </div>
                    <div className="text-[12px] text-muted-foreground capitalize">
                      {edge?.relationshipType?.replace(/_/g, ' ') ?? node.type}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        <div className="mt-2 flex items-center gap-2 pt-1">
          <div className="flex size-5 items-center justify-center rounded-full bg-muted text-[12px] font-medium text-muted-foreground">
            {related.length}
          </div>
          <span className="grid">
            <motion.span
              className="text-[12px] font-medium text-muted-foreground row-start-1 col-start-1"
              variants={{
                collapsed: { opacity: 1, y: 0 },
                expanded: { opacity: 0, y: -12 },
              }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
            >
              Related entities
            </motion.span>
            <motion.span
              className="text-[12px] font-medium text-muted-foreground flex items-center gap-1 cursor-pointer select-none row-start-1 col-start-1"
              variants={{
                collapsed: { opacity: 0, y: 12 },
                expanded: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
            >
              View all <IconArrowUpRight className="size-3" />
            </motion.span>
          </span>
        </div>
      </motion.div>
    </div>
  )
}

// Main Panel

function ContactDetailPanelInner({ entityId, onClose }: ContactDetailPanelProps) {
  const [entity, setEntity] = useState<GraphNode | null>(null)
  const [related, setRelated] = useState<{ node: GraphNode; edge: GraphEdge }[]>([])
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [hasFetched, setHasFetched] = useState(false)

  const fetchData = useCallback(async () => {
    if (!entityId) return
    setLoading(true)

    try {
      const [graphRes, timelineRes] = await Promise.all([
        fetch(`/api/knowledge/graph?entity_type=contact&entity_id=${entityId}`).then((r) => r.json()),
        fetch(`/api/activity?entity_type=contact&entity_id=${entityId}`).then((r) => r.json()).catch(() => ({ events: [] })),
      ])

      const graph = graphRes.graph
      if (graph?.nodes?.length > 0) {
        setEntity(graph.nodes[0])
        setRelated(
          graph.nodes.slice(1).map((node: GraphNode) => ({
            node,
            edge: graph.edges.find((e: GraphEdge) => e.target === node.id || e.source === node.id),
          }))
        )
      }

      setTimeline((timelineRes.events ?? []).slice(0, 20))
    } catch {
      setEntity(null)
      setRelated([])
    } finally {
      setLoading(false)
      setHasFetched(true)
    }
  }, [entityId])

  useEffect(() => {
    setLoading(true)
    setHasFetched(false)
    setEntity(null)
    fetchData()
  }, [fetchData])

  const contactName = entity?.metadata?.name ? String(entity.metadata.name) : null
  const contactType = entity?.metadata?.type ? String(entity.metadata.type) : null
  const contactEmail = entity?.metadata?.email ? String(entity.metadata.email) : null
  const contactPhone = entity?.metadata?.phone ? String(entity.metadata.phone) : null
  const avatarUrl = entity?.metadata?.avatar_url as string | undefined

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        {loading ? (
          <div className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 min-w-0">
            <Avatar size="lg">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={contactName || 'Contact'} />}
              <AvatarFallback>{getInitials(contactName || 'U')}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h2 className="text-base font-medium text-foreground truncate">
                {contactName ?? 'Contact Details'}
              </h2>
              {contactType && (
                <p className="text-[12px] text-muted-foreground capitalize">{contactType}</p>
              )}
            </div>
          </div>
        )}
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-muted-foreground hover:bg-secondary hover:text-foreground shrink-0">
          <IconLayoutSidebarRight size={16} />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-4 flex flex-col gap-5">
        {loading ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
        ) : (
          <>
            {/* Contact Info */}
            {entity && (contactEmail || contactPhone) && (
              <div className="flex flex-col gap-2">
                <h3 className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">Contact Info</h3>
                <div className="flex flex-col gap-1.5">
                  {contactEmail && (
                    <div className="flex items-center gap-2 text-base text-foreground">
                      <IconMail size={14} className="text-muted-foreground shrink-0" />
                      <span className="truncate">{contactEmail}</span>
                    </div>
                  )}
                  {contactPhone && (
                    <div className="flex items-center gap-2 text-base text-foreground">
                      <IconPhone size={14} className="text-muted-foreground shrink-0" />
                      <span>{contactPhone}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Related Entities (notification-list style) */}
            {related.length > 0 && (
              <RelatedEntitiesStack related={related} />
            )}

            {/* Timeline */}
            {timeline.length > 0 && (
              <div className="flex flex-col gap-3">
                <Separator />
                <h3 className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
                  Timeline
                </h3>
                {timeline.map((event) => (
                  <div
                    key={event.id}
                    className="flex gap-3 rounded-[var(--radius-md)] border border-border bg-muted/30 p-3"
                  >
                    <div className="mt-1.5 size-1.5 rounded-full bg-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-base text-foreground">
                        {formatEventType(event.eventType)}
                      </div>
                      <div className="text-[12px] text-muted-foreground">
                        {formatDate(event.occurredAt)}
                        {event.channelSource && ` via ${event.channelSource}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!entity && !loading && hasFetched && (
              <Empty className="py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconUser className="size-4" />
                  </EmptyMedia>
                  <EmptyTitle>Contact not found</EmptyTitle>
                  <EmptyDescription>
                    The requested contact could not be loaded.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export const ContactDetailPanel = memo(ContactDetailPanelInner)
