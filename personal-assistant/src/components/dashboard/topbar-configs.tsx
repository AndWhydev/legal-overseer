'use client';

import React, { useState, useEffect } from 'react';
import {
  CalendarDays,
  Inbox,
  BellRing,
  Radio,
  Pill,
  Users,
  Target,
  FileText,
  Briefcase,
  Wrench,
  AlertTriangle,
  CheckSquare,
  Megaphone,
  Search,
  BarChart3,
  BookOpen,
  DollarSign,
  TrendingUp,
  Clock,
  Shield,
  Settings,
  Link2,
  Zap,
  Puzzle,
  Palette,
  Activity,
} from 'lucide-react';
import type { TopbarConfig } from './topbar';

function DashboardBreadcrumb() {
  const dateStr = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return (
    <>
      <CalendarDays size={14} />
      <span>{dateStr}</span>
    </>
  );
}

const TIMELINE_HOURS = [
  { label: '6 AM', hour: 6 },
  { label: '7', hour: 7 },
  { label: '8', hour: 8 },
  { label: '9', hour: 9 },
  { label: '10', hour: 10 },
  { label: '11', hour: 11 },
  { label: '12 PM', hour: 12 },
  { label: '1', hour: 13 },
  { label: '2', hour: 14 },
  { label: '3', hour: 15 },
  { label: '4', hour: 16 },
  { label: '5', hour: 17 },
  { label: '6', hour: 18 },
];

function TimelineStrip() {
  const [currentHour, setCurrentHour] = useState<number | null>(null);

  useEffect(() => {
    setCurrentHour(new Date().getHours());
    const id = setInterval(() => setCurrentHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bb-timeline" role="status" aria-label="Daily timeline">
      {TIMELINE_HOURS.map(({ label, hour }) => {
        const isNow = currentHour === hour;
        const isNext = currentHour !== null && hour === currentHour + 1;
        const isPast = currentHour !== null && hour < currentHour;
        return (
          <span
            key={label}
            className={[
              'bb-timeline__tick',
              isNow && 'bb-timeline__tick--now',
              isNext && 'bb-timeline__tick--next',
            ].filter(Boolean).join(' ')}
            style={isPast && !isNow ? { opacity: 0.35 } : undefined}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function IconBreadcrumb({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <>
      <Icon size={14} />
      <span>{text}</span>
    </>
  );
}

export const TOPBAR_CONFIGS: Record<string, TopbarConfig> = {
  dashboard: {
    title: 'Dashboard',
    breadcrumb: <DashboardBreadcrumb />,
    centerContent: <TimelineStrip />,
  },
  chat: {
    title: 'Chat',
    hidden: true,
  },
  inbox: {
    title: 'Inbox',
    breadcrumb: <IconBreadcrumb icon={Inbox} text="All channels" />,
  },
  'creator-studio': {
    title: 'Creator Studio',
    breadcrumb: <IconBreadcrumb icon={BellRing} text="Content proof assets" />,
  },
  connections: {
    title: 'Connections',
    breadcrumb: <IconBreadcrumb icon={Radio} text="Connected channels" />,
  },
  medications: {
    title: 'Medications',
    breadcrumb: <IconBreadcrumb icon={Pill} text="Health tracking" />,
  },
  contacts: {
    title: 'Contacts',
    breadcrumb: <IconBreadcrumb icon={Users} text="CRM" />,
  },
  leads: {
    title: 'Leads',
    breadcrumb: <IconBreadcrumb icon={Target} text="Pipeline" />,
  },
  invoices: {
    title: 'Invoices',
    breadcrumb: <IconBreadcrumb icon={FileText} text="Billing" />,
  },
  tenders: {
    title: 'Tenders',
    breadcrumb: <IconBreadcrumb icon={Briefcase} text="Opportunities" />,
  },
  jobs: {
    title: 'Jobs',
    breadcrumb: <IconBreadcrumb icon={Wrench} text="Job board" />,
  },
  quotes: {
    title: 'Quotes',
    breadcrumb: <IconBreadcrumb icon={FileText} text="Estimates" />,
  },
  sentry: {
    title: 'Sentry',
    breadcrumb: <IconBreadcrumb icon={AlertTriangle} text="Monitoring" />,
  },
  swarm: {
    title: 'Swarm',
    breadcrumb: <IconBreadcrumb icon={Zap} text="Multi-agent teams" />,
  },
  approvals: {
    title: 'Approvals',
    breadcrumb: <IconBreadcrumb icon={CheckSquare} text="Agent decisions" />,
  },
  'ad-scripts': {
    title: 'Ad Scripts',
    breadcrumb: <IconBreadcrumb icon={Megaphone} text="Campaign copy" />,
  },
  'ai-search': {
    title: 'AI Search',
    breadcrumb: <IconBreadcrumb icon={Search} text="Semantic search" />,
  },
  reports: {
    title: 'Reports',
    breadcrumb: <IconBreadcrumb icon={BarChart3} text="Analytics & exports" />,
  },
  knowledge: {
    title: 'Knowledge',
    breadcrumb: <IconBreadcrumb icon={BookOpen} text="Entity graph" />,
  },
  costs: {
    title: 'Costs',
    breadcrumb: <IconBreadcrumb icon={DollarSign} text="AI spend" />,
  },
  analytics: {
    title: 'Analytics',
    breadcrumb: <IconBreadcrumb icon={TrendingUp} text="MRR & usage" />,
  },
  activity: {
    title: 'Activity',
    breadcrumb: <IconBreadcrumb icon={Clock} text="Audit log" />,
  },
  admin: {
    title: 'Admin',
    breadcrumb: <IconBreadcrumb icon={Shield} text="System tools" />,
  },
  monitoring: {
    title: 'Monitoring',
    breadcrumb: <IconBreadcrumb icon={Activity} text="Production health" />,
  },
  'settings-connections': {
    title: 'Settings',
    breadcrumb: <IconBreadcrumb icon={Link2} text="Connections" />,
  },
  'settings-automations': {
    title: 'Settings',
    breadcrumb: <IconBreadcrumb icon={Puzzle} text="Plugins" />,
  },
  'settings-appearance': {
    title: 'Settings',
    breadcrumb: <IconBreadcrumb icon={Palette} text="Appearance" />,
  },
};
