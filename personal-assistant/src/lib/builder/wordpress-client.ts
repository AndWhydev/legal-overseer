// ---------------------------------------------------------------------------
// WordPress REST API v2 Client
// ---------------------------------------------------------------------------
// Typed client for WordPress page CRUD, media upload, and Elementor detection.
// Uses Application Passwords (available since WP 5.6) for authentication.
// ---------------------------------------------------------------------------

import { logger } from '@/lib/core/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WordPressConfig {
  siteUrl: string
  username: string
  applicationPassword: string
  /** When set, uses JWT Bearer auth instead of Basic auth */
  jwtToken?: string
}

export interface WordPressJwtConfig {
  siteUrl: string
  username: string
  password: string
}

export interface WPPage {
  id: number
  title: { rendered: string }
  content: { rendered: string }
  slug: string
  status: string
  link: string
  meta?: Record<string, unknown>
}

export interface WPMedia {
  id: number
  source_url: string
  title: { rendered: string }
}

export interface WPPlugin {
  plugin: string
  name: string
  status: string
  version: string
}

interface WPErrorResponse {
  code: string
  message: string
  data?: { status?: number }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class WordPressClient {
  private readonly baseUrl: string
  private authHeader: string
  private readonly siteUrlBase: string
  private readonly userAgent = 'BitBit-Builder/1.0'
  private jwtExpiry: number | null = null

  // Stored for JWT refresh
  private readonly jwtUsername?: string
  private readonly jwtPassword?: string

  constructor(private readonly config: WordPressConfig) {
    // Normalise URL -- strip trailing slash, append REST base
    const siteUrl = config.siteUrl.replace(/\/+$/, '')
    this.siteUrlBase = siteUrl
    this.baseUrl = `${siteUrl}/wp-json/wp/v2`

    if (config.jwtToken) {
      // JWT Bearer auth
      this.authHeader = `Bearer ${config.jwtToken}`
      // Try to extract expiry from JWT payload
      try {
        const payload = JSON.parse(atob(config.jwtToken.split('.')[1]))
        this.jwtExpiry = payload.exp ? payload.exp * 1000 : null
      } catch { /* ignore */ }
    } else {
      // Basic auth with Application Password
      const credentials = `${config.username}:${config.applicationPassword}`
      this.authHeader = `Basic ${btoa(credentials)}`
    }
  }

  // -------------------------------------------------------------------------
  // Connection test
  // -------------------------------------------------------------------------

  async testConnection(): Promise<{ success: boolean; siteName: string; wpVersion: string }> {
    try {
      // GET the site root (wp-json) to verify auth and get site info
      const siteUrl = this.config.siteUrl.replace(/\/+$/, '')
      const res = await this.request<{
        name: string
        namespaces: string[]
        authentication: Record<string, unknown>
      }>(`${siteUrl}/wp-json`, 'GET')

      // WP version is available via the response headers or /wp-json root
      // The root endpoint returns general site info
      return {
        success: true,
        siteName: res.name ?? 'Unknown',
        wpVersion: (res as Record<string, unknown>).version as string ?? 'unknown',
      }
    } catch (err) {
      logger.error('WordPress connection test failed', { error: String(err) })
      return { success: false, siteName: '', wpVersion: '' }
    }
  }

  // -------------------------------------------------------------------------
  // Pages
  // -------------------------------------------------------------------------

  async createPage(data: {
    title: string
    content: string
    status?: 'draft' | 'publish'
    slug?: string
    meta?: Record<string, unknown>
  }): Promise<WPPage> {
    return this.request<WPPage>(`${this.baseUrl}/pages`, 'POST', {
      title: data.title,
      content: data.content,
      status: data.status ?? 'draft',
      ...(data.slug ? { slug: data.slug } : {}),
      ...(data.meta ? { meta: data.meta } : {}),
    })
  }

  async updatePage(
    pageId: number,
    data: Partial<{ title: string; content: string; status: string; meta: Record<string, unknown> }>,
  ): Promise<WPPage> {
    return this.request<WPPage>(`${this.baseUrl}/pages/${pageId}`, 'POST', data)
  }

  async getPages(params?: {
    per_page?: number
    search?: string
    status?: string
  }): Promise<WPPage[]> {
    const query = new URLSearchParams()
    if (params?.per_page) query.set('per_page', String(params.per_page))
    if (params?.search) query.set('search', params.search)
    if (params?.status) query.set('status', params.status)

    const qs = query.toString()
    const url = qs ? `${this.baseUrl}/pages?${qs}` : `${this.baseUrl}/pages`
    return this.request<WPPage[]>(url, 'GET')
  }

  // -------------------------------------------------------------------------
  // Media
  // -------------------------------------------------------------------------

  async uploadMedia(
    file: Buffer | Uint8Array,
    filename: string,
    mimeType: string,
  ): Promise<WPMedia> {
    // Cast through unknown -- Node Buffer/Uint8Array are BlobPart at runtime
    // but TS DOM lib typing disagrees with the Node Buffer generic parameter
    const blob = new Blob([file as unknown as BlobPart], { type: mimeType })
    const res = await fetch(`${this.baseUrl}/media`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'User-Agent': this.userAgent,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': mimeType,
      },
      body: blob,
    })

