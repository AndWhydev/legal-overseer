'use client';

import React, { lazy, Suspense } from 'react';
import { SectionCards } from '@/components/section-cards';
import { Skeleton } from '@/components/ui/skeleton';
import { useChartData } from '@/hooks/use-chart-data';
import { WeeklySummaryCard } from './weekly-summary-card';
import { ProjectProgressCards } from './project-progress-cards';

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
      <SectionCards />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <WeeklySummaryCard />
        </div>
        <div className="lg:col-span-2">
          <ProjectProgressCards />
        </div>
      </div>
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