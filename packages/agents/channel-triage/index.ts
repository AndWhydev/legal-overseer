import { registerAgent } from '@bitbit/core'
import type { AgentDefinition } from '@bitbit/core'

const definition: AgentDefinition = {
  type: 'channel-triage',
  name: 'Channel Triage',
  description:
    'Pulls messages from all connected channels, classifies by actionability and priority, ' +
    'deduplicates cross-channel topics, resolves entities to known contacts, auto-creates ' +
    'tasks for actionable items, and generates daily/weekly digests.',
  version: '0.1.0',
  priority: 'P1',

  required_channels: ['gmail', 'outlook'],
  optional_channels: ['imessage', 'whatsapp', 'asana', 'clickup', 'slack', 'facebook', 'instagram'],
  required_tools: [
    'sync_channels',
    'search_messages',
    'create_task',
    'search_contacts',
    'log_activity',
  ],

  default_model_tier: 'haiku',
  default_confidence_thresholds: { act: 0.80, ask: 0.50 },
  default_schedule: { type: 'interval', interval_seconds: 300 },

  handler: '@bitbit/agent-channel-triage/handler',
}

registerAgent(definition)

export { definition }
