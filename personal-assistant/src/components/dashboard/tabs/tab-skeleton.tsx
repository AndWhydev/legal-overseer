'use client';

import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export function TabSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" aria-busy="true" role="status">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
      </div>
      {/* Content skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

export default TabSkeleton;
