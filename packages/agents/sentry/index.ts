import { registerAgent } from '@bitbit/core'
import type { AgentDefinition } from '@bitbit/core'

const definition: AgentDefinition = {
  type: 'sentry',
  name: 'Sentry',
  description:
    'Background monitoring daemon. Configurable watches on any channel or data source. ' +
    'Uses Gemini Flash for cheap polling. Triggers notifications or agent actions when ' +
    'conditions are met. Supports watch composition, escalation chains, and alert history.',
  version: '0.1.0',
  priority: 'P0',

  required_channels: [],
  optional_channels: ['gmail', 'outlook', 'whatsapp', 'imessage', 'asana', 'stripe'],
  required_tools: ['log_activity'],

  default_model_tier: 'haiku',
  default_confidence_thresholds: { act: 0.90, ask: 0.70 },
  default_schedule: { type: 'interval', interval_seconds: 60 },

  handler: '@bitbit/agent-sentry/handler',
}

registerAgent(definition)

export { definition }
