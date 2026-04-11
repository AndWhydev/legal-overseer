/**
 * Built-in commands — navigation, per-page actions, create shortcuts, AI, and settings.
 */

import {
  IconHome,
  IconMessage,
  IconInbox,
  IconBrush,
  IconCheckbox,
  IconPill,
  IconUsers,
  IconTarget,
  IconFileText,
  IconBriefcase,
  IconTool,
  IconQuote,
  IconCalendar,
  IconAlertTriangle,
  IconBolt,
  IconBinaryTree,
  IconCheckupList,
  IconSpeakerphone,
  IconSearch,
  IconChartBar,
  IconBook,
  IconCurrencyDollar,
  IconTrendingUp,
  IconClock,
  IconShield,
  IconActivity,
  IconLink,
  IconPuzzle,
  IconPalette,
  IconPlus,
  IconSend,
  IconDownload,
  IconFilter,
  IconRobot,
  IconBrain,
  IconScan,
  IconSettings,
  IconMail,
  IconUserPlus,
  IconReceipt,
  IconCalendarPlus,
  IconSubtask,
  IconRefresh,
  IconTrash,
  IconArchive,
  IconBell,
  IconEye,
} from '@tabler/icons-react';
import type { SummonCommand } from '../command-registry';

// ---------------------------------------------------------------------------
// Navigation commands — one per tab
// ---------------------------------------------------------------------------

const NAV: SummonCommand[] = [
  { id: 'nav:dashboard',     label: 'Dashboard',       icon: IconHome,             category: 'navigation', pages: [], keywords: ['home', 'overview', 'kpi'], priority: 0, handler: (ctx) => ctx.navigateTo('dashboard') },
  { id: 'nav:chat',          label: 'Chat',            icon: IconMessage,          category: 'navigation', pages: [], keywords: ['bitbit', 'ai', 'assistant'], priority: 1, handler: (ctx) => ctx.navigateTo('chat') },
  { id: 'nav:inbox',         label: 'Inbox',           icon: IconInbox,            category: 'navigation', pages: [], keywords: ['email', 'messages', 'sms', 'whatsapp'], priority: 2, handler: (ctx) => ctx.navigateTo('inbox') },
  { id: 'nav:creator',       label: 'Creator Studio',  icon: IconBrush,            category: 'navigation', pages: [], keywords: ['content', 'social', 'post'], priority: 3, handler: (ctx) => ctx.navigateTo('creator-studio') },
  { id: 'nav:tasks',         label: 'Tasks',           icon: IconCheckbox,         category: 'navigation', pages: [], keywords: ['todo', 'kanban', 'board'], priority: 4, handler: (ctx) => ctx.navigateTo('tasks') },
  { id: 'nav:contacts',      label: 'Contacts',        icon: IconUsers,            category: 'navigation', pages: [], keywords: ['crm', 'people', 'clients'], priority: 5, handler: (ctx) => ctx.navigateTo('contacts') },
  { id: 'nav:leads',         label: 'Leads',           icon: IconTarget,           category: 'navigation', pages: [], keywords: ['pipeline', 'prospects', 'sales'], priority: 6, handler: (ctx) => ctx.navigateTo('leads') },
  { id: 'nav:invoices',      label: 'Invoices',        icon: IconFileText,         category: 'navigation', pages: [], keywords: ['billing', 'payments', 'money'], priority: 7, handler: (ctx) => ctx.navigateTo('invoices') },
  { id: 'nav:tenders',       label: 'Tenders',         icon: IconBriefcase,        category: 'navigation', pages: [], keywords: ['opportunities', 'bids', 'rfp'], priority: 8, handler: (ctx) => ctx.navigateTo('tenders') },
  { id: 'nav:meetings',      label: 'Meetings',        icon: IconCalendar,         category: 'navigation', pages: [], keywords: ['calendar', 'schedule', 'zoom'], priority: 9, handler: (ctx) => ctx.navigateTo('meetings') },
  { id: 'nav:sentry',        label: 'Sentry',          icon: IconAlertTriangle,    category: 'navigation', pages: [], keywords: ['watch', 'monitor', 'alert'], priority: 10, handler: (ctx) => ctx.navigateTo('sentry') },
  { id: 'nav:swarm',         label: 'Swarm',           icon: IconBolt,             category: 'navigation', pages: [], keywords: ['agents', 'multi-agent', 'team'], priority: 11, handler: (ctx) => ctx.navigateTo('swarm') },
  { id: 'nav:workflows',     label: 'Workflows',       icon: IconBinaryTree,       category: 'navigation', pages: [], keywords: ['automation', 'rules', 'triggers'], priority: 12, handler: (ctx) => ctx.navigateTo('workflows') },
  { id: 'nav:approvals',     label: 'Approvals',       icon: IconCheckupList,      category: 'navigation', pages: [], keywords: ['review', 'approve', 'queue'], priority: 13, handler: (ctx) => ctx.navigateTo('approvals') },
  { id: 'nav:analytics',     label: 'Analytics',       icon: IconTrendingUp,       category: 'navigation', pages: [], keywords: ['mrr', 'metrics', 'usage'], priority: 14, handler: (ctx) => ctx.navigateTo('analytics') },
  { id: 'nav:activity',      label: 'Activity',        icon: IconClock,            category: 'navigation', pages: [], keywords: ['audit', 'log', 'history'], priority: 15, handler: (ctx) => ctx.navigateTo('activity') },
  { id: 'nav:knowledge',     label: 'Knowledge',       icon: IconBook,             category: 'navigation', pages: [], keywords: ['graph', 'entities', 'memory'], priority: 16, handler: (ctx) => ctx.navigateTo('knowledge') },
  { id: 'nav:reports',       label: 'Reports',         icon: IconChartBar,         category: 'navigation', pages: [], keywords: ['export', 'pdf', 'analytics'], priority: 17, handler: (ctx) => ctx.navigateTo('reports') },
  { id: 'nav:costs',         label: 'Costs',           icon: IconCurrencyDollar,   category: 'navigation', pages: [], keywords: ['spend', 'tokens', 'billing'], priority: 18, handler: (ctx) => ctx.navigateTo('costs') },
  { id: 'nav:ad-scripts',    label: 'Ad Scripts',      icon: IconSpeakerphone,     category: 'navigation', pages: [], keywords: ['campaign', 'copy', 'ads'], priority: 19, handler: (ctx) => ctx.navigateTo('ad-scripts') },
  { id: 'nav:settings',      label: 'Settings',        icon: IconSettings,         category: 'navigation', pages: [], keywords: ['preferences', 'config'], priority: 20, handler: (ctx) => ctx.navigateTo('settings-connections') },
];

