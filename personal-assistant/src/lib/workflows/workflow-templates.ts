import type { WorkflowRule } from './workflow-rule-types'

// ---------------------------------------------------------------------------
// Starter workflow templates for common automations
// ---------------------------------------------------------------------------

export interface WorkflowTemplate {
  id: string
  label: string
  description: string
  /** Natural language the user would type */
  naturalLanguage: string
  /** Pre-parsed rule structure */
  rule: Partial<WorkflowRule>
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'new_lead_research',
    label: 'New Lead Research',
    description: 'When a new lead comes in, research their company and draft an intro email',
    naturalLanguage: 'When a new lead comes in, research their company and draft an intro email',
    rule: {
      name: 'New Lead Research & Outreach',
      description: 'When a new lead comes in, research their company and draft an intro email',
      trigger: {
        type: 'event',
        event: 'new_lead',
      },
      conditions: [],
      actions: [
        {
          step_id: 'research',
          name: 'Research lead company',
          tool_group: 'web',
          tool_name: 'web_search',
          parameters: { query: '{{lead.company_name}} company overview' },
          on_failure: 'skip',
        },
        {
          step_id: 'draft_email',
          name: 'Draft intro email',
          tool_group: 'comms',
          tool_name: 'send_email',
          parameters: {
            to: '{{lead.email}}',
            subject: 'Introduction from {{org.name}}',
            draft: true,
          },
          delay_seconds: 5,
          on_failure: 'abort',
        },
      ],
      enabled: true,
    },
  },
  {
    id: 'overdue_invoice_reminder',
    label: 'Overdue Invoice Reminder',
    description: 'When an invoice is overdue by 7 days, send a gentle payment reminder',
    naturalLanguage: 'When an invoice is overdue by 7 days, send a gentle payment reminder',
    rule: {
      name: 'Overdue Invoice Reminder',
      description: 'When an invoice is overdue by 7 days, send a gentle payment reminder',
      trigger: {
        type: 'event',
        event: 'invoice_overdue',
      },
      conditions: [
        {
          field: 'days_overdue',
          operator: 'gt',
          value: 7,
        },
      ],
      actions: [
        {
          step_id: 'send_reminder',
          name: 'Send payment reminder',
          tool_group: 'comms',
          tool_name: 'send_email',
          parameters: {
            to: '{{invoice.contact_email}}',
            subject: 'Friendly reminder: Invoice #{{invoice.number}}',
            template: 'payment_reminder',
          },
          on_failure: 'abort',
        },
      ],
      enabled: true,
    },
  },
  {
    id: 'daily_summary_digest',
    label: 'Daily Summary Digest',
    description: 'Every morning at 8am, summarize yesterday\'s activity and email it to me',
    naturalLanguage: 'Every morning at 8am, summarize yesterday\'s activity and email it to me',
    rule: {
      name: 'Daily Summary Digest',
      description: 'Every morning at 8am, summarize yesterday\'s activity and email it to me',
      trigger: {
        type: 'schedule',
        schedule: { cron: '08:00' },
      },
      conditions: [],
      actions: [
        {
          step_id: 'search_activity',
          name: 'Search yesterday\'s activity',
          tool_group: 'core',
          tool_name: 'search_tasks',
          parameters: { timeframe: 'yesterday', status: 'all' },
          on_failure: 'skip',
        },
        {
          step_id: 'send_digest',
          name: 'Send digest email',
          tool_group: 'comms',
          tool_name: 'send_email',
          parameters: {
            to: '{{org.owner_email}}',
            subject: 'Daily Summary - {{date}}',
            template: 'daily_digest',
          },
          delay_seconds: 2,
          on_failure: 'abort',
        },
      ],
      enabled: true,
    },
  },
]
