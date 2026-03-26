import { describe, expect, it } from 'vitest'

import { buildDashboardNotifications } from './build-dashboard-notifications'

describe('buildDashboardNotifications', () => {
  it('collapses duplicate lead notifications with the same visible copy on the same day', () => {
    const items = buildDashboardNotifications({
      approvals: [],
      leads: [
        {
          id: 'lead-1',
          source_channel: 'prospect_discovery',
          metadata: {},
          created_at: '2026-03-09T09:00:00.000Z',
        },
        {
          id: 'lead-2',
          source_channel: 'prospect_discovery',
          metadata: {},
          created_at: '2026-03-09T12:00:00.000Z',
        },
      ],
      invoices: [],
    })

    expect(items).toHaveLength(1)
    expect(items[0].description).toBe('Someone via Prospect Discovery')
    expect(items[0].id).toBe('lead-lead-2')
  })

  it('keeps distinct notification copy separate and sorts newest first', () => {
    const items = buildDashboardNotifications({
      approvals: [{ id: 'approval-1', created_at: '2026-03-08T08:00:00.000Z' }],
      leads: [
        {
          id: 'lead-1',
          source_channel: 'gmail',
          metadata: { name: 'Acme Co' },
          created_at: '2026-03-10T09:00:00.000Z',
        },
      ],
      invoices: [{ id: 'invoice-1', invoice_number: 'INV-100', created_at: '2026-03-09T08:00:00.000Z' }],
    })

    expect(items.map((item) => item.type)).toEqual(['lead', 'invoice', 'approval'])
  })
})
