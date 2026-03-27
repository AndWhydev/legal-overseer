'use client';

import React from 'react';
import {
  IconCalendarEvent,
  IconInbox,
  IconBellRinging,
  IconRadio,
  IconPill,
  IconUsers,
  IconTarget,
  IconFileText,
  IconBriefcase,
  IconTool,
  IconAlertTriangle,
  IconCheckbox,
  IconSpeakerphone,
  IconSearch,
  IconChartBar,
  IconBook,
  IconCurrencyDollar,
  IconTrendingUp,
  IconClock,
  IconShield,
  IconSettings,
  IconLink,
  IconBolt,
  IconPuzzle,
  IconPalette,
  IconActivity,
  IconLayoutKanban,
} from '@tabler/icons-react';
import type { TopbarConfig } from './topbar';
import FlipClock from '@/components/ui/flip-clock';

function DashboardBreadcrumb() {
  const dateStr = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return (
    <>
      <IconCalendarEvent size={14} />
      <span>{dateStr}</span>
    </>
  );
}

function HeaderClock() {
  return <FlipClock size="xs" variant="outline" />;
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
    centerContent: <HeaderClock />,
  },
  chat: {
    title: 'Chat',
    hidden: true,
  },
  inbox: {
    title: 'Inbox',
    breadcrumb: <IconBreadcrumb icon={IconInbox} text="All channels" />,
  },
  'creator-studio': {
    title: 'Creator Studio',
    breadcrumb: <IconBreadcrumb icon={IconBellRinging} text="Content proof assets" />,
  },
  tasks: {
    title: 'Tasks',
    breadcrumb: <IconBreadcrumb icon={IconLayoutKanban} text="Kanban board" />,
  },
  connections: {
    title: 'Connections',
    breadcrumb: <IconBreadcrumb icon={IconRadio} text="Connected channels" />,
  },
  medications: {
    title: 'Medications',
    breadcrumb: <IconBreadcrumb icon={IconPill} text="Health tracking" />,
  },
  contacts: {
    title: 'Contacts',
    breadcrumb: <IconBreadcrumb icon={IconUsers} text="CRM" />,
  },
  leads: {
    title: 'Leads',
    breadcrumb: <IconBreadcrumb icon={IconTarget} text="Pipeline" />,
  },
  invoices: {
    title: 'Invoices',
    breadcrumb: <IconBreadcrumb icon={IconFileText} text="Billing" />,
  },
  tenders: {
    title: 'Tenders',
    breadcrumb: <IconBreadcrumb icon={IconBriefcase} text="Opportunities" />,
  },
  jobs: {
    title: 'Jobs',
    breadcrumb: <IconBreadcrumb icon={IconTool} text="Job board" />,
  },
  quotes: {
    title: 'Quotes',
    breadcrumb: <IconBreadcrumb icon={IconFileText} text="Estimates" />,
  },
  sentry: {
    title: 'Sentry',
    breadcrumb: <IconBreadcrumb icon={IconAlertTriangle} text="Monitoring" />,
  },
  swarm: {
    title: 'Swarm',
    breadcrumb: <IconBreadcrumb icon={IconBolt} text="Multi-agent teams" />,
  },
  workflows: {
    title: 'Workflows',
    breadcrumb: <IconBreadcrumb icon={IconBolt} text="Automation rules" />,
  },
  approvals: {
    title: 'Approvals',
    breadcrumb: <IconBreadcrumb icon={IconCheckbox} text="Agent decisions" />,
  },
  'ad-scripts': {
    title: 'Ad Scripts',
    breadcrumb: <IconBreadcrumb icon={IconSpeakerphone} text="Campaign copy" />,
  },
  'ai-search': {
    title: 'AI Search',
    breadcrumb: <IconBreadcrumb icon={IconSearch} text="Semantic search" />,
  },
  reports: {
    title: 'Reports',
    breadcrumb: <IconBreadcrumb icon={IconChartBar} text="Analytics & exports" />,
  },
  knowledge: {
    title: 'Knowledge',
    breadcrumb: <IconBreadcrumb icon={IconBook} text="Entity graph" />,
  },
  costs: {
    title: 'Costs',
    breadcrumb: <IconBreadcrumb icon={IconCurrencyDollar} text="AI spend" />,
  },
  analytics: {
    title: 'Analytics',
    breadcrumb: <IconBreadcrumb icon={IconTrendingUp} text="MRR & usage" />,
  },
  activity: {
    title: 'Activity',
    breadcrumb: <IconBreadcrumb icon={IconClock} text="Audit log" />,
  },
  admin: {
    title: 'Admin',
    breadcrumb: <IconBreadcrumb icon={IconShield} text="System tools" />,
  },
  monitoring: {
    title: 'Monitoring',
    breadcrumb: <IconBreadcrumb icon={IconActivity} text="Production health" />,
  },
  'settings-connections': {
    title: 'Settings',
    breadcrumb: <IconBreadcrumb icon={IconLink} text="Connections" />,
  },
  'settings-automations': {
    title: 'Settings',
    breadcrumb: <IconBreadcrumb icon={IconPuzzle} text="Plugins" />,
  },
  'settings-appearance': {
    title: 'Settings',
    breadcrumb: <IconBreadcrumb icon={IconPalette} text="Appearance" />,
  },
};
