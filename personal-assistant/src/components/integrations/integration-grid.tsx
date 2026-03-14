'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SFChevronDown } from 'sf-symbols-lib';
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

// ─── Shimmer ─────────────────────────────────────────────────────────────────

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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

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

  // Sort: available (not connected, not coming_soon) → coming_soon → connected
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
        Connect your tools and services to let BitBit work across everything.
      </p>

      {/* Category dropdown filter */}
      <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-flex', alignSelf: 'flex-start' }}>
        <button
          onClick={() => setDropdownOpen(o => !o)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 14px',
            borderRadius: 10,
            background: activeCategory !== 'all' ? 'rgba(255, 255, 255, 0.1)' : 'var(--glass-pill-bg)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            border: activeCategory !== 'all'
              ? '1px solid rgba(255, 255, 255, 0.15)'
              : '1px solid var(--glass-interactive-border)',
            color: activeCategory !== 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
        >
          {CATEGORY_LABELS[activeCategory]}
          <SFChevronDown
            size={14}
            style={{
              transition: 'transform 200ms ease',
              transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0)',
            }}
          />
        </button>

        {dropdownOpen && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: 160,
            padding: 4,
            borderRadius: 12,
            background: 'var(--glass-bg-heavy, rgba(15, 18, 25, 0.95))',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid var(--glass-interactive-border)',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
            zIndex: 50,
            animation: 'bb-dropdown-in 150ms cubic-bezier(0.2, 0.9, 0.3, 1)',
          }}>
            <style>{`
              @keyframes bb-dropdown-in {
                from { opacity: 0; transform: translateY(-4px) scale(0.97); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
            `}</style>
            {categories.map(cat => {
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => { setActiveCategory(cat); setDropdownOpen(false); }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: isActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                    border: 'none',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 120ms ease',
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Integration list with reorder animation */}
      <style>{`
        @keyframes bb-card-enter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 12,
      }}>
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={shimmerStyle} />
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
      </div>
    </div>
  );
}