// ---------------------------------------------------------------------------
// Create commands — quick-create from anywhere
// ---------------------------------------------------------------------------

const CREATE: SummonCommand[] = [
  { id: 'create:task',    label: 'New Task',    icon: IconSubtask,      category: 'create', pages: [], keywords: ['add task', 'create task', 'todo'], priority: 0, handler: (ctx) => { ctx.navigateTo('tasks'); ctx.dispatch('bb-create', { type: 'task' }); } },
  { id: 'create:contact', label: 'New Contact', icon: IconUserPlus,     category: 'create', pages: [], keywords: ['add contact', 'add person', 'add client'], priority: 1, handler: (ctx) => { ctx.navigateTo('contacts'); ctx.dispatch('bb-create', { type: 'contact' }); } },
  { id: 'create:lead',    label: 'New Lead',    icon: IconTarget,       category: 'create', pages: [], keywords: ['add lead', 'prospect'], priority: 2, handler: (ctx) => { ctx.navigateTo('leads'); ctx.dispatch('bb-create', { type: 'lead' }); } },
  { id: 'create:invoice', label: 'New Invoice', icon: IconReceipt,      category: 'create', pages: [], keywords: ['create invoice', 'new bill'], priority: 3, handler: (ctx) => { ctx.navigateTo('invoices'); ctx.dispatch('bb-create', { type: 'invoice' }); } },
  { id: 'create:meeting', label: 'New Meeting', icon: IconCalendarPlus, category: 'create', pages: [], keywords: ['schedule meeting', 'book', 'calendar'], priority: 4, handler: (ctx) => { ctx.navigateTo('meetings'); ctx.dispatch('bb-create', { type: 'meeting' }); } },
];

// ---------------------------------------------------------------------------
// Page-specific actions — shown when on the relevant tab
// ---------------------------------------------------------------------------

