'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Lane, LaneCounts } from '@/lib/types';

interface InboxTabsProps {
  counts: LaneCounts;
}

export default function InboxTabs({ counts }: InboxTabsProps) {
  const searchParams = useSearchParams();
  const currentLane = (searchParams.get('lane') as Lane) || 'xixi';

  // Preserve other filters when switching lanes
  const getTabUrl = (lane: Lane) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('lane', lane);
    return `/?${params.toString()}`;
  };

  const tabs: { lane: Lane; label: string; description: string }[] = [
    { lane: 'xixi', label: 'Xixi', description: 'Customer & Content' },
    { lane: 'allen', label: 'Allen', description: 'Operations' },
  ];

  return (
    <div className="border-b border-gray-200">
      <nav className="-mb-px flex space-x-8" aria-label="Tabs">
        {tabs.map((tab) => {
          const isActive = currentLane === tab.lane;
          const count = counts[tab.lane];

          return (
            <Link
              key={tab.lane}
              href={getTabUrl(tab.lane)}
              className={`
                group inline-flex items-center gap-2 border-b-2 px-1 py-4 text-sm font-medium
                ${
                  isActive
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }
              `}
              aria-current={isActive ? 'page' : undefined}
            >
              <span>{tab.label}</span>
              <span className="text-xs text-gray-400">{tab.description}</span>
              {count > 0 && (
                <span
                  className={`
                    ml-2 rounded-full px-2.5 py-0.5 text-xs font-medium
                    ${
                      isActive
                        ? 'bg-purple-100 text-purple-600'
                        : 'bg-gray-100 text-gray-600'
                    }
                  `}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
