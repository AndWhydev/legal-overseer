'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  IconUser,
  IconBriefcase,
  IconFileText,
  IconSquareCheck,
  IconCurrencyDollar,
  IconArrowUpRight,
} from '@tabler/icons-react';
import { motion, type Transition } from 'motion/react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty';

// Types

type EntityType = 'contact' | 'project' | 'invoice' | 'task';

interface EntityDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  entityType: EntityType;
  entityId: string;
}

interface TimelineEvent {
  id: string;
  eventType: string;
  eventData: Record<string, unknown>;
  occurredAt: string;
  channelSource: string | null;
}

interface GraphNode {
  id: string;
  type: EntityType;
  label: string;
  metadata: Record<string, unknown>;
}

interface GraphEdge {
  source: string;
  target: string;
  relationshipType: string;
}

// Helpers

const TYPE_ICON: Record<EntityType, React.ElementType> = {
  contact: IconUser,
  project: IconBriefcase,
  invoice: IconFileText,
  task: IconSquareCheck,
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatEventType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Detail Sections

function ProjectDetail({ meta }: { meta: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project</h3>
      {meta.name ? <div className="text-lg font-medium">{String(meta.name)}</div> : null}
      {meta.status ? (
        <Badge variant="secondary" className="capitalize">
          {String(meta.status)}
        </Badge>
      ) : null}
      {meta.description ? <p className="text-sm text-muted-foreground">{String(meta.description)}</p> : null}
    </div>
  );
}

function InvoiceDetail({ meta }: { meta: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoice</h3>
      {meta.invoice_number ? <div className="text-lg font-medium">{String(meta.invoice_number)}</div> : null}
      <div className="flex items-center gap-3">
        {meta.status ? (
          <Badge variant="secondary" className="capitalize">
            {String(meta.status)}
          </Badge>
        ) : null}
        {meta.amount != null ? (
          <div className="flex items-center gap-1 text-sm">
            <IconCurrencyDollar className="size-3.5 text-muted-foreground" />
            <span>{Number(meta.amount).toLocaleString('en-AU', { minimumFractionDigits: 2 })}</span>
          </div>
        ) : null}
      </div>
      {meta.due_date ? (
        <div className="text-sm text-muted-foreground">Due: {formatDate(String(meta.due_date))}</div>
      ) : null}
    </div>
  );
}

function TaskDetail({ meta }: { meta: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Task</h3>
      {meta.title ? <div className="text-lg font-medium">{String(meta.title)}</div> : null}
      <div className="flex items-center gap-3">
        {meta.status ? (
          <Badge variant="secondary" className="capitalize">
            {String(meta.status)}
          </Badge>
        ) : null}
        {meta.priority ? (
          <span className="text-xs text-muted-foreground capitalize">{String(meta.priority)} priority</span>
        ) : null}
      </div>
    </div>
  );
}

// Related Entities Stack (notification-list pattern)

const stackTransition: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 26,
};

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
});

