import { createMockSupabase } from './mock-supabase'
import { createMockAnthropic } from './mock-anthropic'
import { createMockChannels } from './mock-channels'
import { createMockTools } from './mock-tools'

/**
 * Test harness that wires mock Supabase + mock Anthropic + mock channels + mock tools
 * together for comprehensive agent testing.
 *
 * Usage:
 *   const harness = createAgentHarness()
 *   harness.setTableData('watches', [{ ... }])
 *   harness.anthropic.setResponse({ text: '{"intent":"invoice"}' })
 *   const result = await runSentryTick(harness.supabase, 'org-1', 'config-1')
 */
export function createAgentHarness() {
  const { supabase, setTableData } = createMockSupabase()
  const anthropic = createMockAnthropic()
  const channels = createMockChannels()
  const tools = createMockTools()

  return {
    supabase,
    setTableData,
    anthropic,
    channels,
    tools,

    /**
     * Convenience: seed common tables for agent testing.
     */
    seedOrg(orgId = 'org-awu') {
      setTableData('organizations', [{ id: orgId, name: 'Andy Wilson Unlimited', slug: 'awu' }])
      setTableData('agent_configs', [{ id: 'agent-1', org_id: orgId, name: 'Test Agent', type: 'sentry' }])
      return this
    },
  }
}

export type AgentHarness = ReturnType<typeof createAgentHarness>
