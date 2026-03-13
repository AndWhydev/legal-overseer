import { describe, expect, it } from 'vitest'

import { resolveChannelIcon } from './channel-icon'

describe('resolveChannelIcon', () => {
  it('returns null instead of throwing when channel is missing', () => {
    expect(() => resolveChannelIcon(undefined)).not.toThrow()
    expect(resolveChannelIcon(undefined)).toBeNull()
  })

  it('normalizes mixed-case channel names', () => {
    expect(resolveChannelIcon('WhAtSaPp')?.title).toMatch(/whatsapp/i)
  })
})
