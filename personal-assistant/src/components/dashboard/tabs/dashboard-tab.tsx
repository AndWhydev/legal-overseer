'use client';

import React from 'react';
import { DashboardRedesign } from '../dashboard-redesign';
import { TabShell } from '@/components/ui/tab-shell';
import { DailyTipBanner } from '@/components/beta/daily-tip-banner';

function DashboardTab() {
  return (
    <TabShell variant="fixed" padding="p-0">
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
        <DailyTipBanner />
        <DashboardRedesign />
      </div>
    </TabShell>
  );
}

export default React.memo(DashboardTab);
