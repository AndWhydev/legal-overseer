import { Suspense } from 'react';
import InboxTabs from './InboxTabs';
import InboxFilters from './InboxFilters';
import type { Lane, LaneCounts } from '@/lib/types';

interface InboxLayoutProps {
  lane: Lane;
  counts: LaneCounts;
  children: React.ReactNode;
}

export default function InboxLayout({ lane, counts, children }: InboxLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600">
                <span className="text-lg font-bold text-white">B</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">BitBit</h1>
                <p className="text-xs text-gray-500">AI Middle Manager</p>
              </div>
            </div>

            {/* Placeholder for future actions */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">CheekyGlo</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Tab navigation - wrapped in Suspense for useSearchParams */}
        <Suspense fallback={<div className="h-14 border-b border-gray-200" />}>
          <InboxTabs counts={counts} />
        </Suspense>

        {/* Filters - wrapped in Suspense for useSearchParams */}
        <div className="mt-6">
          <Suspense fallback={<div className="h-10 mb-6" />}>
            <InboxFilters lane={lane} />
          </Suspense>
        </div>

        {/* Content area */}
        <div>{children}</div>
      </main>
    </div>
  );
}
