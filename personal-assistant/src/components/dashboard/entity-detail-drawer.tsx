'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { X, User, Briefcase, FileText, CheckSquare, DollarSign } from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────

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

// ─── Helpers ───────────────────────────────────────────────────────────────

const TYPE_ICON: Record<EntityType, React.ElementType> = {
  contact: User,
  project: Briefcase,
  invoice: FileText,
  task: CheckSquare,
};

const TYPE_COLOR: Record<EntityType, string> = {
  contact: '#60a5fa',
  project: '#34d399',
  invoice: '#f59e0b',
  task: '#a78bfa',
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

// ─── Detail Sections ───────────────────────────────────────────────────────

function ContactAvatar({ meta, size = 40 }: { meta: Record<string, unknown>; size?: number }) {
  const avatarUrl = meta.avatar_url as string | undefined;
  const name = String(meta.name ?? 'U');
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.35,
        fontWeight: 600,
        flexShrink: 0,
        background: 'rgba(96, 165, 250, 0.15)',
        color: '#60a5fa',
      }}
    >
      {initials}
    </div>
  );
}

function ProjectDetail({ meta }: { meta: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Project</h3>
      {meta.name ? <div className="text-lg font-medium">{String(meta.name)}</div> : null}
      {meta.status ? (
        <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-[var(--bg-elevated)] capitalize">
          {String(meta.status)}
        </span>
      ) : null}
      {meta.description ? <p className="text-sm text-muted-foreground">{String(meta.description)}</p> : null}
    </div>
  );
}

