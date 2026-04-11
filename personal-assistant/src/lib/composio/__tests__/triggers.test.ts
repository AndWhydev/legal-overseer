import { describe, it, expect } from 'vitest'
import { TRIGGER_TYPES } from '../triggers'

describe('composio/triggers', () => {
  describe('TRIGGER_TYPES', () => {
    it('defines trigger for gmail', () => {
      expect(TRIGGER_TYPES.gmail).toBe('GMAIL_NEW_EMAIL')
    })

    it('defines trigger for slack', () => {
      expect(TRIGGER_TYPES.slack).toBe('SLACK_NEW_MESSAGE')
    })

    it('defines trigger for stripe', () => {
      expect(TRIGGER_TYPES.stripe).toBe('STRIPE_PAYMENT_RECEIVED')
    })

    it('defines trigger for calendar', () => {
      expect(TRIGGER_TYPES.calendar).toBe('GOOGLECALENDAR_EVENT_CREATED')
    })

    it('defines trigger for asana', () => {
      expect(TRIGGER_TYPES.asana).toBe('ASANA_TASK_CREATED')
    })

    it('does not define trigger for channels without real-time support', () => {
      expect(TRIGGER_TYPES.xero).toBeUndefined()
      expect(TRIGGER_TYPES.wordpress).toBeUndefined()
    })
  })
})
