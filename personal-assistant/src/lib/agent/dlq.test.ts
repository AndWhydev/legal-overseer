import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeToDeadLetterQueue } from './dlq'

const mockInsert = vi.fn().mockReturnValue({ error: null })
const mockSupabase = { from: vi.fn().mockReturnValue({ insert: mockInsert }) } as any

describe('writeToDeadLetterQueue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts a dead letter entry with correct fields', async () => {
    await writeToDeadLetterQueue(mockSupabase, {
      orgId: 'org-1',
      agentType: 'invoice-flow',
      agentConfigId: 'config-1',
      agentRunId: 'run-1',
      errorMessage: 'API rate limit exceeded',
      errorStack: 'Error: at line 42',
      payload: { invoiceId: 'inv-1' },
    })
    expect(mockSupabase.from).toHaveBeenCalledWith('dead_letter_queue')
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      org_id: 'org-1',
      agent_type: 'invoice-flow',
      agent_config_id: 'config-1',
      agent_run_id: 'run-1',
      error_message: 'API rate limit exceeded',
      error_stack: 'Error: at line 42',
      payload: { invoiceId: 'inv-1' },
    }))
  })

  it('truncates error_message to 10000 chars', async () => {
    await writeToDeadLetterQueue(mockSupabase, {
      orgId: 'org-1',
      agentType: 'test',
      errorMessage: 'x'.repeat(20000),
    })
    const insertArg = mockInsert.mock.calls[0][0]
    expect(insertArg.error_message.length).toBeLessThanOrEqual(10000)
  })

  it('does not throw when insert fails', async () => {
    mockInsert.mockReturnValueOnce({ error: new Error('db error') })
    await expect(
      writeToDeadLetterQueue(mockSupabase, { orgId: 'org-1', agentType: 'test', errorMessage: 'fail' })
    ).resolves.not.toThrow()
  })

  it('handles optional fields gracefully', async () => {
    await writeToDeadLetterQueue(mockSupabase, {
      orgId: 'org-1',
      agentType: 'test',
      errorMessage: 'err',
    })
    const insertArg = mockInsert.mock.calls[0][0]
    expect(insertArg.agent_config_id).toBeNull()
    expect(insertArg.agent_run_id).toBeNull()
    expect(insertArg.error_stack).toBeNull()
    expect(insertArg.payload).toBeNull()
  })
})
