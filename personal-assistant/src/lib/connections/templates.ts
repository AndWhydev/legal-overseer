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

/**
 * Beeper-specific connection config schema.
 * Used by the UI to render the setup form.
 */
export const beeperConfigFields = [
  { key: 'homeserver_url', label: 'Matrix Homeserver URL', required: true, type: 'url' as const, placeholder: 'https://matrix.example.com' },
  { key: 'access_token', label: 'Access Token', required: true, type: 'text' as const, placeholder: 'syt_...' },
  { key: 'user_id', label: 'Matrix User ID', required: true, type: 'text' as const, placeholder: '@user:example.com' },
  { key: 'bridge_filter', label: 'Bridge Filter (comma-separated)', required: false, type: 'text' as const, placeholder: 'imessage,whatsapp,signal' },
  { key: 'sync_limit', label: 'Max Messages Per Pull', required: false, type: 'text' as const, placeholder: '100' },
]

/**
 * iMessage (BlueBubbles) connection config schema.
 * Used by the UI to render the setup form.
 */
export const imessageConfigFields = [
  { key: 'apple_id_email', label: 'Apple ID Email', required: true, type: 'email' as const, placeholder: 'your@icloud.com' },
]