function InvoiceDetail({ meta }: { meta: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Invoice</h3>
      {meta.invoice_number ? <div className="text-lg font-medium">{String(meta.invoice_number)}</div> : null}
      <div className="flex items-center gap-4">
        {meta.status ? (
          <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-[var(--bg-elevated)] capitalize">
            {String(meta.status)}
          </span>
        ) : null}
        {meta.amount != null ? (
          <div className="flex items-center gap-1 text-sm">
            <DollarSign size={14} className="text-muted-foreground" />
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
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Task</h3>
      {meta.title ? <div className="text-lg font-medium">{String(meta.title)}</div> : null}
      <div className="flex items-center gap-3">
        {meta.status ? (
          <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-[var(--bg-elevated)] capitalize">
            {String(meta.status)}
          </span>
        ) : null}
        {meta.priority ? (
          <span className="text-xs text-muted-foreground capitalize">{String(meta.priority)} priority</span>
        ) : null}
      </div>
    </div>
  );
}

// ─── Main Drawer ───────────────────────────────────────────────────────────

function EntityDetailDrawer({ open, onClose, entityType, entityId }: EntityDetailDrawerProps) {
  const [entity, setEntity] = useState<GraphNode | null>(null);
  const [related, setRelated] = useState<{ node: GraphNode; edge: GraphEdge }[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!entityId || !entityType) return;
    setLoading(true);

    try {
      // Fetch graph + timeline in parallel
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
    }
  }, [entityType, entityId]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const Icon = TYPE_ICON[entityType] ?? Briefcase;
  const isContact = entityType === 'contact';
  const contactName = entity?.metadata?.name ? String(entity.metadata.name) : null;
  const contactType = entity?.metadata?.type ? String(entity.metadata.type) : null;

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
            background: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            transition: 'opacity 200ms ease-out',
            opacity: open ? 1 : 0,
          }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 50,
          display: open ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={isContact && contactName ? `${contactName} details` : 'Entity details'}
      >
        <div
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 560,
            maxHeight: '80vh',
            borderRadius: 20,
            background: 'rgba(15, 20, 30, 0.8)',
            backdropFilter: 'blur(20px) saturate(1.2)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
            border: '1px solid rgba(255, 255, 255, 0.03)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            display: 'flex',
            flexDirection: 'column' as const,
            animation: open ? 'modalEnter 200ms ease-out' : 'modalExit 200ms ease-out',
          }}
        >
          {/* Header */}
          <div style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
            background: 'rgba(15, 20, 30, 0.8)',
            padding: '16px 20px',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
              {isContact && entity ? (
                <ContactAvatar meta={entity.metadata} size={36} />
              ) : (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: `${TYPE_COLOR[entityType]}20`,
                    color: TYPE_COLOR[entityType],
                  }}
                >
                  <Icon size={20} />
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <span style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {isContact && contactName ? contactName : `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} Details`}
                </span>
                {isContact && contactType && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: TYPE_COLOR[entityType],
                    textTransform: 'capitalize',
                  }}>
                    {contactType}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                padding: '8px',
                borderRadius: 10,
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.03)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 200ms',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div style={{
            flex: 1,
            overflowY: 'auto' as const,
            padding: '16px 20px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}>
            {loading ? (
              <div style={{ animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }}>
                <div style={{
                  height: 24,
                  width: 192,
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.06)',
                  marginBottom: '16px',
                }} />
                <div style={{
                  height: 16,
                  width: 128,
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.06)',
                  marginBottom: '16px',
                }} />
                <div style={{
                  height: 16,
                  width: 256,
                  borderRadius: 8,
                  background: 'rgba(255, 255, 255, 0.06)',
                }} />
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

                {/* Related Entities */}
                {related.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h3 style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--text-dim)',
                      marginBottom: 0,
                    }}>
                      Related ({related.length})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {related.map(({ node, edge }) => {
                        const RelIcon = TYPE_ICON[node.type] ?? Briefcase;
                        return (
                          <div
                            key={`${node.type}-${node.id}`}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              borderRadius: 12,
                              padding: '12px 16px',
                              background: 'rgba(20, 28, 40, 0.5)',
                              backdropFilter: 'blur(12px)',
                              WebkitBackdropFilter: 'blur(12px)',
                              border: '1px solid rgba(255, 255, 255, 0.03)',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                backgroundColor: `${TYPE_COLOR[node.type] ?? '#888'}20`,
                                color: TYPE_COLOR[node.type] ?? '#888',
                                flexShrink: 0,
                              }}
                            >
                              <RelIcon size={16} />
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{
                                fontSize: 14,
                                fontWeight: 500,
                                color: 'var(--text-primary)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}>
                                {node.label}
                              </div>
                              <div style={{
                                fontSize: 12,
                                color: 'var(--text-secondary)',
                                textTransform: 'capitalize',
                              }}>
                                {edge?.relationshipType?.replace(/_/g, ' ') ?? node.type}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Timeline */}
                {timeline.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h3 style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--text-dim)',
                      marginBottom: 0,
                    }}>
                      Timeline
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {timeline.map((event) => (
                        <div
                          key={event.id}
                          style={{
                            display: 'flex',
                            gap: '12px',
                            borderRadius: 12,
                            padding: '12px 16px',
                            background: 'rgba(20, 28, 40, 0.5)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            border: '1px solid rgba(255, 255, 255, 0.03)',
                          }}
                        >
                          <div style={{
                            marginTop: 4,
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--bb-cyan)',
                            flexShrink: 0,
                          }} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{
                              fontSize: 14,
                              color: 'var(--text-primary)',
                            }}>
                              {formatEventType(event.eventType)}
                            </div>
                            <div style={{
                              fontSize: 12,
                              color: 'var(--text-secondary)',
                            }}>
                              {formatDate(event.occurredAt)}
                              {event.channelSource && ` via ${event.channelSource}`}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!entity && !loading && (
                  <p style={{
                    fontSize: 14,
                    color: 'var(--text-secondary)',
                    textAlign: 'center',
                    padding: '32px 0',
                  }}>
                    Entity not found.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modalEnter {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes modalExit {
          from {
            opacity: 1;
            transform: scale(1);
          }
          to {
            opacity: 0;
            transform: scale(0.95);
          }
        }
      `}</style>
    </>
  );
}

export default React.memo(EntityDetailDrawer);
export { EntityDetailDrawer };
