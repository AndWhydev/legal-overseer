import { registerAgent } from '@bitbit/core'
import type { AgentDefinition } from '@bitbit/core'

const definition: AgentDefinition = {
  type: 'client-onboarding',
  name: 'Client Onboarding',
  description:
    'Triggered on deal acceptance. Auto-creates Asana project from template, sends welcome ' +
    'email package, requests access credentials (hosting, DNS, CMS, analytics, social), sets ' +
    'up GSC/GA access, creates Google Drive folder structure, schedules kickoff call, and ' +
    'tracks onboarding completion checklist.',
  version: '0.1.0',
  priority: 'P2',

  required_channels: ['gmail', 'asana'],
  optional_channels: ['outlook', 'calendly', 'slack'],
  required_tools: [
    'create_task',
    'search_contacts',
    'get_contact',
    'log_activity',
    'schedule_event',
  ],

  default_model_tier: 'sonnet',
  default_confidence_thresholds: { act: 0.85, ask: 0.55 },
  default_schedule: { type: 'continuous' },

  handler: '@bitbit/agent-client-onboarding/handler',
}

registerAgent(definition)

export { definition }
