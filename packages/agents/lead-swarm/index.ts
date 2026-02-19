import { registerAgent } from '@bitbit/core'
import type { AgentDefinition } from '@bitbit/core'

const definition: AgentDefinition = {
  type: 'lead-swarm',
  name: 'Lead Swarm',
  description:
    'Monitors all inbound channels for new leads. Classifies, qualifies, auto-responds, ' +
    'books Calendly slots, creates pipeline tasks, and escalates high-value opportunities.',
  version: '0.1.0',
  priority: 'P0',

  required_channels: ['gmail', 'outlook'],
  optional_channels: ['whatsapp', 'facebook', 'instagram', 'calendly'],
  required_tools: [
    'search_messages',
    'create_task',
    'search_contacts',
    'log_activity',
    'add_memory',
  ],

  default_model_tier: 'haiku',
  default_confidence_thresholds: { act: 0.85, ask: 0.55 },
  default_schedule: { type: 'interval', interval_seconds: 120 },

  handler: '@bitbit/agent-lead-swarm/handler',
}

registerAgent(definition)

export { definition }
export { handler } from './handler'
