export type IntegrationStatus = 'available' | 'connected' | 'coming_soon'
export type IntegrationCategory = 'communication' | 'productivity' | 'analytics' | 'finance'
export type AuthMethod = 'oauth' | 'api_key' | 'guided'

export interface Integration {
  id: string
  name: string
  description: string
  icon: string
  category: IntegrationCategory
  status: IntegrationStatus
  color: string
  authMethod: AuthMethod
}

export const AVAILABLE_INTEGRATIONS: Integration[] = [
  // Communication
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Read, draft, and send emails',
    icon: 'Mail',
    category: 'communication',
    status: 'available',
    color: '#EA4335',
    authMethod: 'oauth',
  },
  {
    id: 'resend',
    name: 'Resend',
    description: 'Send automated emails',
    icon: 'Send',
    category: 'communication',
    status: 'available',
    color: '#000000',
    authMethod: 'api_key',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Message your team on Slack',
    icon: 'MessageSquare',
    category: 'communication',
    status: 'coming_soon',
    color: '#4A154B',
    authMethod: 'oauth',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    description: 'Read and send Outlook emails',
    icon: 'Mail',
    category: 'communication',
    status: 'available',
    color: '#0078D4',
    authMethod: 'oauth',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'Message clients on WhatsApp',
    icon: 'Phone',
    category: 'communication',
    status: 'available',
    color: '#25D366',
    authMethod: 'guided',
  },
  {
    id: 'imessage',
    name: 'iMessage',
    description: 'Send and receive iMessages',
    icon: 'MessageCircle',
    category: 'communication',
    status: 'coming_soon',
    color: '#34C759',
    authMethod: 'guided',
  },

  // Productivity
  {
    id: 'asana',
    name: 'Asana',
    description: 'Sync tasks and projects',
    icon: 'CheckSquare',
    category: 'productivity',
    status: 'available',
    color: '#F06A6A',
    authMethod: 'oauth',
  },
  {
    id: 'calendly',
    name: 'Calendly',
    description: 'Manage scheduling and bookings',
    icon: 'CalendarClock',
    category: 'productivity',
    status: 'available',
    color: '#006BFF',
    authMethod: 'oauth',
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    description: 'Manage your calendar',
    icon: 'Calendar',
    category: 'productivity',
    status: 'available',
    color: '#4285F4',
    authMethod: 'oauth',
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Connect your docs and notes',
    icon: 'FileText',
    category: 'productivity',
    status: 'coming_soon',
    color: '#FFFFFF',
    authMethod: 'oauth',
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Manage contacts and deals',
    icon: 'Users',
    category: 'productivity',
    status: 'coming_soon',
    color: '#FF7A59',
    authMethod: 'oauth',
  },

  // Analytics
  {
    id: 'google-analytics',
    name: 'Google Analytics',
    description: 'Track your website traffic',
    icon: 'BarChart3',
    category: 'analytics',
    status: 'coming_soon',
    color: '#F9AB00',
    authMethod: 'oauth',
  },

  // Finance
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Track payments and invoices',
    icon: 'CreditCard',
    category: 'finance',
    status: 'available',
    color: '#635BFF',
    authMethod: 'api_key',
  },
]

export const CATEGORY_LABELS: Record<IntegrationCategory | 'all', string> = {
  all: 'All',
  communication: 'Communication',
  productivity: 'Productivity',
  analytics: 'Analytics',
  finance: 'Finance',
}
