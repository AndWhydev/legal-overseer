/**
 * Surface Hardening Tests (Phase 5 + 6 + 7)
 *
 * RED phase: These tests define the acceptance criteria for surface hardening.
 * They SHOULD FAIL until the implementation is complete.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse, type NextRequest } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { resolve } from 'path'

// personal-assistant/ is 4 levels up from src/lib/security/__tests__/
const PROJECT_ROOT = resolve(__dirname, '../../../..')
const REPO_ROOT = resolve(PROJECT_ROOT, '..')

// ─── Test Group 1: Header Middleware ─────────────────────────────────────────

describe('Header Middleware — AC-1', () => {
  let proxyHandler: (request: NextRequest) => Promise<NextResponse>

  beforeEach(async () => {
    vi.resetModules()
    // Stub Supabase env to avoid auth flow — empty means the proxy early-returns
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    const mod = await import('@/proxy')
    proxyHandler = mod.proxy
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function createMockRequest(path: string): NextRequest {
    const url = new URL(path, 'http://localhost:3000')
    return {
      nextUrl: url,
      url: url.toString(),
      headers: new Headers(),
      method: 'GET',
    } as unknown as NextRequest
  }

  it('strips x-powered-by header and sets it to BitBit', async () => {
    const response = await proxyHandler(createMockRequest('/'))
    expect(response.headers.get('x-powered-by')).toBe('BitBit')
  })

  it('actively deletes server header in middleware source', () => {
    // Verify the proxy source contains an active delete call for 'server'.
    // Testing via response.headers.get('server') is vacuously true since
    // NextResponse.next() never sets it — we need to verify the code actively strips it.
    const proxyPath = resolve(PROJECT_ROOT, 'src/proxy.ts')
    const source = readFileSync(proxyPath, 'utf-8')
    expect(source).toMatch(/headers\.delete\(['"]server['"]\)/)
  })

  it('sets x-powered-by to BitBit on non-API routes', async () => {
    const response = await proxyHandler(createMockRequest('/some-page'))
    expect(response.headers.get('x-powered-by')).toBe('BitBit')
  })

  it('sets x-powered-by to BitBit on API routes', async () => {
    const response = await proxyHandler(createMockRequest('/api/health'))
    expect(response.headers.get('x-powered-by')).toBe('BitBit')
  })
})

// ─── Test Group 2: Error Sanitization ────────────────────────────────────────

describe('Error Sanitization — AC-2', () => {
  const GENERIC_ERROR = 'Something went wrong. Try again in a moment.'

  describe('AI text route', () => {
    it('returns generic error message on AI failure, not err.message', () => {
      const routePath = resolve(PROJECT_ROOT, 'src/app/api/ai/text/route.ts')
      const source = readFileSync(routePath, 'utf-8')

      // The catch block MUST NOT pass err.message to the client
      const catchBlock = source.slice(source.lastIndexOf('catch'))
      expect(catchBlock).toContain(GENERIC_ERROR)
      expect(catchBlock).not.toMatch(/error:\s*message\b/)
      expect(catchBlock).not.toMatch(/error:\s*err\.message/)
    })
  })

  describe('AI voice route', () => {
    it('returns generic error message on AI failure', () => {
      const routePath = resolve(PROJECT_ROOT, 'src/app/api/ai/voice/route.ts')
      const source = readFileSync(routePath, 'utf-8')

      // Find the last catch block (Anthropic API error) — must use generic message
      const lastCatchIdx = source.lastIndexOf('catch')
      const catchBlock = source.slice(lastCatchIdx)
      expect(catchBlock).toContain(GENERIC_ERROR)
    })
  })

  describe('Agent chat route', () => {
    it('returns generic error message in stream error events, not raw error', () => {
      const routePath = resolve(PROJECT_ROOT, 'src/app/api/agent/chat/route.ts')
      const source = readFileSync(routePath, 'utf-8')

      // The stream catch block must NOT use String(error) directly
      expect(source).not.toMatch(/data:\s*String\(error\)/)
      // It must contain the generic message
      expect(source).toContain(GENERIC_ERROR)
    })
  })

  describe('Agent classify route', () => {
    it('returns generic error message on classification failure', () => {
      const routePath = resolve(PROJECT_ROOT, 'src/app/api/agent/classify/route.ts')
      const source = readFileSync(routePath, 'utf-8')

      const catchBlock = source.slice(source.lastIndexOf('catch'))
      expect(catchBlock).toContain(GENERIC_ERROR)
      expect(catchBlock).not.toMatch(/error:\s*errorMessage/)
    })
  })

  describe('Agent ad-scripts route', () => {
    it('returns generic error message on script generation failure', () => {
      const routePath = resolve(PROJECT_ROOT, 'src/app/api/agent/ad-scripts/route.ts')
      const source = readFileSync(routePath, 'utf-8')

      expect(source).toContain(GENERIC_ERROR)
    })
  })
})

// ─── Test Group 3: Timing Jitter ─────────────────────────────────────────────

describe('Timing Jitter — AC-3', () => {
  it('addTimingJitter module exists and exports function', async () => {
    const mod = await import('@/lib/security/timing-jitter')
    expect(mod.addTimingJitter).toBeDefined()
    expect(typeof mod.addTimingJitter).toBe('function')
  })

  it('addTimingJitter delays between 50-200ms', async () => {
    const { addTimingJitter } = await import('@/lib/security/timing-jitter')

    const start = performance.now()
    await addTimingJitter()
    const elapsed = performance.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(45) // allow 5ms timer variance
    expect(elapsed).toBeLessThanOrEqual(250)   // allow 50ms timer variance
  })

  it('addTimingJitter produces variable delays (not constant)', async () => {
    const { addTimingJitter } = await import('@/lib/security/timing-jitter')

    const durations: number[] = []
    for (let i = 0; i < 5; i++) {
      const start = performance.now()
      await addTimingJitter()
      durations.push(performance.now() - start)
    }

    // At least 2 different durations (with 5ms tolerance buckets)
    const buckets = new Set(durations.map(d => Math.round(d / 5)))
    expect(buckets.size).toBeGreaterThanOrEqual(2)
  })

  it('chat route calls addTimingJitter before first stream chunk', () => {
    const routePath = resolve(PROJECT_ROOT, 'src/app/api/agent/chat/route.ts')
    const source = readFileSync(routePath, 'utf-8')

    // The route must import and call addTimingJitter
    expect(source).toMatch(/addTimingJitter/)

    // The call site (not import) must appear before the first stream output
    const jitterCall = source.indexOf('await addTimingJitter()')
    const firstStream = Math.min(
      ...[source.indexOf('controller.enqueue('), source.indexOf('createUIMessageStreamResponse(')]
        .filter(i => i !== -1)
    )
    expect(jitterCall).toBeGreaterThan(-1)
    expect(jitterCall).toBeLessThan(firstStream)
  })
})

// ─── Test Group 4: Frontend Model References ─────────────────────────────────

describe('Frontend Model References — AC-4', () => {
  // Forbidden patterns (case-insensitive)
  const FORBIDDEN = /\b(claude|anthropic|haiku|sonnet|opus)\b/i
  const POWERED_BY = /Powered by/i

  // Legal pages are exempt
  const EXEMPT_FILES = ['terms/page.tsx', 'privacy/page.tsx', 'pitch/slides/']

  function isExempt(filePath: string): boolean {
    return EXEMPT_FILES.some(exempt => filePath.includes(exempt))
  }

  it('costs-tab does not render entry.model or "Cost by Model"', () => {
    const costsPath = resolve(PROJECT_ROOT, 'src/components/dashboard/tabs/costs-tab.tsx')
    const source = readFileSync(costsPath, 'utf-8')

    expect(source).not.toMatch(/\{entry\.model\}/)
    expect(source).not.toMatch(/Cost by Model/i)
  })

  it('no .tsx files under src/components/ contain model/provider strings', () => {
    const componentsDir = resolve(PROJECT_ROOT, 'src/components')
    const violations: string[] = []

    try {
      const result = execSync(
        `find "${componentsDir}" -name "*.tsx" -type f`,
        { encoding: 'utf-8' }
      )
      const files = result.trim().split('\n').filter(Boolean)
      for (const file of files) {
        if (isExempt(file)) continue
        const content = readFileSync(file, 'utf-8')
        if (FORBIDDEN.test(content) || POWERED_BY.test(content)) {
          violations.push(file.replace(PROJECT_ROOT + '/', ''))
        }
      }
    } catch {
      // Directory may not exist in test env
    }

    expect(violations).toEqual([])
  })

  it('no .tsx files under landing-page/ contain model/provider strings', () => {
    const landingDir = resolve(REPO_ROOT, 'landing-page')
    const violations: string[] = []

    try {
      const result = execSync(
        `find "${landingDir}" -name "*.tsx" -type f -not -path "*/node_modules/*"`,
        { encoding: 'utf-8' }
      )
      const files = result.trim().split('\n').filter(Boolean)
      for (const file of files) {
        if (isExempt(file)) continue
        const content = readFileSync(file, 'utf-8')
        if (FORBIDDEN.test(content) || POWERED_BY.test(content)) {
          violations.push(file.replace(REPO_ROOT + '/', ''))
        }
      }
    } catch {
      // Directory may not exist in test env
    }

    expect(violations).toEqual([])
  })

  it('chat-interface.tsx has no model name references in comments', () => {
    const chatPath = resolve(PROJECT_ROOT, 'src/components/chat/chat-interface.tsx')
    const source = readFileSync(chatPath, 'utf-8')

    expect(source).not.toMatch(/\bHaiku\b/i)
    expect(source).not.toMatch(/\bSonnet\b/i)
    expect(source).not.toMatch(/\bOpus\b/i)
  })
})

// ─── Test Group 5: Pre-commit Scan Script ────────────────────────────────────

describe('Pre-commit Scan Script — AC-5', () => {
  const SCRIPT_PATH = resolve(PROJECT_ROOT, 'scripts/scan-model-leaks.sh')

  it('scan-model-leaks.sh exists', () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true)
  })

  it('scan-model-leaks.sh runs and produces expected output format', () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true)

    // The script should run without crashing and output either BLOCKED or CLEAN.
    // Whether the codebase is actually clean depends on model-quarantine (Phase 1).
    try {
      const result = execSync(`bash "${SCRIPT_PATH}"`, {
        encoding: 'utf-8',
        cwd: REPO_ROOT,
      })
      expect(result).toContain('CLEAN')
    } catch (err: unknown) {
      // Exit code 1 means leaks found — verify the output format is correct
      const error = err as { stdout?: string }
      expect(error.stdout).toContain('BLOCKED')
    }
  })
})

// ─── Test Group 6: Bundle Scan Script ────────────────────────────────────────

describe('Bundle Scan Script — AC-6', () => {
  const SCRIPT_PATH = resolve(PROJECT_ROOT, 'scripts/scan-bundle-leaks.sh')

  it('scan-bundle-leaks.sh exists', () => {
    expect(existsSync(SCRIPT_PATH)).toBe(true)
  })
})
