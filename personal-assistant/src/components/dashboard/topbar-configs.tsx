'use client';

import React, { useState, useEffect } from 'react';
import { SFCalendar, SFTray, SFBellBadge, SFRadio, SFPill, SFPerson2, SFTarget, SFDocument, SFBriefcase, SFWrenchAndScrewdriver, SFExclamationmarkTriangle, SFCheckmarkSquare, SFMegaphone, SFMagnifyingglass, SFChartBar, SFBookPages, SFDollarsignCircle, SFArrowUpRight, SFClock, SFShield, SFGear, SFLink, SFBolt, SFPaintpalette } from 'sf-symbols-lib';
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
      <SFCalendar size={14} />
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
    breadcrumb: <IconBreadcrumb icon={SFTray} text="All channels" />,
  },
  'creator-studio': {
    title: 'Creator Studio',
    breadcrumb: <IconBreadcrumb icon={SFBellBadge} text="Content proof assets" />,
  },
  connections: {
    title: 'Connections',
    breadcrumb: <IconBreadcrumb icon={SFRadio} text="Your integrations" />,
  },
  medications: {
    title: 'Medications',
    breadcrumb: <IconBreadcrumb icon={SFPill} text="Health tracking" />,
  },
  contacts: {
    title: 'Contacts',
    breadcrumb: <IconBreadcrumb icon={SFPerson2} text="CRM" />,
  },
  leads: {
    title: 'Leads',
    breadcrumb: <IconBreadcrumb icon={SFTarget} text="Pipeline" />,
  },
  invoices: {
    title: 'Invoices',
    breadcrumb: <IconBreadcrumb icon={SFDocument} text="Billing" />,
  },
  tenders: {
    title: 'Tenders',
    breadcrumb: <IconBreadcrumb icon={SFBriefcase} text="Opportunities" />,
  },
  jobs: {
    title: 'Jobs',
    breadcrumb: <IconBreadcrumb icon={SFWrenchAndScrewdriver} text="Job board" />,
  },
  quotes: {
    title: 'Quotes',
    breadcrumb: <IconBreadcrumb icon={SFDocument} text="Estimates" />,
  },
  sentry: {
    title: 'Sentry',
    breadcrumb: <IconBreadcrumb icon={SFExclamationmarkTriangle} text="Monitoring" />,
  },
  approvals: {
    title: 'Approvals',
    breadcrumb: <IconBreadcrumb icon={SFCheckmarkSquare} text="Agent decisions" />,
  },
  'ad-scripts': {
    title: 'Ad Scripts',
    breadcrumb: <IconBreadcrumb icon={SFMegaphone} text="Campaign copy" />,
  },
  'ai-search': {
    title: 'AI Search',
    breadcrumb: <IconBreadcrumb icon={SFMagnifyingglass} text="Semantic search" />,
  },
  reports: {
    title: 'Reports',
    breadcrumb: <IconBreadcrumb icon={SFChartBar} text="Analytics & exports" />,
  },
  knowledge: {
    title: 'Knowledge',
    breadcrumb: <IconBreadcrumb icon={SFBookPages} text="Entity graph" />,
  },
  costs: {
    title: 'Costs',
    breadcrumb: <IconBreadcrumb icon={SFDollarsignCircle} text="AI spend" />,
  },
  analytics: {
    title: 'Analytics',
    breadcrumb: <IconBreadcrumb icon={SFArrowUpRight} text="MRR & usage" />,
  },
  activity: {
    title: 'Activity',
    breadcrumb: <IconBreadcrumb icon={SFClock} text="Audit log" />,
  },
  admin: {
    title: 'Admin',
    breadcrumb: <IconBreadcrumb icon={SFShield} text="System tools" />,
  },
  'settings-connections': {
    title: 'Settings',
    breadcrumb: <IconBreadcrumb icon={SFLink} text="Connections" />,
  },
  'settings-automations': {
    title: 'Settings',
    breadcrumb: <IconBreadcrumb icon={SFBolt} text="Automations" />,
  },
  'settings-appearance': {
    title: 'Settings',
    breadcrumb: <IconBreadcrumb icon={SFPaintpalette} text="Appearance" />,
  },
};
