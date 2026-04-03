import { describe, it, expect } from 'vitest'
import { getChannelFamily } from './use-drawer-state'

describe('getChannelFamily', () => {
  it('maps gmail to email', () => {
    expect(getChannelFamily('gmail')).toBe('email')
  })
  it('maps outlook to email', () => {
    expect(getChannelFamily('outlook')).toBe('email')
  })
  it('maps imessage to chat', () => {
    expect(getChannelFamily('imessage')).toBe('chat')
  })
  it('maps whatsapp to chat', () => {
    expect(getChannelFamily('whatsapp')).toBe('chat')
  })
  it('maps slack to chat', () => {
    expect(getChannelFamily('slack')).toBe('chat')
  })
  it('maps stripe to notification', () => {
    expect(getChannelFamily('stripe')).toBe('notification')
  })
  it('defaults unknown to notification', () => {
    expect(getChannelFamily('unknown')).toBe('notification')
  })
})
