'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { IntegrationCard } from './integration-card';
import {
  AVAILABLE_INTEGRATIONS,
  CATEGORY_LABELS,
  type IntegrationCategory,
} from '@/lib/integrations/types';

interface OrgIntegration {
  id: string;
  provider: string;
  status: string;
  connected_at: string | null;
  metadata: Record<string, unknown>;
}

interface ConnectionsGridProps {
  integrations: OrgIntegration[];
  isLoading: boolean;
  onStatusChange: () => void;
  onWhatsAppConnect: () => void;
}

export function ConnectionsGrid({ integrations, isLoading, onStatusChange, onWhatsAppConnect }: ConnectionsGridProps) {
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory | 'all'>('all');

  const isConnected = (providerId: string): boolean => {
    return integrations.some(int => int.provider === providerId && int.status === 'connected');
  };

  const mergedIntegrations = useMemo(() =>
    AVAILABLE_INTEGRATIONS.map(integration => ({
      ...integration,
      status: isConnected(integration.id) ? 'connected' as const : integration.status,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [integrations],
  );

  // Filter by category
  const filtered = activeCategory === 'all'
    ? mergedIntegrations
    : mergedIntegrations.filter(i => i.category === activeCategory);

  // Sort: available (not connected, not coming_soon) -> coming_soon -> connected
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const order = (i: typeof a) => {
        if (isConnected(i.id)) return 2;
        if (i.status === 'coming_soon') return 1;
        return 0;
      };
      return order(a) - order(b);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, integrations]);

  const categories = Object.keys(CATEGORY_LABELS) as (IntegrationCategory | 'all')[];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Connect your tools and services to let BitBit work across everything.
      </p>

      {/* Category dropdown filter */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={activeCategory !== 'all' ? 'secondary' : 'outline'}
            size="sm"
            className="w-fit"
          >
            {CATEGORY_LABELS[activeCategory]}
            <IconChevronDown size={14} className="ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {categories.map(cat => (
            <DropdownMenuItem
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(activeCategory === cat && 'font-medium')}
            >
              {CATEGORY_LABELS[cat]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Integration list */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-xl" />
          ))
        ) : (
          sorted.map((integration, idx) => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              isConnected={isConnected(integration.id)}
              onStatusChange={onStatusChange}
              onWhatsAppConnect={onWhatsAppConnect}
              style={{
                animation: `bb-card-enter 300ms cubic-bezier(0.2, 0.9, 0.3, 1) ${idx * 30}ms both`,
              }}
            />
          ))
        )}

        {/* Custom connection card */}
        {!isLoading && (
          <a
            href="/docs/connections/bridge"
            target="_blank"
            rel="noopener"
            className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-card px-4 py-3 transition-colors hover:border-muted-foreground/40"
            style={{
              animation: `bb-card-enter 300ms cubic-bezier(0.2, 0.9, 0.3, 1) ${(sorted.length) * 30}ms both`,
            }}
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-xl text-muted-foreground">
              +
            </div>
            <div className="min-w-0 flex-1">
              <span className="text-sm font-medium">Custom</span>
              <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
                Connect any data source
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              Setup guide →
            </span>
          </a>
        )}
      </div>

      <style>{`
        @keyframes bb-card-enter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
