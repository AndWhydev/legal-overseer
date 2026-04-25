'use client';

/**
 * MoneyFiltersSidebar — sidebar variant for Money mode.
 *
 * Sections: Quick filters (All/Drafts/Sent/Paid/Overdue), Clients (top 10),
 * Summary card (revenue + sparkline). CTA: + Invoice.
 *
 * No per-mode color tokens — monochrome only.
 * Overdue badge uses variant="destructive" (existing Shadcn convention).
 */

import React, { useState } from 'react';
import {
  IconPlus,
  IconReceipt,
  IconFileText,
  IconSend,
  IconCircleCheck,
  IconAlertCircle,
  IconBuilding,
  IconChartLine,
} from '@tabler/icons-react';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroupLabel,
} from '@/components/animate-ui/components/radix/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type InvoiceFilter = 'all' | 'drafts' | 'sent' | 'paid' | 'overdue';

interface QuickFilter {
  id: InvoiceFilter;
  label: string;
  icon: React.ElementType;
}

// ─── Static data (Phase 02 uses no new APIs — data wired in Phase 03) ─────────

const QUICK_FILTERS: QuickFilter[] = [
  { id: 'all', label: 'All', icon: IconReceipt },
  { id: 'drafts', label: 'Drafts', icon: IconFileText },
  { id: 'sent', label: 'Sent', icon: IconSend },
  { id: 'paid', label: 'Paid', icon: IconCircleCheck },
  { id: 'overdue', label: 'Overdue', icon: IconAlertCircle },
];

// Placeholder clients — wired in Phase 03 from invoices API
const PLACEHOLDER_CLIENTS: Array<{ id: string; name: string }> = [];

// ─── Minimal sparkline (pure SVG, no chart library needed) ───────────────────

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 24;
  const step = w / (data.length - 1);

  const points = data
    .map((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-6 w-full text-muted-foreground/60"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MoneyFiltersSidebarProps {
  onTabChange?: (tabId: string) => void;
  overdueCount?: number;
  revenueThisMonth?: number;
  sparklineData?: number[];
}

export function MoneyFiltersSidebar({
  onTabChange,
  overdueCount = 0,
  revenueThisMonth,
  sparklineData = [],
}: MoneyFiltersSidebarProps) {
  const [activeFilter, setActiveFilter] = useState<InvoiceFilter>('all');

  const navigate = (tabId: string) => onTabChange?.(tabId);

  const handleFilterClick = (filterId: InvoiceFilter) => {
    setActiveFilter(filterId);
    navigate('invoices');
    window.dispatchEvent(
      new CustomEvent('bb-invoice-filter', { detail: { filter: filterId } }),
    );
  };

  return (
    <div className="flex h-full flex-col gap-2 px-2 pb-2 pt-1">
      {/* New Invoice CTA */}
      <Button
        variant="default"
        size="default"
        className="h-8 w-full justify-start rounded-xl bg-foreground px-3 text-sm font-medium text-background shadow-sm hover:bg-foreground/90 gap-2"
        onClick={() => window.dispatchEvent(new CustomEvent('sidebar-cta-invoices'))}
      >
        <IconPlus className="size-4" />
        Invoice
      </Button>

      <Separator className="mx-0" />

      {/* Quick filters */}
      <div>
        <SidebarGroupLabel className="px-1 pt-0.5 pb-1 text-[11px] uppercase tracking-wide">
          Quick filters
        </SidebarGroupLabel>
        <SidebarMenu>
          {QUICK_FILTERS.map(filter => (
            <SidebarMenuItem key={filter.id}>
              <SidebarMenuButton
                isActive={activeFilter === filter.id}
                onClick={() => handleFilterClick(filter.id)}
                className="h-8"
              >
                <filter.icon className="size-4 shrink-0" />
                <span>{filter.label}</span>
                {filter.id === 'overdue' && overdueCount > 0 && (
                  <Badge
                    variant="destructive"
                    className="ml-auto h-4 min-w-4 px-1 py-0 text-[11px]"
                  >
                    {overdueCount}
                  </Badge>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </div>

      <Separator className="mx-0" />

      {/* Clients */}
      <div>
        <SidebarGroupLabel className="px-1 pt-0.5 pb-1 text-[11px] uppercase tracking-wide">
          Clients
        </SidebarGroupLabel>
        <SidebarMenu>
          {PLACEHOLDER_CLIENTS.length === 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={() => navigate('invoices')}
                className="h-8 text-muted-foreground"
              >
                <IconBuilding className="size-4 shrink-0 opacity-50" />
                <span className="text-[12px]">No clients yet</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : (
            PLACEHOLDER_CLIENTS.map(client => (
              <SidebarMenuItem key={client.id}>
                <SidebarMenuButton
                  onClick={() => navigate('invoices')}
                  className="h-8"
                >
                  <IconBuilding className="size-4 shrink-0" />
                  <span className="truncate">{client.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))
          )}
        </SidebarMenu>
      </div>

      {/* Summary card — only when data available */}
      {(revenueThisMonth !== undefined || sparklineData.length > 1) && (
        <>
          <Separator className="mx-0" />
          <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">
              <IconChartLine className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Revenue this month
              </span>
            </div>
            {revenueThisMonth !== undefined && (
              <p className="text-base font-semibold tabular-nums">
                ${revenueThisMonth.toLocaleString()}
              </p>
            )}
            {sparklineData.length > 1 && (
              <div className="mt-1.5">
                <MiniSparkline data={sparklineData} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
