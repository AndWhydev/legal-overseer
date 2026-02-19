import { registerAgent } from '@bitbit/core'
import type { AgentDefinition } from '@bitbit/core'

const definition: AgentDefinition = {
  type: 'ad-script-gen',
  name: 'Ad Script Generator',
  description:
    'Ingests offer packages and competitor ad research to generate video scripts with hook ' +
    'variations. Outputs platform-specific formats (Reels 15s, TikTok 30s, YouTube Shorts 60s). ' +
    'Generates A/B variants, storyboards, and integrates with AI video assembly tools.',
  version: '0.1.0',
  priority: 'P2',

  required_channels: [],
  optional_channels: [],
  required_tools: ['search_memory', 'log_activity'],

  default_model_tier: 'sonnet',
  default_confidence_thresholds: { act: 0.70, ask: 0.40 },
  default_schedule: { type: 'cron', cron_expression: '0 7 * * 1' }, // Monday mornings

  handler: '@bitbit/agent-ad-script-gen/handler',
}

registerAgent(definition)

export { definition }
