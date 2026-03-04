import type { ChannelAdapter, ChannelMessage } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrgCredential } from '@/lib/integrations/credentials'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WordPressCredentials {
  site_url: string
  username: string
  application_password: string
}

export interface WordPressError {
  error: string
  details?: string
}

interface WPRendered {
  rendered: string
}

export interface WPPost {
  id: number
  title: WPRendered
  content: WPRendered
  status: string
  date: string
  modified: string
  slug: string
  author: number
  categories: number[]
  tags: number[]
}

export interface WPPage {
  id: number
  title: WPRendered
  content: WPRendered
  status: string
  date: string
  modified: string
  slug: string
  author: number
}

export interface WPPlugin {
  plugin: string
  status: string
  name?: string
  version?: string
  author?: string
}

export interface WPSiteHealth {
  status?: string
  tests?: Record<string, unknown>
  [key: string]: unknown
}

export interface WPCreatePostData {
  title: string
  content: string
  status?: 'draft' | 'publish' | 'private' | 'pending'
  categories?: number[]
  tags?: number[]
  slug?: string
}

export interface WPUpdatePostData {
  title?: string
  content?: string
  status?: 'draft' | 'publish' | 'private' | 'pending'
  categories?: number[]
  tags?: number[]
  slug?: string
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const WORDPRESS_REST_BASE = '/wp-json'

function normalizeSiteUrl(siteUrl: string): string {
  return siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl
}

function encodeBasicAuth(username: string, applicationPassword: string): string {
  return Buffer.from(`${username}:${applicationPassword}`, 'utf8').toString('base64')
}

async function wordpressFetch<T>(
  credentials: WordPressCredentials,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const siteUrl = normalizeSiteUrl(credentials.site_url)
  const auth = encodeBasicAuth(credentials.username, credentials.application_password)
  const res = await fetch(`${siteUrl}${WORDPRESS_REST_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`WordPress API ${res.status}: ${text}`)
  }

  return (await res.json()) as T
}

async function resolveToken(
  client: SupabaseClient,
  orgId: string,
): Promise<WordPressCredentials | null> {
  return (await getOrgCredential(client, orgId, 'wordpress')) as WordPressCredentials | null
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function readStringConfig(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

// ---------------------------------------------------------------------------
// Public DI functions (SupabaseClient first param)
// ---------------------------------------------------------------------------

export async function fetchWPPosts(
  client: SupabaseClient,
  orgId: string,
  config: { perPage?: number; status?: string; page?: number } = {},
): Promise<WPPost[] | WordPressError> {
  try {
    const creds = await resolveToken(client, orgId)
    if (!creds) return { error: 'No WordPress credentials configured' }

    const params = new URLSearchParams({
      per_page: String(config.perPage || 25),
      page: String(config.page || 1),
      orderby: 'modified',
      order: 'desc',
    })
    if (config.status) params.set('status', config.status)

    return await wordpressFetch<WPPost[]>(creds, `/wp/v2/posts?${params.toString()}`)
  } catch (err) {
    return { error: 'Failed to fetch posts', details: String(err) }
  }
}

export async function fetchWPPages(
  client: SupabaseClient,
  orgId: string,
  config: { perPage?: number; status?: string; page?: number } = {},
): Promise<WPPage[] | WordPressError> {
  try {
    const creds = await resolveToken(client, orgId)
    if (!creds) return { error: 'No WordPress credentials configured' }

    const params = new URLSearchParams({
      per_page: String(config.perPage || 25),
      page: String(config.page || 1),
      orderby: 'modified',
      order: 'desc',
    })
    if (config.status) params.set('status', config.status)

    return await wordpressFetch<WPPage[]>(creds, `/wp/v2/pages?${params.toString()}`)
  } catch (err) {
    return { error: 'Failed to fetch pages', details: String(err) }
  }
}

export async function createWPPost(
  client: SupabaseClient,
  orgId: string,
  data: WPCreatePostData,
): Promise<WPPost | WordPressError> {
  try {
    const creds = await resolveToken(client, orgId)
    if (!creds) return { error: 'No WordPress credentials configured' }

    return await wordpressFetch<WPPost>(creds, '/wp/v2/posts', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  } catch (err) {
    return { error: 'Failed to create post', details: String(err) }
  }
}

export async function updateWPPost(
  client: SupabaseClient,
  orgId: string,
  postId: number,
  data: WPUpdatePostData,
): Promise<WPPost | WordPressError> {
  try {
    const creds = await resolveToken(client, orgId)
    if (!creds) return { error: 'No WordPress credentials configured' }

    return await wordpressFetch<WPPost>(creds, `/wp/v2/posts/${postId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  } catch (err) {
    return { error: 'Failed to update post', details: String(err) }
  }
}

export async function fetchWPPlugins(
  client: SupabaseClient,
  orgId: string,
): Promise<WPPlugin[] | WordPressError> {
  try {
    const creds = await resolveToken(client, orgId)
    if (!creds) return { error: 'No WordPress credentials configured' }

    return await wordpressFetch<WPPlugin[]>(creds, '/wp/v2/plugins')
  } catch (err) {
    return { error: 'Failed to fetch plugins', details: String(err) }
  }
}

export async function fetchWPSiteHealth(
  client: SupabaseClient,
  orgId: string,
): Promise<WPSiteHealth | WordPressError> {
  try {
    const creds = await resolveToken(client, orgId)
    if (!creds) return { error: 'No WordPress credentials configured' }

    return await wordpressFetch<WPSiteHealth>(creds, '/wp-site-health/v1/tests')
  } catch (err) {
    return { error: 'Failed to fetch site health', details: String(err) }
  }
}

// ---------------------------------------------------------------------------
// ChannelAdapter for synthesizer compatibility (env-var based)
// ---------------------------------------------------------------------------

export const wordpressAdapter: ChannelAdapter = {
  type: 'wordpress',
  name: 'WordPress',
  description: 'Sync WordPress posts and content updates',
  icon: 'FileText',

  async pull(config, since) {
    const siteUrl =
      readStringConfig(config, 'siteUrl') ||
      readStringConfig(config, 'site_url') ||
      process.env.WORDPRESS_SITE_URL
    const username =
      readStringConfig(config, 'username') ||
      process.env.WORDPRESS_USERNAME
    const applicationPassword =
      readStringConfig(config, 'applicationPassword') ||
      readStringConfig(config, 'application_password') ||
      process.env.WORDPRESS_APPLICATION_PASSWORD

    if (!siteUrl || !username || !applicationPassword) return []

    const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const creds: WordPressCredentials = {
      site_url: siteUrl,
      username,
      application_password: applicationPassword,
    }

    try {
      const params = new URLSearchParams({
        per_page: '25',
        orderby: 'modified',
        order: 'desc',
        after: sinceDate.toISOString(),
      })

      const posts = await wordpressFetch<WPPost[]>(creds, `/wp/v2/posts?${params.toString()}`)
      return posts.map((post): ChannelMessage => ({
        id: `wordpress-${post.id}`,
        channel: 'wordpress',
        externalId: String(post.id),
        sender: 'WordPress',
        subject: post.title.rendered || `Post #${post.id}`,
        body: stripHtml(post.content.rendered || post.title.rendered || ''),
        receivedAt: new Date(post.modified || post.date),
        isActionable: post.status !== 'publish',
        priority: post.status === 'pending' ? 'high' : post.status === 'draft' ? 'medium' : 'low',
        metadata: {
          status: post.status,
          slug: post.slug,
          author: post.author,
          categories: post.categories,
          tags: post.tags,
          siteUrl,
          source: 'wordpress-rest-api',
        },
      }))
    } catch (err) {
      console.error('[wordpress] pull failed:', err)
      return []
    }
  },

  async isAvailable() {
    return Boolean(
      process.env.WORDPRESS_SITE_URL &&
      process.env.WORDPRESS_USERNAME &&
      process.env.WORDPRESS_APPLICATION_PASSWORD,
    )
  },
}
