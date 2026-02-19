import { registerAgent } from '@bitbit/core'
import type { AgentDefinition } from '@bitbit/core'

const definition: AgentDefinition = {
  type: 'tender-hunter',
  name: 'Tender Hunter',
  description:
    'Monitors government tender portals (AusTender, QLD QTenders, NSW eTendering) for ' +
    'opportunities matching agency capabilities. Scores tender fit, extracts requirements, ' +
    'drafts response documents, compiles compliance documentation, and tracks submission deadlines.',
  version: '0.1.0',
  priority: 'P3',

  required_channels: [],
  optional_channels: ['gmail'],
  required_tools: ['create_task', 'search_memory', 'add_memory', 'log_activity'],

  default_model_tier: 'sonnet',
  default_confidence_thresholds: { act: 0.70, ask: 0.40 },
  default_schedule: { type: 'cron', cron_expression: '0 7 * * 1,4' }, // Mon + Thu mornings

  handler: '@bitbit/agent-tender-hunter/handler',
}

registerAgent(definition)

export { definition }
