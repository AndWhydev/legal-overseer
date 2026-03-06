export type ChannelType = 'gmail' | 'outlook' | 'imessage' | 'calendar' | 'reminders' | 'whatsapp' | 'telegram' | 'asana' | 'calendly' | 'stripe' | 'gsc' | 'instagram'

export interface ChannelMessage {
  id: string
  channel: ChannelType
  externalId: string
  sender: string
  senderEmail?: string
  subject?: string
  body: string
  receivedAt: Date
  isActionable: boolean
  priority: 'critical' | 'high' | 'medium' | 'low'
  metadata: Record<string, unknown>
}

export interface ChannelConnection {
  id: string
  orgId: string
  channelType: ChannelType
  status: 'connected' | 'disconnected' | 'error' | 'syncing'
  lastSync: Date | null
  config: Record<string, unknown>
  messageCount: number
}

export interface SyncResult {
  channel: ChannelType
  messagesFound: number
  tasksCreated: number
  tasksUpdated: number
  errors: string[]
  duration: number
}

export interface ChannelAdapter {
  type: ChannelType
  name: string
  description: string
  icon: string
  pull: (
    config: Record<string, unknown>,
    since?: Date,
    options?: Record<string, unknown>,
  ) => Promise<ChannelMessage[]>
  isAvailable: () => Promise<boolean>
}

export interface SynthesisResult {
  messagesProcessed: number
  tasksCreated: number
  tasksUpdated: number
  errors: string[]
}
