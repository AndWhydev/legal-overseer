'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Search, User, Briefcase, FileText, CheckSquare, ChevronRight, X } from 'lucide-react';
import { TabSkeleton } from './tab-skeleton';

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

// ─── Component ─────────────────────────────────────────────────────────────

function KnowledgeTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<{ type: EntityType; id: string } | null>(null);
  const [graph, setGraph] = useState<EntityGraph | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>();

  // Search with debounce
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

  // Load graph for selected entity
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Search and explore entity relationships
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search contacts, projects, invoices, tasks..."
          className="w-full rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-primary)] py-3 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[var(--bb-cyan)]/40"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--bb-cyan)] border-t-transparent" />
          </div>
        )}
      </div>

      {/* Selected Entity Graph */}
      {selectedEntity && (
        <div className="bb-glass-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium">Relationship Graph</h2>
            <button
              onClick={clearSelection}
              className="p-1 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors"
              aria-label="Close graph"
            >
              <X size={18} />
            </button>
          </div>

          {loadingGraph ? (
            <TabSkeleton />
          ) : graph ? (
            <div className="space-y-4">
              {/* Root Entity */}
              {graph.nodes.length > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--bb-cyan)]/30">
                  {(() => {
                    const root = graph.nodes[0];
                    const Icon = TYPE_ICON[root.type] ?? Briefcase;
                    return (
                      <>
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-lg"
                          style={{ backgroundColor: `${TYPE_COLOR[root.type] ?? '#888'}20`, color: TYPE_COLOR[root.type] ?? '#888' }}
                        >
                          <Icon size={20} />
                        </div>
                        <div>
                          <div className="font-medium">{root.label}</div>
                          <div className="text-xs text-muted-foreground capitalize">{root.type}</div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Connected Entities */}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {graph.nodes.slice(1).map((node) => {
                  const Icon = TYPE_ICON[node.type] ?? Briefcase;
                  const edge = graph.edges.find((e) => e.target === node.id || e.source === node.id);
                  return (
                    <button
                      key={`${node.type}-${node.id}`}
                      onClick={() => selectEntity(node.type, node.id)}
                      className="flex items-center gap-3 p-3 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)] transition-colors text-left"
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${TYPE_COLOR[node.type] ?? '#888'}20`, color: TYPE_COLOR[node.type] ?? '#888' }}
                      >
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{node.label}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {edge?.relationshipType?.replace(/_/g, ' ') ?? node.type}
                        </div>
                      </div>
                      <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>

              {graph.nodes.length <= 1 && (
                <p className="text-sm text-muted-foreground">No connected entities found.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Could not load graph data.</p>
          )}
        </div>
      )}

      {/* Search Results */}
      {!selectedEntity && results.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((result) => {
            const Icon = TYPE_ICON[result.type] ?? Briefcase;
            return (
              <button
                key={`${result.type}-${result.id}`}
                onClick={() => selectEntity(result.type, result.id)}
                className="bb-glass-card rounded-xl p-4 text-left hover:ring-1 hover:ring-[var(--bb-cyan)]/40 transition-all"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${TYPE_COLOR[result.type] ?? '#888'}20`, color: TYPE_COLOR[result.type] ?? '#888' }}
                  >
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{result.label}</div>
                    <div className="text-xs text-muted-foreground capitalize">{result.type}</div>
                  </div>
                </div>
                {result.snippet && (
                  <p className="text-xs text-muted-foreground truncate">{result.snippet}</p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Empty States */}
      {!selectedEntity && !searching && query && results.length === 0 && (
        <p className="text-muted-foreground text-center py-8">No results for &quot;{query}&quot;</p>
      )}

      {!selectedEntity && !query && (
        <div className="text-center py-12 text-muted-foreground">
          <Search size={48} className="mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium mb-1">Search your knowledge base</p>
          <p className="text-sm">Find contacts, projects, invoices, and see how they connect.</p>
        </div>
      )}
    </div>
  );
}

export default React.memo(KnowledgeTab);
