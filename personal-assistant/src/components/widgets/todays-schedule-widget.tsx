'use client';

import React from 'react';
import { TimelineBar } from '@/components/ui/data-viz';
import { SFClock, SFCalendar } from 'sf-symbols-lib';
import { WidgetCard } from './widget-card';

export function TodaysScheduleWidget() {
  return (
    <WidgetCard
      title="Today's Schedule"
      icon={<SFClock size={20} style={{ color: 'var(--bb-status-info)' }} />}
    >
      <div className="text-xs text-muted-foreground mb-4 flex items-center gap-2">
        <SFCalendar size={14} />
        <span>Connect Google SFCalendar to see your schedule</span>
      </div>
      <TimelineBar
        startLabel="09:00"
        endLabel="17:00"
        events={[]}
        selection={[0.25, 0.38]}
      />
    </WidgetCard>
  );
}
