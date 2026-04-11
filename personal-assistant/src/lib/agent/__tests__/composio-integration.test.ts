import { describe, it, expect } from 'vitest'
import { TOOL_GROUPS, getAgentTools, type ToolGroup } from '../tools'

describe('composio tool group integration', () => {
  it('composio is a registered tool group', () => {
    expect(TOOL_GROUPS.composio).toBeDefined()
    expect(TOOL_GROUPS.composio.id).toBe('composio')
  })

  it('composio group contains the 3 meta-tools', () => {
    const tools = TOOL_GROUPS.composio.tools
    expect(tools).toContain('composio_list_apps')
    expect(tools).toContain('composio_list_actions')
    expect(tools).toContain('composio_execute')
    expect(tools).toContain('composio_connect_app')
    expect(tools.length).toBe(4)
  })

  it('composio group has descriptive metadata', () => {
    expect(TOOL_GROUPS.composio.label).toBeTruthy()
    expect(TOOL_GROUPS.composio.description).toBeTruthy()
    expect(TOOL_GROUPS.composio.description.toLowerCase()).toContain('integration')
  })

  it('getAgentTools returns composio tools when group is selected', () => {
    const tools = getAgentTools(['composio' as ToolGroup])
    const composioTools = tools.filter(t => t.name.startsWith('composio_'))
    expect(composioTools.length).toBe(4)
  })

  it('getAgentTools excludes composio tools when group is not selected', () => {
    const tools = getAgentTools(['memory'])
    const composioTools = tools.filter(t => t.name.startsWith('composio_'))
    expect(composioTools.length).toBe(0)
  })

  it('getAgentTools with no args returns all tools including composio', () => {
    const tools = getAgentTools()
    const composioTools = tools.filter(t => t.name.startsWith('composio_'))
    expect(composioTools.length).toBe(4)
  })

  it('ToolGroup type includes composio', () => {
    const group: ToolGroup = 'composio'
    expect(group).toBe('composio')
  })
})
