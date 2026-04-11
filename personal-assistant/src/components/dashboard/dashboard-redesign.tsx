'use client';

import React, { lazy, Suspense } from 'react';
import { SectionCards } from '@/components/section-cards';
import { Skeleton } from '@/components/ui/skeleton';
import { useChartData } from '@/hooks/use-chart-data';
import { WeeklySummaryCard } from './weekly-summary-card'
import { MorningBriefingCard } from './morning-briefing-card';
import { ProjectProgressCards } from './project-progress-cards';
import { ActivityTimeline } from './activity-timeline';
import { AttentionQueue } from './attention-queue';
import { RelationshipHealth } from './relationship-health';
import { FinancialSnapshot } from './financial-snapshot';

const ChartAreaAgents = lazy(() => import('./charts/chart-area-agents').then(m => ({ default: m.ChartAreaAgents })));
const ChartBarTasks = lazy(() => import('./charts/chart-bar-tasks').then(m => ({ default: m.ChartBarTasks })));
const ChartLinePerformance = lazy(() => import('./charts/chart-line-performance').then(m => ({ default: m.ChartLinePerformance })));
const ChartPieChannels = lazy(() => import('./charts/chart-pie-channels').then(m => ({ default: m.ChartPieChannels })));
const ChartRadarCapabilities = lazy(() => import('./charts/chart-radar-capabilities').then(m => ({ default: m.ChartRadarCapabilities })));
const ChartRadialGoals = lazy(() => import('./charts/chart-radial-goals').then(m => ({ default: m.ChartRadialGoals })));

function ChartSkeleton({ className }: { className?: string }) {
  return <Skeleton className={`h-[350px] w-full rounded-xl ${className ?? ''}`} />;
}

export function DashboardRedesign() {
  const { data, loading: chartsLoading } = useChartData();

  return (
    <div className="@container/main flex flex-col gap-4">
      {/* Row 1: KPI stat cards */}
      <SectionCards />

      {/* Row 2: Operational cards (weekly ops + projects) */}
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs dark:*:data-[slot=card]:bg-card">
        <MorningBriefingCard />
        <WeeklySummaryCard />
        <ProjectProgressCards />
      </div>

      {/* Row 3: Attention + Activity + Relationships + Financial */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <AttentionQueue />
        <ActivityTimeline />
        <RelationshipHealth />
        <FinancialSnapshot />
      </div>

      {/* Row 4: Charts */}
      <Suspense fallback={<ChartSkeleton />}>
        <ChartAreaAgents data={data.agentActivity} loading={chartsLoading} />
      </Suspense>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Suspense fallback={<ChartSkeleton />}>
          <ChartBarTasks data={data.tasksByStatus} loading={chartsLoading} />
        </Suspense>
        <Suspense fallback={<ChartSkeleton />}>
          <ChartLinePerformance data={data.responseTimesMonthly} loading={chartsLoading} />
        </Suspense>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Suspense fallback={<ChartSkeleton />}>
          <ChartPieChannels data={data.channelDistribution} totalMessages={data.totalMessages} loading={chartsLoading} />
        </Suspense>
        <Suspense fallback={<ChartSkeleton />}>
          <ChartRadarCapabilities data={data.agentPerformance} loading={chartsLoading} />
        </Suspense>
        <Suspense fallback={<ChartSkeleton />}>
          <ChartRadialGoals data={data.goals} loading={chartsLoading} />
        </Suspense>
      </div>
    </div>
  );
}

export default DashboardRedesign;