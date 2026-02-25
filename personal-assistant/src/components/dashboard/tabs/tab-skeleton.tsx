'use client';

export function TabSkeleton() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-pulse text-muted-foreground text-sm">Loading…</div>
    </div>
  );
}

export default TabSkeleton;
