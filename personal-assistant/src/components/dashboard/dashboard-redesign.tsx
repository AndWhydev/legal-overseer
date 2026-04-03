'use client';

import React from 'react';
import { SectionCards } from '@/components/section-cards';
import { WeeklySummaryCard } from './weekly-summary-card';
import { ProjectProgressCards } from './project-progress-cards';

export function DashboardRedesign() {
  return (
    <div className="@container/main flex flex-col gap-4">
      <SectionCards />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <WeeklySummaryCard />
        </div>
        <div className="lg:col-span-2">
          <ProjectProgressCards />
        </div>
      </div>
    </div>
  );
}

export default DashboardRedesign;