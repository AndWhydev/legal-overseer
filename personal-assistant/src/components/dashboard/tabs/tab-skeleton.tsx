'use client';

import { Skeleton } from '@/components/ui/skeleton';

// ---------------------------------------------------------------------------
// Shared header skeleton
// ---------------------------------------------------------------------------

function SkeletonHeader() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-9 w-9 rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3 w-64" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant: table (rows with columns)
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" aria-busy="true" role="status">
      <SkeletonHeader />
      {/* Table header */}
      <div className="flex gap-4 border-b border-border pb-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-16" />
      </div>
      {/* Table rows */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-16" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant: cards-grid (grid of card skeletons)
// ---------------------------------------------------------------------------

function CardsGridSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" aria-busy="true" role="status">
      <SkeletonHeader />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant: kanban (pipeline columns)
// ---------------------------------------------------------------------------

function KanbanSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" aria-busy="true" role="status">
      <SkeletonHeader />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
        {Array.from({ length: 5 }).map((_, col) => (
          <div key={col} className="flex flex-col gap-3">
            {/* Column header */}
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-6 rounded-full" />
            </div>
            {/* Column cards */}
            {Array.from({ length: 2 + (col % 2) }).map((_, card) => (
              <div key={card} className="rounded-xl border border-border bg-card p-3 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant: chart (metric cards + chart area)
// ---------------------------------------------------------------------------

function ChartSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" aria-busy="true" role="status">
      <SkeletonHeader />
      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>
      {/* Chart areas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant: detail (single entity detail view)
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" aria-busy="true" role="status">
      <div className="flex items-center gap-4">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant: timeline (chronological feed)
// ---------------------------------------------------------------------------

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" aria-busy="true" role="status">
      <SkeletonHeader />
      {/* Filters */}
      <div className="flex gap-3">
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      {/* Timeline items */}
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
            <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-3 w-12 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant: inbox (message list with stats bar + filter pills + message rows)
// ---------------------------------------------------------------------------

function InboxSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6" aria-busy="true" role="status">
      {/* Stats bar */}
      <div className="flex items-center gap-6">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      </div>
      {/* Filter pills */}
      <div className="flex gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      {/* Message rows */}
      <div className="flex flex-col gap-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-3">
            <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
            <div className="flex flex-1 items-center gap-3 min-w-0">
              <Skeleton className="h-4 w-28 shrink-0" />
              <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-32 shrink-0" />
              <Skeleton className="h-3 flex-1 min-w-0" />
              <Skeleton className="h-3 w-8 shrink-0 ml-auto" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default (original generic skeleton)
// ---------------------------------------------------------------------------

function DefaultSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" aria-busy="true" role="status">
      <SkeletonHeader />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20 w-full" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type TabSkeletonVariant = 'default' | 'table' | 'cards-grid' | 'kanban' | 'chart' | 'detail' | 'timeline' | 'inbox';

const VARIANT_MAP: Record<TabSkeletonVariant, React.FC> = {
  default: DefaultSkeleton,
  table: TableSkeleton,
  'cards-grid': CardsGridSkeleton,
  kanban: KanbanSkeleton,
  chart: ChartSkeleton,
  detail: DetailSkeleton,
  timeline: TimelineSkeleton,
  inbox: InboxSkeleton,
};

export function TabSkeleton({ variant = 'default' }: { variant?: TabSkeletonVariant } = {}) {
  const Component = VARIANT_MAP[variant] ?? DefaultSkeleton;
  return <Component />;
}

export default TabSkeleton;
