'use client';

import React from 'react';
import { SectionCards } from '@/components/section-cards';
import { WeeklySummaryCard } from './weekly-summary-card';
import { ProjectProgressCards } from './project-progress-cards';

export function DashboardRedesign() {
  return (
    <div className="@container/main flex flex-col gap-4">
      <SectionCards />
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card">
        <WeeklySummaryCard />
        <ProjectProgressCards />
      </div>
    </div>
  );
}

export default DashboardRedesign;