function RelatedEntitiesStack({
  related,
  typeIcon,
}: {
  related: { node: GraphNode; edge: GraphEdge }[];
  typeIcon: Record<EntityType, React.ElementType>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Related ({related.length})
      </h3>
      <motion.div
        className="rounded-xl bg-muted/30 p-3 space-y-0"
        initial="collapsed"
        whileHover="expanded"
      >
        <div>
          {related.map(({ node, edge }, i) => {
            const RelIcon = typeIcon[node.type] ?? IconBriefcase;
            return (
              <motion.div
                key={`${node.type}-${node.id}`}
                className="relative rounded-xl border border-border bg-card px-4 py-3 shadow-sm hover:shadow-md transition-shadow"
                variants={getStackVariants(i)}
                transition={stackTransition}
                style={{ zIndex: related.length - i }}
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-muted text-foreground shrink-0">
                    <RelIcon className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground truncate">
                      {node.label}
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {edge?.relationshipType?.replace(/_/g, ' ') ?? node.type}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-2 flex items-center gap-2 pt-1">
          <div className="flex size-5 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {related.length}
          </div>
          <span className="grid">
            <motion.span
              className="text-xs font-medium text-muted-foreground row-start-1 col-start-1"
              variants={{
                collapsed: { opacity: 1, y: 0 },
                expanded: { opacity: 0, y: -12 },
              }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
            >
              Related entities
            </motion.span>
            <motion.span
              className="text-xs font-medium text-muted-foreground flex items-center gap-1 cursor-pointer select-none row-start-1 col-start-1"
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
  );
}

// Main Drawer

function EntityDetailDrawer({ open, onClose, entityType, entityId }: EntityDetailDrawerProps) {
  const [entity, setEntity] = useState<GraphNode | null>(null);
  const [related, setRelated] = useState<{ node: GraphNode; edge: GraphEdge }[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchData = useCallback(async () => {
    if (!entityId || !entityType) return;
    setLoading(true);

    try {
      const [graphRes, timelineRes] = await Promise.all([
        fetch(`/api/knowledge/graph?entity_type=${entityType}&entity_id=${entityId}`).then((r) => r.json()),
        fetch(`/api/activity?entity_type=${entityType}&entity_id=${entityId}`).then((r) => r.json()).catch(() => ({ events: [] })),
      ]);

      const graph = graphRes.graph;
      if (graph?.nodes?.length > 0) {
        setEntity(graph.nodes[0]);
        setRelated(
          graph.nodes.slice(1).map((node: GraphNode) => ({
            node,
            edge: graph.edges.find((e: GraphEdge) => e.target === node.id || e.source === node.id),
          }))
        );
      }

      setTimeline((timelineRes.events ?? []).slice(0, 20));
    } catch {
      setEntity(null);
      setRelated([]);
    } finally {
      setLoading(false);
      setHasFetched(true);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setHasFetched(false);
      setEntity(null);
      fetchData();
    }
  }, [open, fetchData]);

  const Icon = TYPE_ICON[entityType] ?? IconBriefcase;
  const isContact = entityType === 'contact';
  const contactName = entity?.metadata?.name ? String(entity.metadata.name) : null;
  const contactType = entity?.metadata?.type ? String(entity.metadata.type) : null;
  const avatarUrl = entity?.metadata?.avatar_url as string | undefined;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col gap-0 p-0" showCloseButton>
        {/* Header */}
        <SheetHeader className="p-5 pb-4 border-b border-border">
          {loading ? (
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {isContact && entity ? (
                <Avatar size="lg">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={contactName || 'Contact'} />}
                  <AvatarFallback>{getInitials(contactName || 'U')}</AvatarFallback>
                </Avatar>
              ) : (
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                  <Icon className="size-5" />
                </div>
              )}
              <div className="min-w-0">
                <SheetTitle className="truncate">
                  {isContact && contactName ? contactName : `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} Details`}
                </SheetTitle>
                {isContact && contactType && (
                  <SheetDescription className="capitalize">{contactType}</SheetDescription>
                )}
              </div>
            </div>
          )}
        </SheetHeader>

        {/* Scrollable content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 flex flex-col gap-5">
          {loading ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : (
            <>
              {/* Entity-specific detail (contacts show name/type in header) */}
              {entity && !isContact && (
                <>
                  {entityType === 'project' && <ProjectDetail meta={entity.metadata} />}
                  {entityType === 'invoice' && <InvoiceDetail meta={entity.metadata} />}
                  {entityType === 'task' && <TaskDetail meta={entity.metadata} />}
                </>
              )}

              {/* Related Entities (notification-list style) */}
              {related.length > 0 && (
                <RelatedEntitiesStack
                  related={related}
                  typeIcon={TYPE_ICON}
                />
              )}

              {/* Timeline */}
              {timeline.length > 0 && (
                <div className="flex flex-col gap-3">
                  <Separator />
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Timeline
                  </h3>
                  {timeline.map((event) => (
                    <div
                      key={event.id}
                      className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3"
                    >
                      <div className="mt-1.5 size-1.5 rounded-full bg-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-foreground">
                          {formatEventType(event.eventType)}
                        </div>
                        <div className="text-xs text-muted-foreground">
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
                      <Icon className="size-4" />
                    </EmptyMedia>
                    <EmptyTitle>Entity not found</EmptyTitle>
                    <EmptyDescription>
                      The requested {entityType} could not be loaded.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default React.memo(EntityDetailDrawer);
export { EntityDetailDrawer };