const PAGE_ACTIONS: SummonCommand[] = [
  // Inbox
  { id: 'inbox:refresh',    label: 'Refresh Inbox',     icon: IconRefresh,  category: 'action', pages: ['inbox'], keywords: ['reload', 'sync'], priority: 0, handler: (ctx) => ctx.dispatch('bb-inbox-refresh') },
  { id: 'inbox:compose',    label: 'Compose Message',   icon: IconSend,     category: 'action', pages: ['inbox'], keywords: ['write', 'reply', 'email'], priority: 1, handler: (ctx) => ctx.dispatch('bb-compose') },
  { id: 'inbox:archive',    label: 'Archive Selected',  icon: IconArchive,  category: 'action', pages: ['inbox'], keywords: ['dismiss', 'clear'], priority: 2, handler: (ctx) => ctx.dispatch('bb-inbox-archive') },

  // Leads
  { id: 'leads:discover',   label: 'Discover Prospects', icon: IconSearch,  category: 'action', pages: ['leads'], keywords: ['find', 'prospect', 'outreach'], priority: 0, handler: (ctx) => ctx.dispatch('bb-leads-discover') },
  { id: 'leads:refresh',    label: 'Refresh Pipeline',   icon: IconRefresh, category: 'action', pages: ['leads'], keywords: ['reload', 'sync'], priority: 1, handler: (ctx) => ctx.dispatch('bb-leads-refresh') },
  { id: 'leads:filter',     label: 'Filter Leads',       icon: IconFilter,  category: 'action', pages: ['leads'], keywords: ['score', 'source', 'segment'], priority: 2, handler: (ctx) => ctx.dispatch('bb-leads-filter') },

  // Invoices
  { id: 'invoices:send',    label: 'Send Invoice',       icon: IconSend,     category: 'action', pages: ['invoices'], keywords: ['email', 'deliver'], priority: 0, handler: (ctx) => ctx.dispatch('bb-invoice-send') },
  { id: 'invoices:export',  label: 'Export as PDF',       icon: IconDownload, category: 'action', pages: ['invoices'], keywords: ['download', 'print'], priority: 1, handler: (ctx) => ctx.dispatch('bb-invoice-export') },

  // Contacts
  { id: 'contacts:import',  label: 'Import Contacts',    icon: IconDownload, category: 'action', pages: ['contacts'], keywords: ['csv', 'upload', 'bulk'], priority: 0, handler: (ctx) => ctx.dispatch('bb-contacts-import') },
  { id: 'contacts:merge',   label: 'Merge Duplicates',   icon: IconUsers,   category: 'action', pages: ['contacts'], keywords: ['deduplicate', 'combine'], priority: 1, handler: (ctx) => ctx.dispatch('bb-contacts-merge') },

  // Tasks
  { id: 'tasks:filter',     label: 'Filter Tasks',       icon: IconFilter,   category: 'action', pages: ['tasks'], keywords: ['priority', 'status', 'assigned'], priority: 0, handler: (ctx) => ctx.dispatch('bb-tasks-filter') },

  // Meetings
  { id: 'meetings:join',    label: 'Join Next Meeting',   icon: IconEye,     category: 'action', pages: ['meetings'], keywords: ['zoom', 'call', 'video'], priority: 0, handler: (ctx) => ctx.dispatch('bb-meetings-join') },

  // Sentry
  { id: 'sentry:refresh',   label: 'Refresh Watches',    icon: IconRefresh,  category: 'action', pages: ['sentry'], keywords: ['reload', 'scan'], priority: 0, handler: (ctx) => ctx.dispatch('bb-sentry-refresh') },

  // Analytics
  { id: 'analytics:export', label: 'Export Report',       icon: IconDownload, category: 'action', pages: ['analytics'], keywords: ['pdf', 'csv', 'download'], priority: 0, handler: (ctx) => ctx.dispatch('bb-analytics-export') },
];

// ---------------------------------------------------------------------------
// AI commands — interact with BitBit
// ---------------------------------------------------------------------------

const AI: SummonCommand[] = [
  { id: 'ai:chat',         label: 'Ask BitBit anything',        icon: IconRobot,  category: 'ai', pages: [], keywords: ['help', 'question', 'ask'], priority: 0, handler: (ctx) => ctx.openChat() },
  { id: 'ai:scan',         label: 'Scan messages',              icon: IconScan,   category: 'ai', pages: [], keywords: ['inbox scan', 'check messages', 'triage'], priority: 1, handler: (ctx) => ctx.openChat('Scan my recent messages and summarize what needs attention.') },
  { id: 'ai:summarize',    label: 'Summarize this page',        icon: IconBrain,  category: 'ai', pages: [], keywords: ['overview', 'summary', 'tldr'], priority: 2, handler: (ctx) => ctx.openChat(`Give me a summary of what's on my ${ctx.activeTab} page.`) },
  { id: 'ai:notifications',label: 'What needs my attention?',   icon: IconBell,   category: 'ai', pages: [], keywords: ['urgent', 'priority', 'todo', 'overdue'], priority: 3, handler: (ctx) => ctx.openChat('What needs my attention right now? Check overdue tasks, unread messages, and pending approvals.') },
  { id: 'ai:draft',        label: 'Draft a message',            icon: IconMail,   category: 'ai', pages: ['inbox', 'contacts', 'leads'], keywords: ['write', 'compose', 'email'], priority: 4, handler: (ctx) => ctx.openChat('Help me draft a message.') },
];

// ---------------------------------------------------------------------------
// Settings commands
// ---------------------------------------------------------------------------

const SETTINGS: SummonCommand[] = [
  { id: 'settings:connections',  label: 'Connections',  icon: IconLink,    category: 'settings', pages: [], keywords: ['api', 'integrations', 'oauth'], priority: 0, handler: (ctx) => ctx.navigateTo('settings-connections') },
  { id: 'settings:plugins',     label: 'Plugins',      icon: IconPuzzle,  category: 'settings', pages: [], keywords: ['automations', 'extensions'], priority: 1, handler: (ctx) => ctx.navigateTo('settings-automations') },
  { id: 'settings:appearance',  label: 'Appearance',   icon: IconPalette, category: 'settings', pages: [], keywords: ['theme', 'dark mode', 'colors'], priority: 2, handler: (ctx) => ctx.navigateTo('settings-appearance') },
];

// ---------------------------------------------------------------------------
// Export all
// ---------------------------------------------------------------------------

export const BUILT_IN_COMMANDS: SummonCommand[] = [
  ...NAV,
  ...CREATE,
  ...PAGE_ACTIONS,
  ...AI,
  ...SETTINGS,
];
