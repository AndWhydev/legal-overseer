import { registerAgent } from '@bitbit/core'
import type { AgentDefinition } from '@bitbit/core'

const definition: AgentDefinition = {
  type: 'proposal-bot',
  name: 'Proposal Bot',
  description:
    'Generates scope documents from brief inputs or Cluely call transcripts. Creates tiered ' +
    'pricing structures, renders branded PDF proposals, tracks proposal lifecycle (sent → viewed → ' +
    'accepted/declined), and runs follow-up sequences. Includes NDA and contract generation.',
  version: '0.1.0',
  priority: 'P1',

  required_channels: ['gmail'],
  optional_channels: ['outlook', 'calendly'],
  required_tools: [
    'search_contacts',
    'get_contact',
    'search_memory',
    'create_task',
    'log_activity',
  ],

  default_model_tier: 'opus',
  default_confidence_thresholds: { act: 0.95, ask: 0.70 },
  default_schedule: { type: 'cron', cron_expression: '0 8 * * 1-5' },

  handler: '@bitbit/agent-proposal-bot/handler',
}

registerAgent(definition)

export { definition }
