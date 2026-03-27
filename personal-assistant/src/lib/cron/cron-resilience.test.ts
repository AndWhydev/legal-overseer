/**
 * Cron Route Resilience Tests
 *
 * Tests that cron routes handle failures gracefully:
 * - Unauthorized requests rejected
 * - Handler exceptions caught and returned as 500
 * - Service client initialization failures handled
 * - Timing information included in responses
 * - DB errors during handler execution
 * - Rate limit scenarios
 * - Timeout-like behavior
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))

// We need to reset the service client singleton between tests
let serviceClientModule: any

beforeEach(async () => {
  vi.clearAllMocks()
  // Reset singleton by re-importing with cleared module cache
  vi.resetModules()
  serviceClientModule = await import('./cron-guard')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function makeRequest(url: string, authHeader?: string): Request {
  const headers: Record<string, string> = {}
  if (authHeader) {
    headers['Authorization'] = authHeader
  }
  return new Request(url, { headers })
}

describe('Cron Guard Resilience', () => {
  // -----------------------------------------------------------------------
  // Authorization
  // -----------------------------------------------------------------------
  describe('authorization', () => {
    it('rejects unauthorized requests when CRON_SECRET is set', async () => {
      process.env.CRON_SECRET = 'my-cron-secret'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

      createClientMock.mockReturnValue({ from: vi.fn() })

      const request = makeRequest('https://app.bitbit.chat/api/cron/test-job', 'Bearer wrong-secret')

      const { withCronGuard } = serviceClientModule
      const response = await withCronGuard(request, async () => ({
        message: 'Should not reach here',
      }))

      expect(response.status).toBe(401)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error).toBe('Unauthorized')
    })

    it('allows requests with correct CRON_SECRET', async () => {
      process.env.CRON_SECRET = 'my-cron-secret'
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

      createClientMock.mockReturnValue({ from: vi.fn() })

      const request = makeRequest('https://app.bitbit.chat/api/cron/test-job', 'Bearer my-cron-secret')

      const { withCronGuard } = serviceClientModule
      const response = await withCronGuard(request, async () => ({
        message: 'Success',
      }))

      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.result.message).toBe('Success')
    })

    it('allows requests when CRON_SECRET is not set (development mode)', async () => {
      delete process.env.CRON_SECRET
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

      createClientMock.mockReturnValue({ from: vi.fn() })

      const request = makeRequest('https://app.bitbit.chat/api/cron/test-job')

      const { withCronGuard } = serviceClientModule
      const response = await withCronGuard(request, async () => ({
        message: 'No auth required',
      }))

      expect(response.status).toBe(200)
    })
  })

  // -----------------------------------------------------------------------
  // Handler exception handling
  // -----------------------------------------------------------------------
  describe('handler exceptions', () => {
    it('catches handler Error and returns 500 with error message', async () => {
      delete process.env.CRON_SECRET
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

      createClientMock.mockReturnValue({ from: vi.fn() })

      const request = makeRequest('https://app.bitbit.chat/api/cron/failing-job')

      const { withCronGuard } = serviceClientModule
      const response = await withCronGuard(request, async () => {
        throw new Error('Database connection timeout after 30s')
      })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error).toBe('Database connection timeout after 30s')
      expect(body.duration_ms).toBeDefined()
      expect(typeof body.duration_ms).toBe('number')
    })

    it('catches non-Error throws and stringifies them', async () => {
      delete process.env.CRON_SECRET
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

      createClientMock.mockReturnValue({ from: vi.fn() })

      const request = makeRequest('https://app.bitbit.chat/api/cron/weird-error')

      const { withCronGuard } = serviceClientModule
      const response = await withCronGuard(request, async () => {
        throw 'string error thrown'
      })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error).toBe('string error thrown')
    })
  })

  // -----------------------------------------------------------------------
  // Service client initialization
  // -----------------------------------------------------------------------
  describe('service client initialization', () => {
    it('returns 500 when SUPABASE_URL is missing', async () => {
      delete process.env.CRON_SECRET
      delete process.env.SUPABASE_URL
      delete process.env.NEXT_PUBLIC_SUPABASE_URL
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

      const request = makeRequest('https://app.bitbit.chat/api/cron/init-fail')

      const { withCronGuard } = serviceClientModule
      const response = await withCronGuard(request, async () => ({
        message: 'Should not reach here',
      }))

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error).toBe('Server configuration error')
    })

    it('returns 500 when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      delete process.env.CRON_SECRET
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      delete process.env.SUPABASE_SERVICE_ROLE_KEY

      const request = makeRequest('https://app.bitbit.chat/api/cron/init-fail')

      const { withCronGuard } = serviceClientModule
      const response = await withCronGuard(request, async () => ({
        message: 'Should not reach here',
      }))

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error).toBe('Server configuration error')
    })
  })

  // -----------------------------------------------------------------------
  // Response structure
  // -----------------------------------------------------------------------
  describe('response structure', () => {
    it('includes duration_ms on successful execution', async () => {
      delete process.env.CRON_SECRET
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

      createClientMock.mockReturnValue({ from: vi.fn() })

      const request = makeRequest('https://app.bitbit.chat/api/cron/timing')

      const { withCronGuard } = serviceClientModule
      const response = await withCronGuard(request, async () => {
        return { message: 'Timed operation' }
      })

      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.duration_ms).toBeDefined()
      expect(body.duration_ms).toBeGreaterThanOrEqual(0)
    })

    it('includes details in result when handler provides them', async () => {
      delete process.env.CRON_SECRET
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

      createClientMock.mockReturnValue({ from: vi.fn() })

      const request = makeRequest('https://app.bitbit.chat/api/cron/detailed')

      const { withCronGuard } = serviceClientModule
      const response = await withCronGuard(request, async () => ({
        message: 'Processed 10 items',
        details: {
          processed: 10,
          skipped: 2,
          errors: 0,
        },
      }))

      const body = await response.json()
      expect(body.result.message).toBe('Processed 10 items')
      expect(body.result.details.processed).toBe(10)
      expect(body.result.details.skipped).toBe(2)
    })
  })

  // -----------------------------------------------------------------------
  // DB error simulation
  // -----------------------------------------------------------------------
  describe('database error resilience', () => {
    it('handler can catch and report DB errors without crashing', async () => {
      delete process.env.CRON_SECRET
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'connection reset by peer', code: 'PGRST301' },
          }),
        }),
      })
      createClientMock.mockReturnValue({ from: mockFrom })

      const request = makeRequest('https://app.bitbit.chat/api/cron/db-error')

      const { withCronGuard } = serviceClientModule
      const response = await withCronGuard(request, async (supabase) => {
        const { data, error } = await supabase
          .from('organisations')
          .select('id')
          .eq('status', 'active')

        if (error) {
          // Handler properly catches DB error and returns graceful result
          return {
            message: `DB error: ${error.message}`,
            details: { errorCode: error.code },
          }
        }

        return { message: `Processed ${data?.length ?? 0} orgs` }
      })

      expect(response.status).toBe(200) // Handler caught the error
      const body = await response.json()
      expect(body.success).toBe(true) // Success because handler handled it
      expect(body.result.message).toContain('DB error')
      expect(body.result.details.errorCode).toBe('PGRST301')
    })

    it('uncaught DB error in handler triggers 500 response', async () => {
      delete process.env.CRON_SECRET
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockRejectedValue(new Error('Connection pool exhausted')),
      })
      createClientMock.mockReturnValue({ from: mockFrom })

      const request = makeRequest('https://app.bitbit.chat/api/cron/pool-exhausted')

      const { withCronGuard } = serviceClientModule
      const response = await withCronGuard(request, async (supabase) => {
        // This will throw because select() rejects
        const result = await supabase.from('organisations').select('id')
        return { message: `Should not reach: ${result}` }
      })

      expect(response.status).toBe(500)
      const body = await response.json()
      expect(body.success).toBe(false)
      expect(body.error).toContain('Connection pool exhausted')
    })
  })

  // -----------------------------------------------------------------------
  // Rate limit simulation
  // -----------------------------------------------------------------------
  describe('rate limit resilience', () => {
    it('handler can detect rate-limited downstream calls and report gracefully', async () => {
      delete process.env.CRON_SECRET
      process.env.SUPABASE_URL = 'https://test.supabase.co'
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

      createClientMock.mockReturnValue({ from: vi.fn() })

      const request = makeRequest('https://app.bitbit.chat/api/cron/rate-limited')

      const { withCronGuard } = serviceClientModule
      const response = await withCronGuard(request, async () => {
        // Simulate checking an external API that returns 429
        const externalResponse = { status: 429, retryAfter: 60 }

        return {
          message: `Rate limited by external API, retry after ${externalResponse.retryAfter}s`,
          details: {
            rateLimited: true,
            retryAfterSeconds: externalResponse.retryAfter,
          },
        }
      })

      expect(response.status).toBe(200) // Cron itself succeeded
      const body = await response.json()
      expect(body.success).toBe(true)
      expect(body.result.details.rateLimited).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // Exported constants
  // -----------------------------------------------------------------------
  describe('module exports', () => {
    it('exports cronMaxDuration as 300', () => {
      expect(serviceClientModule.cronMaxDuration).toBe(300)
    })

    it('exports cronDynamic as force-dynamic', () => {
      expect(serviceClientModule.cronDynamic).toBe('force-dynamic')
    })
  })
})