    if (!res.ok) {
      const err = await this.parseError(res)
      throw new WordPressError(err.code, err.message, res.status)
    }

    return res.json() as Promise<WPMedia>
  }

  // -------------------------------------------------------------------------
  // Plugins / Elementor detection
  // -------------------------------------------------------------------------

  async getPlugins(): Promise<WPPlugin[]> {
    return this.request<WPPlugin[]>(`${this.baseUrl}/plugins`, 'GET')
  }

  async checkElementor(): Promise<{ installed: boolean; version: string | null }> {
    try {
      const plugins = await this.getPlugins()
      const elementor = plugins.find(
        (p) => p.plugin === 'elementor/elementor.php',
      )
      return {
        installed: !!elementor,
        version: elementor?.version ?? null,
      }
    } catch (err) {
      // If we lack admin access to list plugins, we can't detect Elementor
      logger.warn('Cannot detect Elementor (plugin list inaccessible)', {
        error: String(err),
      })
      return { installed: false, version: null }
    }
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async request<T>(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    body?: Record<string, unknown>,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      'User-Agent': this.userAgent,
      'Content-Type': 'application/json',
    }

    const res = await fetch(url, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

    if (!res.ok) {
      const err = await this.parseError(res)
      throw new WordPressError(err.code, err.message, res.status)
    }

    return res.json() as Promise<T>
  }

  private async parseError(
    res: Response,
  ): Promise<{ code: string; message: string }> {
    try {
      const json = (await res.json()) as WPErrorResponse
      return {
        code: json.code ?? 'unknown_error',
        message: json.message ?? `HTTP ${res.status}`,
      }
    } catch {
      return {
        code: 'parse_error',
        message: `HTTP ${res.status}: ${res.statusText}`,
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class WordPressError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
  ) {
    super(`WordPress API error [${code}]: ${message}`)
    this.name = 'WordPressError'
  }
}

// ---------------------------------------------------------------------------
// JWT Authentication
// ---------------------------------------------------------------------------

/**
 * Obtain a JWT token from a WordPress site with the JWT Authentication plugin.
 * Returns a WordPressClient authenticated via Bearer token.
 */
export async function createWordPressClientWithJwt(
  config: WordPressJwtConfig,
): Promise<WordPressClient> {
  const siteUrl = config.siteUrl.replace(/\/+$/, '')
  const res = await fetch(`${siteUrl}/wp-json/jwt-auth/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: config.username,
      password: config.password,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new WordPressError('jwt_auth_failed', `JWT auth failed: ${text}`, res.status)
  }

  const data = (await res.json()) as { token: string; user_id: number; expires_in: number }
  logger.info('WordPress JWT auth successful', { siteUrl, userId: data.user_id })

  return new WordPressClient({
    siteUrl: config.siteUrl,
    username: config.username,
    applicationPassword: '', // unused with JWT
    jwtToken: data.token,
  })
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWordPressClient(config: WordPressConfig): WordPressClient {
  return new WordPressClient(config)
}
