import React from 'react';
import {
  CalendarDays,
  Inbox,
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
} from 'lucide-react';
import type { TopbarConfig } from './topbar';

const TIMELINE_HOURS = ['6 AM', '7', '8', '9', '10', '11', '12 PM', '1', '2', '3', '4', '5', '6'];

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
      <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{dateStr}</span>
    </>
  );
}

function TimelineStrip() {
  return (
    <div className="bb-timeline" role="status" aria-label="Daily timeline">
      {TIMELINE_HOURS.map((h, i) => (
        <span
          key={h}
          className={`bb-timeline__tick ${i >= 4 && i <= 7 ? 'bb-timeline__tick--active' : ''}`}
        >
          {h}
        </span>
      ))}
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
  channels: {
    title: 'Channels',
    breadcrumb: <IconBreadcrumb icon={Radio} text="Connected" />,
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
  settings: {
    title: 'Settings',
    breadcrumb: <IconBreadcrumb icon={Settings} text="Preferences" />,
  },
};
