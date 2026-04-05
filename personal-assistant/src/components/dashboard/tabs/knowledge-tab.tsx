'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { IconSearch, IconUser, IconBriefcase, IconFileText, IconSquareCheck, IconChevronRight, IconX, IconBook } from '@tabler/icons-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import type { GraphNode as ViewerNode, GraphEdge as ViewerEdge } from '@/components/knowledge/graph-viewer';

const GraphViewer = dynamic(() => import('@/components/knowledge/graph-viewer'), { ssr: false });

// ─── Types ─────────────────────────────────────────────────────────────────

type EntityType = 'contact' | 'project' | 'invoice' | 'task';

interface SearchResult {
  id: string;
  type: EntityType;
  label: string;
  snippet: string;
  metadata: Record<string, unknown>;
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
  strength: number;
  lastEvidenceAt: string;
}

interface EntityGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ─── Icon Map ──────────────────────────────────────────────────────────────

const TYPE_ICON: Record<EntityType, React.ElementType> = {
  contact: IconUser,
  project: IconBriefcase,
  invoice: IconFileText,
  task: IconSquareCheck,
};

const TYPE_BADGE_VARIANT: Record<EntityType, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  contact: 'default',
  project: 'secondary',
  invoice: 'outline',
  task: 'default',
};

// ─── Component ─────────────────────────────────────────────────────────────

function KnowledgeTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<{ type: EntityType; id: string } | null>(null);
  const [graph, setGraph] = useState<EntityGraph | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  // Entity Graph
  const [graphNodes, setGraphNodes] = useState<ViewerNode[]>([]);
  const [graphEdges, setGraphEdges] = useState<ViewerEdge[]>([]);
  const [graphLoading, setGraphLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/knowledge/graph?format=nodes');
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) {
          setGraphNodes(data.nodes ?? []);
          setGraphEdges(data.edges ?? []);
        }
      } catch {
        // non-critical
      } finally {
        if (!cancelled) setGraphLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleGraphNodeClick = useCallback((node: ViewerNode) => {
    const [type, ...rest] = node.id.split(':');
    const id = rest.join(':');
    const entityType = type === 'person' ? 'contact' : type as EntityType;
    if (!id) return;
    setSelectedEntity({ type: entityType, id });
    setLoadingGraph(true);
    fetch(`/api/knowledge/graph?entity_type=${entityType}&entity_id=${id}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setGraph(data.graph ?? null))
      .catch(() => setGraph(null))
      .finally(() => setLoadingGraph(false));
  }, []);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!value.trim()) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/knowledge/graph?search=${encodeURIComponent(value)}`);
        const data = await res.json();
        setResults(data.results ?? []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  const selectEntity = useCallback(async (type: EntityType, id: string) => {
    setSelectedEntity({ type, id });
    setLoadingGraph(true);
    try {
      const res = await fetch(`/api/knowledge/graph?entity_type=${type}&entity_id=${id}`);
      const data = await res.json();
      setGraph(data.graph ?? null);
    } catch {
      setGraph(null);
    } finally {
      setLoadingGraph(false);
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedEntity(null);
    setGraph(null);
  }, []);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Entity Graph */}
      <Card>
        <CardHeader>
          <CardTitle>Entity Graph</CardTitle>
        </CardHeader>
        <CardContent>
          {graphLoading ? (
            <Skeleton className="h-[420px] w-full rounded-lg" />
          ) : graphNodes.length > 0 ? (
            <GraphViewer
              nodes={graphNodes}
              edges={graphEdges}
              onNodeClick={handleGraphNodeClick}
              height={420}
            />
          ) : (
            <Empty className="h-48">
              <EmptyHeader>
                <EmptyMedia variant="icon"><IconBook /></EmptyMedia>
                <EmptyDescription>No entities yet. Add contacts and relationships to build the knowledge graph.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      {/* Search Bar */}
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search contacts, projects, invoices, tasks..."
          className="pl-9"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground border-t-foreground" />
          </div>
        )}
      </div>

      {/* Selected Entity Graph */}
      {selectedEntity && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Relationship Graph</CardTitle>
              <Button variant="ghost" size="icon-sm" onClick={clearSelection} aria-label="Close graph">
                <IconX className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingGraph ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : graph ? (
              <div className="flex flex-col gap-4">
                {/* Root Entity */}
                {graph.nodes.length > 0 && (() => {
                  const root = graph.nodes[0];
                  const Icon = TYPE_ICON[root.type] ?? IconBriefcase;
                  return (
                    <div className="flex items-center gap-3 rounded-lg border bg-muted p-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="size-5 text-primary" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{root.label}</div>
                        <div className="text-sm capitalize text-muted-foreground">{root.type}</div>
                      </div>
                    </div>
                  );
                })()}

                {/* Connected Entities */}
                {graph.nodes.length > 1 && (
                  <div>
                    <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">Connected Entities</h3>
                    <div className="flex flex-wrap gap-2">
                      {graph.nodes.slice(1).map((node) => {
                        const Icon = TYPE_ICON[node.type] ?? IconBriefcase;
                        return (
                          <Button
                            key={`${node.type}-${node.id}`}
                            variant="outline"
                            size="sm"
                            onClick={() => selectEntity(node.type, node.id)}
                            className="gap-2"
                          >
                            <Icon className="size-3.5" />
                            {node.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Relationships List */}
                {graph.edges.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-muted-foreground">Relationships</h3>
                    <div className="flex flex-col gap-2">
                      {graph.edges.map((edge, idx) => {
                        const sourceNode = graph.nodes.find((n) => n.id === edge.source);
                        const targetNode = graph.nodes.find((n) => n.id === edge.target);
                        return (
                          <div key={idx} className="flex items-center justify-between rounded-lg border bg-card p-3 transition-colors hover:bg-muted">
                            <div>
                              <div className="text-sm font-medium">{sourceNode?.label ?? edge.source}</div>
                              <div className="text-sm capitalize text-muted-foreground">
                                {edge.relationshipType?.replace(/_/g, ' ') ?? 'Related'} (strength: {(edge.strength * 100).toFixed(0)}%)
                              </div>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              &rarr; {targetNode?.label ?? edge.target}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {graph.nodes.length <= 1 && graph.edges.length === 0 && (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><IconChevronRight /></EmptyMedia>
                      <EmptyDescription>No connected entities found.</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            ) : (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><IconFileText /></EmptyMedia>
                  <EmptyDescription>Could not load graph data.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {!selectedEntity && results.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">Search Results</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((result) => {
              const Icon = TYPE_ICON[result.type] ?? IconBriefcase;
              return (
                <Card
                  key={`${result.type}-${result.id}`}
                  className="cursor-pointer transition-colors hover:bg-muted"
                  onClick={() => selectEntity(result.type, result.id)}
                >
                  <CardContent className="flex items-start gap-3 py-4">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{result.label}</div>
                      <Badge variant={TYPE_BADGE_VARIANT[result.type]} className="mt-1">{result.type}</Badge>
                      {result.snippet && (
                        <p className="mt-2 truncate text-sm text-muted-foreground">{result.snippet}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty States */}
      {!selectedEntity && !searching && query && results.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No results for &quot;{query}&quot;</EmptyTitle>
            <EmptyDescription>Try searching for contacts, projects, invoices, or tasks.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!selectedEntity && !query && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><IconSearch /></EmptyMedia>
            <EmptyTitle>Search the knowledge base</EmptyTitle>
            <EmptyDescription>Find contacts, projects, invoices, and tasks to see how they connect across the organisation.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

export default React.memo(KnowledgeTab);
