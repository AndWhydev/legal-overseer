import { describe, expect, it } from 'vitest'

import {
  normalizeConnectionStatuses,
  reconcileLoadingAfterOAuthEvent,
  reconcileLoadingConnection,
} from './connections-grid'

describe('normalizeConnectionStatuses', () => {
  it('maps the real status API array shape into connection ids used by the grid', () => {
    expect(
      normalizeConnectionStatuses([
        { type: 'gmail', connected: true, connectedAt: '2026-03-08T00:00:00.000Z' },
        { type: 'calendar', connected: true },
        { type: 'outlook', connected: false },
      ]),
    ).toEqual({
      gmail: {
        connected: true,
        connectedAt: '2026-03-08T00:00:00.000Z',
      },
      'google-calendar': {
        connected: true,
      },
      outlook: {
        connected: false,
      },
    })
  })

  it('returns an empty map when the status API has no channels', () => {
    expect(normalizeConnectionStatuses([])).toEqual({})
  })
})

describe('reconcileLoadingConnection', () => {
  it('clears the loading connection once refreshed statuses confirm it connected', () => {
    expect(
      reconcileLoadingConnection('gmail', {
        gmail: { connected: true },
        outlook: { connected: false },
      }),
    ).toBeNull()
  })

  it('keeps the loading connection when refreshed statuses do not confirm success yet', () => {
    expect(
      reconcileLoadingConnection('gmail', {
        gmail: { connected: false },
      }),
    ).toBe('gmail')
  })
})

describe('reconcileLoadingAfterOAuthEvent', () => {
  it('clears loading when the popup callback reports OAuth success for the active provider', () => {
    expect(
      reconcileLoadingAfterOAuthEvent('gmail', {
        type: 'bb-connection-callback',
        kind: 'success',
        provider: 'gmail',
      }),
    ).toBeNull()
  })

  it('clears loading when the popup callback reports an OAuth error so the user can retry', () => {
    expect(
      reconcileLoadingAfterOAuthEvent('gmail', {
        type: 'bb-connection-callback',
        kind: 'error',
        error: 'User cancelled',
      }),
    ).toBeNull()
  })

  it('clears loading when the popup closes without a confirmed connection', () => {
    expect(
      reconcileLoadingAfterOAuthEvent('gmail', {
        type: 'popup_closed',
        provider: 'gmail',
      }),
    ).toBeNull()
  })

  it('does not clear a different in-flight provider on unrelated success events', () => {
    expect(
      reconcileLoadingAfterOAuthEvent('gmail', {
        type: 'bb-connection-callback',
        kind: 'success',
        provider: 'outlook',
      }),
    ).toBe('gmail')
  })
})
