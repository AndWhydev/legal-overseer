'use client';

import React, { useState, useMemo } from 'react';
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const filterPill: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 20,
  background: 'transparent',
  border: '1px solid var(--glass-interactive-border)',
  color: 'var(--text-secondary)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 150ms ease',
  whiteSpace: 'nowrap',
};

const filterPillActive: React.CSSProperties = {
  ...filterPill,
  background: 'rgba(255, 255, 255, 0.1)',
  borderColor: 'rgba(255, 255, 255, 0.2)',
  color: 'var(--text-primary)',
};

const shimmerStyle: React.CSSProperties = {
  borderRadius: 16,
  background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s ease infinite',
  height: 76,
};

// ─── Component ───────────────────────────────────────────────────────────────

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

  const categories = Object.keys(CATEGORY_LABELS) as (IntegrationCategory | 'all')[];

  const filtered = activeCategory === 'all'
    ? mergedIntegrations
    : mergedIntegrations.filter(i => i.category === activeCategory);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
        Connect your tools and services to let BitBit work across everything.
      </p>

      {/* Category filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={activeCategory === cat ? filterPillActive : filterPill}
            onMouseEnter={e => {
              if (activeCategory !== cat) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={e => {
              if (activeCategory !== cat) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }
            }}
          >
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={shimmerStyle} />
          ))
        ) : (
          filtered.map(integration => (
            <IntegrationCard
              key={integration.id}
              integration={integration}
              isConnected={isConnected(integration.id)}
              onStatusChange={onStatusChange}
              onWhatsAppConnect={onWhatsAppConnect}
            />
          ))
        )}
      </div>
    </div>
  );
}
