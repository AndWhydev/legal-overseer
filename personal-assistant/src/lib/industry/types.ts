import type { UIComposition } from '@/lib/modules/registry'

export interface IndustryPack {
  id: string
  label: string
  description: string
  icon: string

  modules: string[]
  defaultAgents: string[]
  availableAgents: string[]

  persona: {
    name: string
    context: string
    systemPromptSuffix: string
  }

  labelOverrides: Record<string, string>

  tierModules: Record<string, string[] | 'all'>

  compositions: {
    essential: Partial<UIComposition>
    full: Partial<UIComposition>
  }

  kanbanDefaults?: Array<{ title: string; color: string }>

  commandCenter?: {
    widgets: string[]
    quickActions: string[]
  }

  planLimits?: Record<string, {
    maxUsers: number
    maxChannels: number
    tokenBudget: number
  }>
}
