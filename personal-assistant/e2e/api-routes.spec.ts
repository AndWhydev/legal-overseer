// e2e/api-routes.spec.ts
import { test, expect } from '@playwright/test'
import { ensureAuthenticated, AUTH_SKIP_REASON } from './helpers'

test.describe('Health & Monitoring Endpoints', () => {
  test('GET /api/health returns 200 with status', async ({ request }) => {
    const response = await request.get('/api/health')
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty('status')
  })

  test('GET /api/monitoring/health returns 200', async ({ request }) => {
    const response = await request.get('/api/monitoring/health')
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body).toHaveProperty('status')
  })
})

test.describe('Cron Route Auth Enforcement', () => {
  const cronRoutes = [
    '/api/cron/daily-digest',
    '/api/cron/weekly-report',
    '/api/cron/monthly-report',
    '/api/cron/morning-briefing',
    '/api/cron/proactive-alerts',
    '/api/cron/scheduler',
    '/api/cron/token-refresh',
    '/api/cron/consolidation',
    '/api/cron/sentry',
    '/api/cron/triage',
    '/api/cron/channel-sync',
    '/api/cron/entity-profile-refresh',
  ]

  for (const route of cronRoutes) {
    test(`${route} rejects requests without CRON_SECRET`, async ({ request }) => {
      const response = await request.get(route)
      // Should return 401 or 403 without the secret header
      expect([401, 403]).toContain(response.status())
    })
  }
})

test.describe('Admin DLQ Endpoint', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
  })

  test('GET /api/admin/dlq returns 401 without auth', async ({ request }) => {
    const response = await request.get('/api/admin/dlq')
    expect([401, 503]).toContain(response.status())
  })
})

test.describe('Admin DLQ Endpoint (authenticated)', () => {
  test('GET /api/admin/dlq returns entries array', async ({ page, request }) => {
    const authenticated = await ensureAuthenticated(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)

    // Use the page's auth cookies for the API request
    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const response = await request.get('/api/admin/dlq', {
      headers: { Cookie: cookieHeader },
    })

    // May return 200 (with data) or 503 (Supabase not configured)
    if (response.status() === 200) {
      const body = await response.json()
      expect(body).toHaveProperty('entries')
      expect(body).toHaveProperty('count')
      expect(Array.isArray(body.entries)).toBeTruthy()
    } else {
      expect([503]).toContain(response.status())
    }
  })
})

test.describe('Dashboard Stats API', () => {
  test('GET /api/dashboard/stats returns KPI data when authenticated', async ({ page, request }) => {
    const authenticated = await ensureAuthenticated(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const response = await request.get('/api/dashboard/stats', {
      headers: { Cookie: cookieHeader },
    })

    if (response.status() === 200) {
      const body = await response.json()
      // Should have KPI fields
      expect(body).toHaveProperty('activeTasks')
      expect(body).toHaveProperty('totalRevenue')
      expect(body).toHaveProperty('agentRunsToday')
      expect(body).toHaveProperty('activeContacts')
    } else {
      // 401 or 503 are acceptable
      expect([401, 503]).toContain(response.status())
    }
  })

  test.describe('unauthenticated', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('GET /api/dashboard/stats returns 401 without auth', async ({ request }) => {
      const response = await request.get('/api/dashboard/stats')
      expect([401, 503]).toContain(response.status())
    })
  })
})

test.describe('Webhook Auth Enforcement', () => {
  test.use({
    storageState: { cookies: [], origins: [] },
  })

  test('POST /api/webhooks/stripe rejects without signature', async ({ request }) => {
    const response = await request.post('/api/webhooks/stripe', {
      data: { type: 'invoice.paid', data: {} },
    })
    expect([400, 401, 403]).toContain(response.status())
  })

  test('POST /api/webhooks/email-command rejects without auth', async ({ request }) => {
    const response = await request.post('/api/webhooks/email-command', {
      data: { from: 'test@example.com', subject: 'test', body: 'hello' },
    })
    expect([400, 401, 403]).toContain(response.status())
  })

  test('POST /api/webhooks/sms rejects without valid payload', async ({ request }) => {
    const response = await request.post('/api/webhooks/sms', {
      data: {},
    })
    // Should not return 200 for empty/invalid payload
    expect([400, 401, 403, 500]).toContain(response.status())
  })
})

test.describe('Tasks API CRUD', () => {
  test.describe('unauthenticated', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('GET /api/tasks returns 401 without auth', async ({ request }) => {
      const response = await request.get('/api/tasks')
      expect([401, 503]).toContain(response.status())
    })

    test('POST /api/tasks returns 401 without auth', async ({ request }) => {
      const response = await request.post('/api/tasks', {
        data: { title: 'Test Task', column_id: 'fake-id' },
      })
      expect([401, 503]).toContain(response.status())
    })
  })

  test('authenticated GET /api/tasks returns tasks array', async ({ page, request }) => {
    const authenticated = await ensureAuthenticated(page, '/dashboard')
    test.skip(!authenticated, AUTH_SKIP_REASON)

    const cookies = await page.context().cookies()
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ')

    const response = await request.get('/api/tasks', {
      headers: { Cookie: cookieHeader },
    })

    if (response.status() === 200) {
      const body = await response.json()
      expect(Array.isArray(body) || body.tasks !== undefined).toBeTruthy()
    } else {
      expect([401, 503]).toContain(response.status())
    }
  })
})
