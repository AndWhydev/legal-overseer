import { registerAgent } from '@bitbit/core'
import type { AgentDefinition } from '@bitbit/core'

const definition: AgentDefinition = {
  type: 'ai-search-optimizer',
  name: 'AI Search Optimizer',
  description:
    'Audits client visibility on AI chat engines (ChatGPT, Gemini, Perplexity, Claude). ' +
    'Generates AI-optimized content, monitors AI search rankings, produces competitor ' +
    'comparison reports, and recommends content strategies for AI discovery. ' +
    'Productizable as a $2k/month service offering.',
  version: '0.1.0',
  priority: 'P2',

  required_channels: [],
  optional_channels: [],
  required_tools: ['search_memory', 'add_memory', 'create_task', 'log_activity'],

  default_model_tier: 'sonnet',
  default_confidence_thresholds: { act: 0.75, ask: 0.50 },
  default_schedule: { type: 'cron', cron_expression: '0 6 * * 1' }, // Weekly Monday 6am

  handler: '@bitbit/agent-ai-search-optimizer/handler',
}

registerAgent(definition)

export { definition }
