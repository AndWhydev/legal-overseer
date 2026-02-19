import { registerAgent } from '@bitbit/core'
import type { AgentDefinition } from '@bitbit/core'

const definition: AgentDefinition = {
  type: 'client-comms',
  name: 'Client Comms',
  description:
    'Drafts email/message replies in the correct voice profile per contact. Sends automated ' +
    'status updates, distributes meeting summaries from Cluely, monitors sentiment in incoming ' +
    'messages, and manages per-client communication preferences.',
  version: '0.1.0',
  priority: 'P1',

  required_channels: ['gmail', 'outlook'],
  optional_channels: ['whatsapp', 'imessage', 'slack'],
  required_tools: [
    'search_messages',
    'search_contacts',
    'get_contact',
    'search_memory',
    'log_activity',
  ],

  default_model_tier: 'sonnet',
  default_confidence_thresholds: { act: 0.90, ask: 0.60 },
  default_schedule: { type: 'interval', interval_seconds: 600 },

  handler: '@bitbit/agent-client-comms/handler',
}

registerAgent(definition)

export { definition }
