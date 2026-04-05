export type TransportType = 'poll' | 'bridge' | 'webhook'
export type PayloadType = 'message' | 'event' | 'record' | 'signal'
export type Capability = 'pull' | 'push' | 'send' | 'webhook' | 'search' | 'delete'
export type ConnectionStatus = 'pending' | 'connected' | 'error' | 'disabled'
export type TemplateSlug = 'email' | 'crm' | 'task-tracker' | 'webhook' | 'custom'

export interface Envelope {
  connection_id: string
  org_id: string
  provider: string
  transport: TransportType
  dedup_key: string
  timestamp: string
  payload: {
    type: PayloadType
    sender?: { name?: string; email?: string; phone?: string }
    subject?: string
    body: string
    body_html?: string
    attachments?: { name: string; url: string; mime: string }[]
    metadata?: Record<string, unknown>
  }
}

export interface OrgConnection {
  id: string
  org_id: string
  provider: string
  display_name: string
  transport: TransportType
  capabilities: Capability[]
  status: ConnectionStatus
  template: TemplateSlug | null
  bridge_token: string | null
  webhook_secret: string | null
  poll_interval: number | null
  poll_cursor: string | null
  last_sync_at: string | null
  last_error: string | null
  message_count: number
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface ProviderPlugin {
  id: string
  name: string
  description: string
  category: 'communication' | 'productivity' | 'finance' | 'custom'
  icon?: string
  auth: { method: 'oauth' | 'api_key' | 'bridge' | 'guided' }
  defaultTransport: TransportType
  capabilities: Capability[]
  comingSoon?: boolean
  pull?: (connection: OrgConnection, since?: Date) => Promise<Envelope[]>
  send?: (connection: OrgConnection, envelope: Envelope) => Promise<void>
  webhookParse?: (req: Request, connection: OrgConnection) => Promise<Envelope[]>
  healthCheck?: (connection: OrgConnection) => Promise<boolean>
}

export interface ConnectionTemplate {
  slug: TemplateSlug
  name: string
  description: string
  defaultTransport: TransportType
  fields: { key: string; label: string; required: boolean; type: 'text' | 'email' | 'url' }[]
}

export interface SyncLogEntry {
  id: string
  connection_id: string
  status: 'success' | 'error' | 'partial'
  messages_found: number
  messages_inserted: number
  duplicates: number
  error_message: string | null
  duration_ms: number | null
  created_at: string
}
