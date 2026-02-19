import { registerAgent } from '@bitbit/core'
import type { AgentDefinition } from '@bitbit/core'

const definition: AgentDefinition = {
  type: 'invoice-flow',
  name: 'Invoice Flow',
  description:
    'Generates branded PDF invoices from completed tasks or manual triggers. Sends via email, ' +
    'tracks payment status, sends automated reminders, and provides revenue reporting. ' +
    'Supports multiple entities, bank accounts, and payment terms.',
  version: '0.1.0',
  priority: 'P0',

  required_channels: ['gmail'],
  optional_channels: ['outlook', 'stripe'],
  required_tools: [
    'search_tasks',
    'search_contacts',
    'get_contact',
    'log_activity',
  ],

  default_model_tier: 'sonnet',
  default_confidence_thresholds: { act: 0.90, ask: 0.60 },
  default_schedule: { type: 'cron', cron_expression: '0 9 * * 1-5' }, // 9am weekdays

  handler: '@bitbit/agent-invoice-flow/handler',
}

registerAgent(definition)

export { definition }
export { handler } from './handler'
