'use client';

import React, { useEffect, useState } from 'react';
import { ActivityFeed } from '@/components/activity/activity-feed';
import { TabSkeleton } from './tab-skeleton';
import type { ActivityEntry } from '@/lib/types';

function normalizeActivities(payload: unknown): ActivityEntry[] {
  if (Array.isArray(payload)) return payload as ActivityEntry[];
  if (payload && typeof payload === 'object') {
    const maybeActivities = (payload as { activities?: unknown }).activities;
    if (Array.isArray(maybeActivities)) return maybeActivities as ActivityEntry[];
  }
  return [];
}

function ActivityTab() {
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    fetch('/api/activity')
      .then(async (response) => {
        try {
          return await response.json();
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (!mounted) return;
        setActivities(normalizeActivities(data));
      })
      .catch(() => {
        if (!mounted) return;
        setActivities([]);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <TabSkeleton />;

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Activity Feed</h1>
      <ActivityFeed activities={activities} />
    </div>
  );
}

export default React.memo(ActivityTab);
