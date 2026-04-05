import type { ConnectionTemplate } from './types'

export const connectionTemplates: ConnectionTemplate[] = [
  {
    slug: 'email',
    name: 'Email Provider',
    description: 'Connect an email service that sends/receives messages',
    defaultTransport: 'bridge',
    fields: [
      { key: 'account_email', label: 'Account Email', required: true, type: 'email' },
    ],
  },
  {
    slug: 'crm',
    name: 'CRM',
    description: 'Connect a customer relationship management tool',
    defaultTransport: 'bridge',
    fields: [
      { key: 'base_url', label: 'API Base URL', required: true, type: 'url' },
    ],
  },
  {
    slug: 'task-tracker',
    name: 'Task Tracker',
    description: 'Connect a project or task management tool',
    defaultTransport: 'bridge',
    fields: [
      { key: 'project_id', label: 'Project ID', required: false, type: 'text' },
    ],
  },
  {
    slug: 'webhook',
    name: 'Webhook Receiver',
    description: 'Receive events via HTTP POST with signature verification',
    defaultTransport: 'webhook',
    fields: [],
  },
  {
    slug: 'custom',
    name: 'Custom / Raw',
    description: 'Connect any data source — you define the envelope shape',
    defaultTransport: 'bridge',
    fields: [],
  },
]
