import { describe, it, expect } from 'vitest'
import { composeCreatorStudioDeck, createDefaultCreatorStudioRequest } from './core'

describe('creator-studio core', () => {
  it('uses content-creator defaults and clamps notification length to industry max', () => {
    const base = createDefaultCreatorStudioRequest('content-creator')
    const deck = composeCreatorStudioDeck({
      ...base,
      industry: 'content-creator',
      notifications: Array.from({ length: 9 }).map((_, i) => ({
        app: 'stripe' as const,
        amount: `${100 + i}`,
        from: `user${i}@mail.com`,
      })),
    })

    expect(deck.meta.maxNotifications).toBe(6)
    expect(deck.notifications).toHaveLength(6)
    expect(deck.scene.hideSensitive).toBe(true)
  })

  it('masks sensitive text when hideSensitive is enabled', () => {
    const deck = composeCreatorStudioDeck({
      industry: 'agency',
      hideSensitive: true,
      notifications: [
        {
          app: 'paypal',
          amount: '$145',
          from: 'real.person@domain.com',
          timeAgo: '5m ago',
        },
      ],
    })

    expect(deck.notifications[0].body).not.toContain('real.person@domain.com')
    expect(deck.notifications[0].body).toContain('•')
  })

  it('falls back to an allowed app when the selected app is not allowed in an industry config', () => {
    const deck = composeCreatorStudioDeck({
      industry: 'tradie',
      notifications: [
        {
          app: 'youtube',
          amount: '$80',
          from: 'viewer',
        },
      ],
    })

    expect(deck.notifications[0].app).toBe('paypal')
  })
})

