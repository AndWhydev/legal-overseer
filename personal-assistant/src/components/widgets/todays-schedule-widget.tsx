'use client';

import React from 'react';
import { TimelineBar } from '@/components/ui/data-viz';
import { Clock, Calendar } from 'lucide-react';
import { WidgetCard } from './widget-card';

export function TodaysScheduleWidget() {
  return (
    <WidgetCard
      title="Today's Schedule"
      icon={<Clock size={20} style={{ color: 'var(--bb-status-info)' }} />}
    >
      <div className="text-xs text-muted-foreground mb-4 flex items-center gap-2">
        <Calendar size={14} />
        <span>Connect Google Calendar to see your schedule</span>
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
