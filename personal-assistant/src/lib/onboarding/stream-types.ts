export type OnboardingStreamEvent =
  | { type: 'narration'; message: string; id: string }
  | { type: 'discovery'; category: 'contact' | 'project' | 'financial'; data: DiscoveryItem }
  | { type: 'progress'; phase: string; percent: number }
  | { type: 'reveal'; worldModel: RevealWorldModel; stats: RevealStats }
  | { type: 'agents'; activated: string[]; reasons: Record<string, string> }
  | { type: 'complete'; threadId: string }
  | { type: 'error'; message: string; recoverable: boolean }

export interface DiscoveryItem {
  name: string
  detail: string
}

export interface RevealStats {
  totalMessages: number
  peopleFound: number
  projectsFound: number
  financialsFound: number
  channelsScanned: string[]
  durationMs: number
}

export interface RevealWorldModel {
  user: { name: string; emails: string[]; businessName: string; role: string }
  people: RevealPerson[]
  projects: RevealProject[]
  financials: RevealFinancial[]
}

export interface RevealPerson {
  id: string
  name: string
  company: string
  role: string
  relationship: 'client' | 'colleague' | 'vendor' | 'personal' | 'employer' | 'unknown'
  messageCount: number
  frequency: 'daily' | 'weekly' | 'monthly' | 'rare'
  lastInteraction: string
  outstandingItems: string[]
  emails: string[]
}

export interface RevealProject {
  id: string
  name: string
  status: 'active' | 'stalled' | 'completed'
  people: string[]
  urls: string[]
  description: string
  deadlines: string[]
}

export interface RevealFinancial {
  id: string
  type: 'receivable' | 'payable' | 'subscription'
  entity: string
  amount: string
  currency: string
  dueDate: string
  status: string
}

export interface UserReply {
  message: string
  timestamp: number
}
