/**
 * Widget registry — maps widget IDs to metadata for dynamic command centre rendering.
 * Each industry pack declares which widgets to show and in what order.
 */

export type WidgetId =
  | 'kpi-summary'
  | 'pending-approvals'
  | 'todays-priorities'
  | 'hot-leads'
  | 'overdue-tasks'
  | 'agent-activity'
  | 'channel-activity'
  | 'todays-schedule'
  | 'todays-jobs'
  | 'outstanding-quotes'
  | 'revenue-week'
  | 'unread-messages'

export type QuickActionId =
  | 'approve-next'
  | 'new-invoice'
  | 'open-inbox'
  | 'dismiss-top'
  | 'new-quote'

export interface WidgetMeta {
  label: string
  component: string
  industries: string[] | 'all'
  size: 'sm' | 'md' | 'lg'
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetMeta> = {
  'kpi-summary': {
    label: 'KPI Summary',
    component: 'kpi-summary-widget',
    industries: 'all',
    size: 'lg',
  },
  'pending-approvals': {
    label: 'Action Required',
    component: 'pending-approvals-widget',
    industries: 'all',
    size: 'lg',
  },
  'todays-priorities': {
    label: "Today's Priorities",
    component: 'todays-priorities-widget',
    industries: 'all',
    size: 'sm',
  },
  'hot-leads': {
    label: 'Hot Leads',
    component: 'hot-leads-widget',
    industries: ['agency'],
    size: 'sm',
  },
  'overdue-tasks': {
    label: 'Overdue Tasks',
    component: 'overdue-tasks-widget',
    industries: 'all',
    size: 'sm',
  },
  'agent-activity': {
    label: 'Agent Activity',
    component: 'agent-activity-widget',
    industries: 'all',
    size: 'sm',
  },
  'channel-activity': {
    label: 'Recent Channel Activity',
    component: 'channel-activity-widget',
    industries: 'all',
    size: 'lg',
  },
  'todays-jobs': {
    label: "Today's Jobs",
    component: 'todays-jobs-widget',
    industries: ['tradie'],
    size: 'md',
  },
  'outstanding-quotes': {
    label: 'Outstanding Quotes',
    component: 'outstanding-quotes-widget',
    industries: ['tradie'],
    size: 'sm',
  },
  'revenue-week': {
    label: 'Revenue This Week',
    component: 'revenue-week-widget',
    industries: 'all',
    size: 'sm',
  },
  'unread-messages': {
    label: 'Unread Messages',
    component: 'unread-messages-widget',
    industries: 'all',
    size: 'sm',
  },
  'todays-schedule': {
    label: "Today's Schedule",
    component: 'todays-schedule-widget',
    industries: 'all',
    size: 'sm',
  },
}

/** Default widget list when no pack config is provided — matches the original full command centre. */
export const DEFAULT_WIDGETS: WidgetId[] = [
  'kpi-summary',
  'pending-approvals',
  'todays-priorities',
  'agent-activity',
  'hot-leads',
  'todays-schedule',
  'channel-activity',
]

export const DEFAULT_QUICK_ACTIONS: QuickActionId[] = [
  'approve-next',
  'new-invoice',
  'open-inbox',
  'dismiss-top',
]
