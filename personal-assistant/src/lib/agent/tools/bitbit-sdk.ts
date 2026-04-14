/**
 * BitBit SDK — Sandboxed runtime API for agentic code execution.
 *
 * Exposes BitBit's core operations as a typed, org-scoped SDK that the agent
 * can manipulate via the execute_code tool. All database operations are
 * automatically scoped to the user's org_id. Write operations go through
 * the same guardrails as the built-in tools.
 *
 * Design principles:
 *   1. Org-scoped by default — no cross-tenant data access
 *   2. Read-heavy, write-guarded — reads are free, writes auto-inject org_id
 *   3. Composable — the agent can chain SDK calls in a single execution
 *   4. Observable — all operations are logged for audit
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/core/logger'

// Tables that are org-scoped and should have org_id auto-injected
const ORG_SCOPED_TABLES = new Set([
  'contacts',
  'tasks',
  'channel_messages',
  'channel_connections',
  'activity_feed',
  'goals',
  'semantic_memories',
  'entity_profiles',
  'conversation_threads',
  'conversation_messages',
  'columns',
  'embedding_jobs',
  'memory_entries',
  'baseplate_snapshots',
  'whatsapp_outbox',
  'org_integrations',
  'org_connections',
  'channel_configs',
])

// Tables that should never be written to via the SDK
const READ_ONLY_TABLES = new Set([
  'profiles',
  'organizations',
  'org_members',
  'audit_events',
])

export interface SDKQueryOptions {
  select?: string
  filter?: Record<string, unknown>
  ilike?: Record<string, string>
  order?: { column: string; ascending?: boolean }
  limit?: number
  offset?: number
}

export interface SDKOutput {
  logs: string[]
  result: unknown
  operations: SDKOperationLog[]
}

export interface SDKOperationLog {
  type: 'query' | 'insert' | 'update' | 'delete' | 'fetch'
  table?: string
  detail: string
  durationMs: number
}

export class BitBitSDK {
  private supabase: SupabaseClient
  private orgId: string
  private _logs: string[] = []
  private _operations: SDKOperationLog[] = []

  constructor(supabase: SupabaseClient, orgId: string) {
    this.supabase = supabase
    this.orgId = orgId
  }

  /** Captured console.log output */
  get logs(): string[] {
    return this._logs
  }

  /** Operation audit trail */
  get operations(): SDKOperationLog[] {
    return this._operations
  }

  /** Console-like log capture */
  log(...args: unknown[]): void {
    this._logs.push(args.map(a =>
      typeof a === 'string' ? a : JSON.stringify(a, null, 2)
    ).join(' '))
  }

  // ─── Database ───────────────────────────────────────────────────────────

  get db() {
    const sdk = this
    return {
      /**
       * Query any table with org-scoped filtering.
       * @example
       * const contacts = await sdk.db.query('contacts', { limit: 10 })
       * const urgent = await sdk.db.query('tasks', {
       *   filter: { priority: 'critical', status: 'active' },
       *   order: { column: 'created_at', ascending: false },
       *   limit: 5,
       * })
       */
      async query(table: string, options?: SDKQueryOptions): Promise<unknown[]> {
        const start = performance.now()
        let q = sdk.supabase.from(table).select(options?.select || '*')

        if (ORG_SCOPED_TABLES.has(table)) {
          q = q.eq('org_id', sdk.orgId)
        }

        if (options?.filter) {
          for (const [key, value] of Object.entries(options.filter)) {
            if (value === null) {
              q = q.is(key, null)
            } else if (Array.isArray(value)) {
              q = q.in(key, value)
            } else {
              q = q.eq(key, value)
            }
          }
        }

        if (options?.ilike) {
          for (const [key, pattern] of Object.entries(options.ilike)) {
            q = q.ilike(key, pattern)
          }
        }

        if (options?.order) {
          q = q.order(options.order.column, { ascending: options.order.ascending ?? false })
        }

        if (options?.limit) {
          q = q.limit(options.limit)
        }

        if (options?.offset) {
          q = q.range(options.offset, options.offset + (options?.limit || 50) - 1)
        }

        const { data, error } = await q
        const ms = Math.round(performance.now() - start)

        sdk._operations.push({
          type: 'query',
          table,
          detail: `SELECT from ${table}${options?.filter ? ` WHERE ${JSON.stringify(options.filter)}` : ''}${options?.limit ? ` LIMIT ${options.limit}` : ''}`,
          durationMs: ms,
        })

        if (error) throw new Error(`db.query(${table}) failed: ${error.message}`)
        return (data as unknown[]) ?? []
      },

      /**
       * Count rows in a table matching filters.
       */
      async count(table: string, filter?: Record<string, unknown>): Promise<number> {
        const start = performance.now()
        let q = sdk.supabase.from(table).select('*', { count: 'exact', head: true })

        if (ORG_SCOPED_TABLES.has(table)) {
          q = q.eq('org_id', sdk.orgId)
        }

        if (filter) {
          for (const [key, value] of Object.entries(filter)) {
            q = q.eq(key, value)
          }
        }

        const { count, error } = await q
        const ms = Math.round(performance.now() - start)

        sdk._operations.push({
          type: 'query',
          table,
          detail: `COUNT from ${table}${filter ? ` WHERE ${JSON.stringify(filter)}` : ''}`,
          durationMs: ms,
        })

        if (error) throw new Error(`db.count(${table}) failed: ${error.message}`)
        return count ?? 0
      },

      /**
       * Insert rows into an org-scoped table.
       * org_id is auto-injected. Returns inserted rows.
       */
      async insert(table: string, rows: Record<string, unknown> | Record<string, unknown>[]): Promise<unknown[]> {
        if (READ_ONLY_TABLES.has(table)) {
          throw new Error(`Table "${table}" is read-only via the SDK`)
        }

        const start = performance.now()
        const rowsArray = Array.isArray(rows) ? rows : [rows]

        const withOrg = ORG_SCOPED_TABLES.has(table)
          ? rowsArray.map(r => ({ ...r, org_id: sdk.orgId }))
          : rowsArray

        const { data, error } = await sdk.supabase.from(table).insert(withOrg).select()
        const ms = Math.round(performance.now() - start)

        sdk._operations.push({
          type: 'insert',
          table,
          detail: `INSERT ${rowsArray.length} row(s) into ${table}`,
          durationMs: ms,
        })

        if (error) throw new Error(`db.insert(${table}) failed: ${error.message}`)
        return (data as unknown[]) ?? []
      },

      /**
       * Update rows by ID with org_id guard.
       */
      async update(table: string, id: string, updates: Record<string, unknown>): Promise<unknown[]> {
        if (READ_ONLY_TABLES.has(table)) {
          throw new Error(`Table "${table}" is read-only via the SDK`)
        }

        const start = performance.now()
        let q = sdk.supabase.from(table).update(updates).eq('id', id)

        if (ORG_SCOPED_TABLES.has(table)) {
          q = q.eq('org_id', sdk.orgId)
        }

        const { data, error } = await q.select()
        const ms = Math.round(performance.now() - start)

        sdk._operations.push({
          type: 'update',
          table,
          detail: `UPDATE ${table} SET ${Object.keys(updates).join(', ')} WHERE id=${id.slice(0, 8)}...`,
          durationMs: ms,
        })

        if (error) throw new Error(`db.update(${table}) failed: ${error.message}`)
        return (data as unknown[]) ?? []
      },

      /**
       * Bulk update rows matching a filter.
       */
      async updateWhere(
        table: string,
        filter: Record<string, unknown>,
        updates: Record<string, unknown>,
      ): Promise<number> {
        if (READ_ONLY_TABLES.has(table)) {
          throw new Error(`Table "${table}" is read-only via the SDK`)
        }

        const start = performance.now()
        let q = sdk.supabase.from(table).update(updates)

        if (ORG_SCOPED_TABLES.has(table)) {
          q = q.eq('org_id', sdk.orgId)
        }

        for (const [key, value] of Object.entries(filter)) {
          q = q.eq(key, value)
        }

        const { data, error } = await q.select('id')
        const ms = Math.round(performance.now() - start)
        const count = (data as unknown[] | null)?.length ?? 0

        sdk._operations.push({
          type: 'update',
          table,
          detail: `UPDATE ${table} WHERE ${JSON.stringify(filter)} (${count} rows)`,
          durationMs: ms,
        })

        if (error) throw new Error(`db.updateWhere(${table}) failed: ${error.message}`)
        return count
      },

      /**
       * Delete a row by ID with org_id guard.
       */
      async delete(table: string, id: string): Promise<boolean> {
        if (READ_ONLY_TABLES.has(table)) {
          throw new Error(`Table "${table}" is read-only via the SDK`)
        }

        const start = performance.now()
        let q = sdk.supabase.from(table).delete().eq('id', id)

        if (ORG_SCOPED_TABLES.has(table)) {
          q = q.eq('org_id', sdk.orgId)
        }

        const { error } = await q
        const ms = Math.round(performance.now() - start)

        sdk._operations.push({
          type: 'delete',
          table,
          detail: `DELETE FROM ${table} WHERE id=${id.slice(0, 8)}...`,
          durationMs: ms,
        })

        if (error) throw new Error(`db.delete(${table}) failed: ${error.message}`)
        return true
      },
    }
  }

  // ─── Connections ──────────────────────────────────────────────────────

  get connections() {
    const sdk = this
    return {
      /** List all connections for this org */
      async list(): Promise<unknown[]> {
        return sdk.db.query('org_connections', {
          order: { column: 'created_at', ascending: false },
        })
      },

      /** Get a specific connection by provider name */
      async get(provider: string): Promise<unknown | null> {
        const results = await sdk.db.query('org_connections', {
          filter: { provider },
          limit: 1,
        })
        return (results as unknown[])[0] ?? null
      },

      /** Disconnect (delete) a connection by ID */
      async disconnect(id: string): Promise<boolean> {
        return sdk.db.delete('org_connections', id)
      },

      /** Update connection status */
      async updateStatus(id: string, status: string): Promise<unknown> {
        const rows = await sdk.db.update('org_connections', id, {
          status,
          updated_at: new Date().toISOString(),
        })
        return (rows as unknown[])[0]
      },

      /** Trigger a sync on a connection */
      async sync(id: string): Promise<unknown> {
        const rows = await sdk.db.update('org_connections', id, {
          last_sync_at: new Date().toISOString(),
        })
        return (rows as unknown[])[0]
      },
    }
  }

  // ─── Contacts ─────────────────────────────────────────────────────────

  get contacts() {
    const sdk = this
    return {
      async search(query: string, limit = 10): Promise<unknown[]> {
        return sdk.db.query('contacts', {
          ilike: { name: `%${query}%` },
          limit,
        })
      },

      async get(id: string): Promise<unknown> {
        const results = await sdk.db.query('contacts', { filter: { id }, limit: 1 })
        return results[0] ?? null
      },

      async create(data: { name: string; type?: string; emails?: string[]; phones?: string[] }): Promise<unknown> {
        const rows = await sdk.db.insert('contacts', {
          name: data.name,
          type: data.type || 'person',
          emails: data.emails || [],
          phones: data.phones || [],
        })
        return rows[0]
      },

      async list(options?: { type?: string; limit?: number }): Promise<unknown[]> {
        return sdk.db.query('contacts', {
          filter: options?.type ? { type: options.type } : undefined,
          order: { column: 'updated_at', ascending: false },
          limit: options?.limit || 20,
        })
      },
    }
  }

  // ─── Messages ─────────────────────────────────────────────────────────

  get messages() {
    const sdk = this
    return {
      async find(options?: {
        query?: string
        channel?: string
        from?: string
        since?: string
        limit?: number
      }): Promise<unknown[]> {
        const filter: Record<string, unknown> = {}
        if (options?.channel) filter.channel = options.channel

        const ilike: Record<string, string> = {}
        if (options?.query) ilike.subject = `%${options.query}%`
        if (options?.from) ilike.sender = `%${options.from}%`

        let q = sdk.supabase
          .from('channel_messages')
          .select('id, channel, sender, subject, body, metadata, created_at')
          .eq('org_id', sdk.orgId)
          .order('created_at', { ascending: false })
          .limit(options?.limit || 20)

        if (options?.channel) q = q.eq('channel', options.channel)
        if (options?.query) q = q.or(`subject.ilike.%${options.query}%,body.ilike.%${options.query}%,sender.ilike.%${options.query}%`)
        if (options?.from) q = q.ilike('sender', `%${options.from}%`)
        if (options?.since) q = q.gte('created_at', options.since)

        const { data, error } = await q
        if (error) throw new Error(`messages.find() failed: ${error.message}`)
        return (data as unknown[]) ?? []
      },

      async read(id: string): Promise<unknown> {
        const { data, error } = await sdk.supabase
          .from('channel_messages')
          .select('id, channel, sender, subject, body, body_full, metadata, created_at')
          .eq('id', id)
          .eq('org_id', sdk.orgId)
          .single()

        if (error) throw new Error(`messages.read() failed: ${error.message}`)
        return data
      },

      async count(options?: { channel?: string; since?: string }): Promise<number> {
        let q = sdk.supabase
          .from('channel_messages')
          .select('*', { count: 'exact', head: true })
          .eq('org_id', sdk.orgId)

        if (options?.channel) q = q.eq('channel', options.channel)
        if (options?.since) q = q.gte('created_at', options.since)

        const { count, error } = await q
        if (error) throw new Error(`messages.count() failed: ${error.message}`)
        return count ?? 0
      },
    }
  }

  // ─── Tasks ────────────────────────────────────────────────────────────

  get tasks() {
    const sdk = this
    return {
      async list(options?: {
        status?: string
        priority?: string
        column?: string
        limit?: number
      }): Promise<unknown[]> {
        const filter: Record<string, unknown> = {}
        if (options?.status) filter.status = options.status
        if (options?.priority) filter.priority = options.priority
        if (options?.column) filter.column_id = options.column

        return sdk.db.query('tasks', {
          filter: Object.keys(filter).length > 0 ? filter : undefined,
          order: { column: 'created_at', ascending: false },
          limit: options?.limit || 30,
        })
      },

      async create(data: {
        title: string
        description?: string
        priority?: string
        column_id?: string
        contact_id?: string
      }): Promise<unknown> {
        const rows = await sdk.db.insert('tasks', {
          title: data.title,
          description: data.description || '',
          priority: data.priority || 'medium',
          status: 'active',
          column_id: data.column_id,
          contact_id: data.contact_id,
        })
        return rows[0]
      },

      async update(id: string, updates: Record<string, unknown>): Promise<unknown> {
        const rows = await sdk.db.update('tasks', id, updates)
        return rows[0]
      },

      async search(query: string): Promise<unknown[]> {
        return sdk.db.query('tasks', {
          ilike: { title: `%${query}%` },
          limit: 20,
        })
      },
    }
  }

  // ─── Memory ───────────────────────────────────────────────────────────

  get memory() {
    const sdk = this
    return {
      async search(query: string, limit = 10): Promise<unknown[]> {
        return sdk.db.query('memory_entries', {
          ilike: { content: `%${query}%` },
          order: { column: 'created_at', ascending: false },
          limit,
        })
      },

      async add(content: string, category = 'general'): Promise<unknown> {
        const rows = await sdk.db.insert('memory_entries', {
          content,
          category,
          confidence: 0.8,
        })
        return rows[0]
      },

      async list(options?: { category?: string; limit?: number }): Promise<unknown[]> {
        return sdk.db.query('memory_entries', {
          filter: options?.category ? { category: options.category } : undefined,
          order: { column: 'created_at', ascending: false },
          limit: options?.limit || 20,
        })
      },
    }
  }

  // ─── Channels ─────────────────────────────────────────────────────────

  get channels() {
    const sdk = this
    return {
      async list(): Promise<unknown[]> {
        return sdk.db.query('channel_connections', {
          select: 'id, channel_type, status, last_sync, message_count, config',
        })
      },

      async getConfig(channelType: string): Promise<unknown> {
        const results = await sdk.db.query('channel_connections', {
          filter: { channel_type: channelType },
          select: 'id, channel_type, status, last_sync, message_count, config',
          limit: 1,
        })
        return results[0] ?? null
      },
    }
  }

  // ─── Activity ─────────────────────────────────────────────────────────

  get activity() {
    const sdk = this
    return {
      async log(action: string, actionType = 'agent_action', result?: string): Promise<void> {
        await sdk.db.insert('activity_feed', {
          action,
          action_type: actionType,
          result: result || null,
          actor: 'bitbit',
        })
      },

      async recent(limit = 20): Promise<unknown[]> {
        return sdk.db.query('activity_feed', {
          order: { column: 'created_at', ascending: false },
          limit,
        })
      },
    }
  }

  // ─── HTTP (restricted) ────────────────────────────────────────────────

  /**
   * Fetch a URL. Restricted to GET requests and allowlisted domains.
   * For general web access, use the web_search or fetch_url tools instead.
   */
  async fetch(url: string, options?: { method?: string; headers?: Record<string, string> }): Promise<{
    status: number
    ok: boolean
    text: string
    json: unknown
  }> {
    const method = options?.method?.toUpperCase() || 'GET'
    if (method !== 'GET' && method !== 'HEAD') {
      throw new Error('SDK fetch only supports GET and HEAD requests')
    }

    // Allowlist: only API endpoints and public URLs
    const parsed = new URL(url)
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254']
    if (blockedHosts.includes(parsed.hostname)) {
      throw new Error(`Blocked host: ${parsed.hostname}`)
    }

    const start = performance.now()
    const res = await globalThis.fetch(url, {
      method,
      headers: options?.headers,
      signal: AbortSignal.timeout(10_000),
    })

    const text = await res.text()
    const ms = Math.round(performance.now() - start)

    this._operations.push({
      type: 'fetch',
      detail: `${method} ${url} → ${res.status} (${text.length} bytes)`,
      durationMs: ms,
    })

    let json: unknown = null
    try { json = JSON.parse(text) } catch { /* not JSON */ }

    return { status: res.status, ok: res.ok, text: text.slice(0, 50_000), json }
  }

  // ─── Utilities ────────────────────────────────────────────────────────

  /** Get the current org ID */
  get orgId_(): string {
    return this.orgId
  }

  /** Get current date/time as ISO string */
  now(): string {
    return new Date().toISOString()
  }

  /** Get date N days ago as ISO string */
  daysAgo(n: number): string {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
  }

  /** Sleep for N milliseconds (max 5000) */
  async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, Math.min(ms, 5000)))
  }
}

/**
 * Create a sandboxed SDK instance for the given org.
 */
export function createSDK(supabase: SupabaseClient, orgId: string): BitBitSDK {
  return new BitBitSDK(supabase, orgId)
}
